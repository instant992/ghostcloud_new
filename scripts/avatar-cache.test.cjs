// Run against the actual TypeScript helper without loading native Expo modules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const sourcePath = require('node:path').join(__dirname, '../src/avatarCache.ts');
function load() {
  assert.ok(fs.existsSync(sourcePath), 'persistent avatar helper must exist');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: () => ({}), setTimeout, clearTimeout, Date, URL });
  return exports;
}
function mockDisk() {
  const files = new Map();
  let calls = 0;
  let reply = { status: 200, mimeType: 'image/png', md5: 'a'.repeat(32), body: 'iVBORw0KGgoAAAANSUhEUg==' };
  let pending;
  const disk = {
    documentDirectory: 'file:///documents/',
    EncodingType: { Base64: 'base64' },
    FileSystemSessionType: { FOREGROUND: 1 },
    async makeDirectoryAsync() {},
    async getInfoAsync(uri) { return files.has(uri) ? { exists: true, size: 100, isDirectory: false } : { exists: false }; },
    async readAsStringAsync(uri, opts) { if (!files.has(uri)) throw Error('missing'); return files.get(uri); },
    async writeAsStringAsync(uri, value) { files.set(uri, value); },
    async moveAsync({ from, to }) { if (!files.has(from)) throw Error('missing'); files.set(to, files.get(from)); files.delete(from); },
    async deleteAsync(uri) { for (const key of files.keys()) if (key === uri || key.startsWith(uri + '/')) files.delete(key); },
    createDownloadResumable(url, uri, opts) {
      calls++;
      return {
        async downloadAsync() { if (pending) await pending; if (reply instanceof Error) throw reply; files.set(uri, reply.body); return { ...reply, uri, headers: {} }; },
        async cancelAsync() {},
      };
    },
  };
  return { disk, files, get calls() { return calls; }, setReply(v) { reply = v; }, hold(p) { pending = p; } };
}
async function main() {
  const { createAvatarCache, avatarOwner, resolveAvatarUrl } = load();
  assert.equal(avatarOwner({ subUrl: 'credential', tgId: '42' }), require('node:crypto').createHash('sha256').update(JSON.stringify(['credential', '42'])).digest('hex'));
  assert.equal(resolveAvatarUrl('https://example.test', '/image/a'), 'https://example.test/image/a');
  assert.equal(resolveAvatarUrl('https://example.test', 'javascript:alert(1)'), null);
  assert.equal(resolveAvatarUrl('https://example.test', 'https://user:secret@example.test/a'), null);
  const m = mockDisk();
  const cache = createAvatarCache(m.disk, { now: () => 100 });
  const image = await cache.load('alice', 'https://example.test/avatar');
  assert.match(image, /^file:\/\/\/documents\//);
  assert.equal(await cache.load('alice', 'https://example.test/avatar'), image);
  assert.equal(m.calls, 1, 'memory reuse avoids another download');
  const restarted = createAvatarCache(m.disk, { now: () => 101 });
  assert.equal(await restarted.load('alice', 'https://example.test/avatar'), image);
  assert.equal(m.calls, 1, 'disk survives process restart');
  console.log('PASS memory reuse and restart recovery');
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const png = (hash) => ({ status: 200, mimeType: 'image/png', md5: hash.repeat(32), body: 'iVBORw0KGgoAAAANSUhEUg==' });
  // Same URL upload bypasses freshness; old image stays until replacement commits.
  m.setReply(png('b'));
  assert.equal(await cache.load('alice', 'https://example.test/avatar', true), image);
  await settle();
  const changed = cache.peek('alice');
  assert.notEqual(changed, image);
  assert.equal(m.calls, 2);
  console.log('PASS same URL changes and stale-while-refresh');
  m.setReply(png('c'));
  await cache.load('alice', 'https://example.test/new-avatar');
  await settle();
  assert.notEqual(cache.peek('alice'), changed);
  const latest = cache.peek('alice');
  console.log('PASS changed URL refresh');
  for (const reply of [new Error('offline'), { ...png('d'), status: 404 }, { ...png('d'), mimeType: 'text/html' }, { ...png('d'), body: 'PGh0bWw+' }, { ...png('d'), md5: undefined }]) {
    m.setReply(reply);
    await cache.load('alice', 'https://example.test/new-avatar', true);
    await settle();
    assert.equal(cache.peek('alice'), latest);
  }
  console.log('PASS offline and invalid responses preserve image');
  const offlineRestart = createAvatarCache(m.disk, { now: () => 2000000 });
  m.setReply(new Error('offline'));
  assert.equal(await offlineRestart.load('alice', 'https://example.test/new-avatar'), latest);
  await settle();
  assert.equal(offlineRestart.peek('alice'), latest);
  console.log('PASS stale disk recovery offline');
  const n = mockDisk();
  const concurrent = createAvatarCache(n.disk);
  await Promise.all(Array.from({ length: 10 }, () => concurrent.load('bob', 'https://example.test/shared')));
  assert.equal(n.calls, 1);
  assert.equal(concurrent.peek('alice'), null);
  assert.notEqual(await concurrent.load('alice', 'https://example.test/shared'), concurrent.peek('bob'));
  console.log('PASS concurrent dedupe and account isolation');
  let release;
  n.hold(new Promise(resolve => { release = resolve; }));
  const late = concurrent.load('eve', 'https://example.test/late');
  await settle();
  await concurrent.clear('eve');
  release();
  await late;
  assert.equal(concurrent.peek('eve'), null);
  assert.ok(!Array.from(n.files.keys()).some(key => key.includes('/eve/')));
  console.log('PASS removal invalidates in-flight download');
  await concurrent.clear('bob');
  assert.equal(concurrent.peek('bob'), null);
  assert.ok(!Array.from(n.files.keys()).some(key => key.includes('/bob/')));
  n.hold(null);
  await concurrent.load('bob', 'https://example.test/shared');
  assert.ok(concurrent.peek('bob'), 'account can add avatar after removal');
  console.log('PASS removal clears disk and allows re-add');
  const lateDisk = mockDisk();
  let lateRelease;
  lateDisk.hold(new Promise(resolve => { lateRelease = resolve; }));
  const bounded = createAvatarCache(lateDisk.disk, { timeoutMs: 5 });
  assert.equal(await bounded.load('late', 'https://example.test/a'), null);
  lateRelease();
  await settle();
  assert.equal(bounded.peek('late'), null);
  assert.ok(!Array.from(lateDisk.files.keys()).some(key => key.includes('pending')));
  console.log('PASS timeout and late completion cleanup');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
