const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/update.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const payload = (version = '0.0.2') => ({ update_available: true, version, changelog: '- Fix\nMore', apk_url: 'https://vpnghost.space/api/app/download?abi=arm64-v8a', apk_size: 100 });
function harness(options = {}) {
  const exports = {}, calls = { fetch: [], install: [], download: [] }, queue = [];
  let progress;
  const download = deferred();
  vm.runInNewContext(source, { exports, URL, AbortController, setTimeout, clearTimeout,
    fetch: async url => { calls.fetch.push(url); const data = await (queue.length ? queue.shift() : payload()); if (data instanceof Error) throw data; return { ok: true, json: async () => data }; },
    require: name => {
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name === 'expo-application') return { nativeApplicationVersion: '0.0.1' };
      if (name === './api') return { BASE_URL: 'https://ghostcloud.space' };
      if (name === './vpn/native') return { getCpuAbi: () => options.abi || 'arm64-v8a', canInstallPackages: () => options.permission !== false,
        openInstallPermissionSettings: () => {}, installApk: async p => { calls.install.push(p); return true; } };
      if (name === 'expo-file-system/legacy') return { cacheDirectory: 'file:///cache/', getInfoAsync: async () => ({ exists: false }),
        createDownloadResumable: (url, uri, opts, cb) => { calls.download.push(url); progress = cb; return { downloadAsync: () => download.promise }; } };
      throw Error(name);
    },
  });
  return { store: exports, calls, queue, download, progress: p => progress(p), flush: async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); } };
}
test('cold entry and each active transition check, duplicate active events do not', async () => {
  const h = harness(); let callback, removed = false;
  const appState = { currentState: 'active', addEventListener: (name, cb) => { callback = cb; return { remove: () => { removed = true; } }; } };
  const stop = h.store.startUpdateChecks(appState); await h.flush();
  assert.equal(h.calls.fetch.length, 1);
  callback('active'); await h.flush(); assert.equal(h.calls.fetch.length, 1);
  callback('background'); callback('active'); await h.flush(); assert.equal(h.calls.fetch.length, 2);
  stop(); assert.ok(removed);
});

test('concurrent entry checks share one request', async () => {
  const h = harness(), pending = deferred(); h.queue.push(pending.promise);
  const a = h.store.checkForUpdate({ silent: true }), b = h.store.checkForUpdate();
  assert.equal(h.calls.fetch.length, 1);
  pending.resolve(payload()); await Promise.all([a, b]);
  assert.equal(h.store.getSnapshot().status, 'available');
});
test('newer/equal/older and foreground retry reflect actual versions', async () => {
  const h = harness();
  for (const [version, status] of [['0.0.2', 'available'], ['0.0.1', 'up-to-date'], ['0.0.0', 'up-to-date'], ['0.3.13', 'available']]) {
    h.queue.push(payload(version)); await h.store.checkForUpdate({ silent: true });
    assert.equal(h.store.getSnapshot().status, status);
  }
  assert.equal(h.calls.fetch.length, 4);
});
test('failed refresh or download never removes a known update', async () => {
  const h = harness(); const info = await h.store.checkForUpdate();
  h.queue.push(Error('offline')); await h.store.checkForUpdate();
  assert.equal(h.store.getSnapshot().info.version, info.version);
  const d = h.store.downloadAndInstall(info); await h.flush();
  h.download.resolve({ status: 503, uri: 'file:///cache/error.apk' }); await d;
  assert.equal(h.calls.install.length, 0);
  assert.equal(h.store.getSnapshot().status, 'available');
  assert.ok(h.store.getSnapshot().message);
});
test('entry during download and stale check cannot overwrite progress', async () => {
  const h = harness(), info = await h.store.checkForUpdate();
  const pending = deferred(); h.queue.push(pending.promise);
  const check = h.store.checkForUpdate({ silent: true });
  const d = h.store.downloadAndInstall(info); await h.flush();
  h.progress({ totalBytesExpectedToWrite: 100, totalBytesWritten: 40 });
  const reentry = h.store.checkForUpdate({ silent: true });
  assert.equal(h.calls.fetch.length, 2);
  pending.resolve(payload('0.0.9')); await Promise.all([check, reentry]);
  assert.equal(h.store.getSnapshot().status, 'downloading');
  assert.equal(h.store.getSnapshot().progress, 0.4);
  await h.store.downloadAndInstall(info); assert.equal(h.calls.download.length, 1);
  h.download.resolve({ status: 200, uri: 'file:///cache/update.apk' }); await d;
  assert.equal(h.store.getSnapshot().info.version, info.version);
  assert.equal(h.calls.install.length, 1);
});
test('x86 and unknown ABI never fall back to an ARM APK', async () => {
  for (const abi of ['x86', 'x86_64', 'unknown']) {
    const h = harness({ abi }); await h.store.checkForUpdate();
    assert.equal(h.calls.fetch.length, 0); assert.equal(h.store.getSnapshot().status, 'error');
    await h.store.downloadAndInstall({ version: '0.0.2', apkUrl: payload().apk_url });
    assert.equal(h.calls.download.length, 0);
  }
});
test('only existing HTTPS backend download contract is accepted', async () => {
  for (const apk_url of ['https://evil.invalid/api/app/download', 'http://vpnghost.space/api/app/download', 'https://vpnghost.space/other.apk', 'https://vpnghost.space/api/app/download?abi=armeabi-v7a']) {
    const h = harness(); h.queue.push({ ...payload(), apk_url }); await h.store.checkForUpdate();
    assert.equal(h.store.getSnapshot().status, 'error');
    await h.store.downloadAndInstall({ version: '0.0.2', apkUrl: apk_url }); assert.equal(h.calls.download.length, 0);
  }
});
test('missing feed, network failure, malformed version are not fake updates', async () => {
  for (const data of [{ update_available: false }, Error('offline'), payload('garbage')]) {
    const h = harness(); h.queue.push(data); await h.store.checkForUpdate();
    assert.notEqual(h.store.getSnapshot().status, 'available');
  }
});
test('unknown-sources permission returns to actionable banner', async () => {
  const h = harness({ permission: false }), info = await h.store.checkForUpdate();
  const d = h.store.downloadAndInstall(info); await h.flush();
  h.download.resolve({ status: 200, uri: 'file:///cache/update.apk' }); await d;
  assert.equal(h.store.getSnapshot().status, 'available'); assert.equal(h.calls.install.length, 0);
  assert.ok(h.store.getSnapshot().message);
});
