const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual store, replacing only its native/settings/config boundaries.
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/vpn/pingStore.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const node = (id, overrides = {}) => ({ id, name: id, address: `${id}.invalid`, port: 443,
  protocol: 'vless', supportedByXray: true, ...overrides });
function harness(options = {}) {
  let now = 0, nextId = 0;
  const timers = new Map();
  const calls = { tcp: [], quic: [], url: [], vpn: 0 };
  const later = (ms, value) => new Promise(resolve => schedule(() => resolve(value), ms));
  const schedule = (fn, ms) => { const id = ++nextId; timers.set(id, { at: now + ms, fn }); return id; };
  const never = () => new Promise(() => {});
  const native = {
    tcpPing: (...args) => { calls.tcp.push(args); return options.tcp ? options.tcp(...args, later) : later(100, 100); },
    quicPing: (...args) => { calls.quic.push(args); return options.quic ? options.quic(...args, later) : later(80, 80); },
    pingNodesBatch: (...args) => { calls.url.push(args); return options.url ? options.url(...args, later) : later(8000, args[0].map(() => ({ success: true, delay: 8000 }))); },
    isVpnRunning: () => { calls.vpn++; return options.vpnPromise ? options.vpnPromise() : Promise.resolve(!!options.vpn); },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, console, setTimeout: schedule, clearTimeout: id => timers.delete(id),
    require: name => {
      if (name === './native') return native;
      if (name === '../settings') return { getPingMethod: () => options.method || 'tcp',
        getPingUrlCandidates: () => options.urls || ['https://probe.invalid/204'] };
      if (name === './xrayConfig') return { buildOutbound: n => ({ tag: 'proxy', id: n.id }) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const advance = async ms => {
    const end = now + ms;
    await flush();
    while (true) {
      const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); await flush();
    }
    now = end; await flush();
  };
  const settle = async promise => {
    let done = false, failure;
    promise.then(() => { done = true; }, e => { done = true; failure = e; });
    await flush();
    for (let i = 0; !done && i < 1000; i++) {
      const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
      assert.ok(next, 'operation hangs without a watchdog');
      await advance(next.at - now);
    }
    assert.ok(done, 'operation did not finish');
    if (failure) throw failure;
    return now;
  };
  return { store: exports, calls, later, never, advance, settle, flush, timers };
}
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('TCP failed handshakes never enter the 30-second URL batch path', async () => {
  const h = harness({ tcp: () => Promise.reject(new Error('refused')), url: () => new Promise(() => {}) });
  const elapsed = await h.settle(h.store.pingAll([node('failed')]));
  assert.equal(h.calls.url.length, 0, `TCP mode invoked URL; wave took ${elapsed} ms`);
  assert.ok(elapsed <= 1700, `TCP ceiling exceeded: ${elapsed} ms`);
  assert.equal(h.calls.tcp.length, 1);
  assert.equal(h.store.getSnapshot().failed.delay, -1);
});

test('TCP LTE batch is explicitly unmeasurable, not dead or URL-tested', async () => {
  const h = harness();
  await h.settle(h.store.pingAll([node('lte', { source: 'lte' })]));
  assert.equal(h.calls.url.length, 0);
  assert.equal(h.calls.tcp.length, 0);
  assert.match(h.store.getSnapshot().lte.error, /LTE.*TCP/);
});

test('TCP single LTE honors the selected method', async () => {
  const h = harness();
  await h.settle(h.store.pingOne(node('lte', { source: 'lte' })));
  assert.equal(h.calls.url.length, 0);
  assert.equal(h.calls.tcp.length, 0);
  assert.match(h.store.getSnapshot().lte.error, /LTE.*TCP/);
});

test('URL single normal node falls back to TCP while VPN is up', async () => {
  const h = harness({ method: 'url', vpn: true });
  await h.settle(h.store.pingOne(node('normal')));
  assert.equal(h.calls.url.length, 0);
  assert.equal(h.calls.tcp.length, 1);
  assert.equal(h.store.getSnapshot().normal.delay, 100);
});

test('TCP ceiling is 1700 ms independent of target count and lost native promises', async () => {
  for (const count of [1, 20, 100]) {
    const h = harness({ tcp: () => new Promise(() => {}), vpnPromise: () => new Promise(() => {}) });
    const nodes = Array.from({ length: count }, (_, i) => node(`n${i}`));
    const wave = h.store.pingAll(nodes);
    await h.flush();
    assert.equal(h.calls.tcp.length, count, 'all probes start before any completes');
    assert.equal(h.calls.vpn, 0, 'TCP does not depend on VPN-status bridge');
    const elapsed = await h.settle(wave);
    assert.equal(elapsed, 1700);
    assert.equal(h.calls.url.length, 0);
    assert.equal(h.store.isRunning(), false);
    assert.ok(nodes.every(n => h.store.getSnapshot()[n.id].status === 'done'));
    assert.equal(h.timers.size, 0);
    await h.settle(h.store.pingAll([node('next')]));
    assert.equal(h.store.isRunning(), false);
  }
});

test('TCP single success and lost promise never use URL', async () => {
  for (const lost of [false, true]) {
    const h = harness({ tcp: lost ? () => new Promise(() => {}) : undefined });
    const elapsed = await h.settle(h.store.pingOne(node('single')));
    assert.equal(elapsed, lost ? 1700 : 100);
    assert.equal(h.calls.url.length, 0);
    assert.equal(h.calls.tcp.length, 1);
    assert.equal(h.calls.tcp[0][2], 1500);
    assert.equal(h.store.getSnapshot().single.delay, lost ? -1 : 100);
  }
});

test('TCP publishes fast results while slow probes remain pending', async () => {
  const h = harness({ tcp: (host, port, cap, later) => host.startsWith('fast') ? later(50, 50) : new Promise(() => {}) });
  const wave = h.store.pingAll([node('fast'), node('slow')]);
  await h.advance(50);
  assert.equal(h.store.getSnapshot().fast.delay, 50);
  assert.equal(h.store.getSnapshot().slow.status, 'pending');
  await h.settle(wave);
  assert.equal(h.calls.url.length, 0);
});

test('hysteria uses QUIC in single and batch including LTE source', async () => {
  for (const method of ['tcp', 'url']) {
    const h = harness({ method });
    const hy = node('hy', { protocol: 'hysteria2', source: 'lte', supportedByXray: false });
    await h.settle(h.store.pingOne(hy));
    await h.settle(h.store.pingAll([hy]));
    assert.equal(h.calls.quic.length, 2);
    assert.equal(h.calls.tcp.length, 0);
    assert.equal(h.calls.url.length, 0);
    assert.equal(h.store.getSnapshot().hy.delay, 80);
  }
});

test('URL mode still measures LTE and normal nodes through proxy with VPN off', async () => {
  const h = harness({ method: 'url' });
  const lte = node('lte', { source: 'lte' });
  await h.settle(h.store.pingOne(lte));
  await h.settle(h.store.pingAll([lte, node('normal')]));
  assert.equal(h.calls.url.length, 2);
  assert.equal(h.calls.url[1][0].length, 2);
  assert.equal(h.calls.tcp.length, 0);
  assert.equal(h.store.getSnapshot().lte.delay, 8000);
});

test('URL mode with VPN up excludes LTE and measures normal nodes via TCP', async () => {
  const h = harness({ method: 'url', vpn: true });
  const lte = node('lte', { source: 'lte' });
  await h.settle(h.store.pingOne(lte));
  await h.settle(h.store.pingAll([lte, node('normal')]));
  assert.equal(h.calls.url.length, 0);
  assert.equal(h.calls.tcp.length, 1);
  assert.match(h.store.getSnapshot().lte.error, /вкл\. VPN/);
});

test('URL batch retains five-node chunks and incremental results', async () => {
  const h = harness({ method: 'url' });
  const wave = h.store.pingAll(Array.from({ length: 6 }, (_, i) => node(`n${i}`)));
  await h.advance(8000);
  assert.equal(h.store.getSnapshot().n0.delay, 8000);
  assert.equal(h.store.getSnapshot().n5.status, 'pending');
  await h.settle(wave);
  assert.deepEqual(h.calls.url.map(c => c[0].length), [5, 1]);
});

test('superseded URL chunk cannot overwrite a completed TCP wave', async () => {
  let method = 'url';
  const h = harness({ get method() { return method; } });
  const old = h.store.pingAll([node('same')]);
  await h.flush();
  method = 'tcp';
  await h.settle(h.store.pingAll([node('same')]));
  assert.equal(h.store.getSnapshot().same.delay, 100);
  await h.settle(old);
  assert.equal(h.store.getSnapshot().same.delay, 100, 'late URL chunk must not replace newer TCP result');
});

test('URL pool switching and transient retry still work', async () => {
  let calls = 0;
  const h = harness({ method: 'url', urls: ['https://first.invalid', 'https://second.invalid'],
    url: (payload, url, later) => later(10, payload.map(() => ++calls < 3
      ? { success: false, delay: -1, error: 'closed pipe' }
      : { success: true, delay: 22 })) });
  await h.settle(h.store.pingAll([node('normal')]));
  assert.deepEqual(h.calls.url.map(c => c[1]), ['https://first.invalid', 'https://second.invalid', 'https://second.invalid']);
  assert.equal(h.store.getSnapshot().normal.delay, 22);
});

test('superseded URL retry cannot overwrite newer TCP results', async () => {
  let method = 'url', count = 0;
  const h = harness({ get method() { return method; }, url: (payload, url, later) =>
    ++count === 1 ? later(10, [{ success: false, delay: -1, error: 'closed pipe' }])
      : later(8000, [{ success: true, delay: 8000 }]) });
  const old = h.store.pingAll([node('same')]);
  await h.advance(410); // first failure and retry pause; retry now in flight
  assert.equal(h.calls.url.length, 2);
  method = 'tcp';
  await h.settle(h.store.pingAll([node('same')]));
  await h.settle(old);
  assert.equal(h.store.getSnapshot().same.delay, 100);
});

(async () => {
  let failures = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (e) { failures++; console.error(`FAIL ${name}\n${e.stack}`); }
  }
  console.log(`${tests.length - failures}/${tests.length} tests passed`);
  process.exitCode = failures ? 1 : 0;
})();
