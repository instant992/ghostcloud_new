const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let response;
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync('src/screens/settings/xrayLast.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(code, { exports: exportsObject, setTimeout, clearTimeout, AbortController,
  fetch: async () => response,
  require: name => name === 'react' ? {} : {},
});
(async () => {
  const { compareCoreVersions: compare, fetchLatestXrayVersion: latest } = exportsObject;
  assert.equal(compare('26.10.10', '26.9.30'), 1);
  assert.equal(compare('v26.10.10', '26.10.10'), 0);
  assert.equal(compare('26.9.9', '26.10.10'), -1);
  assert.equal(compare('unknown', '26.10.10'), 0);
  response = { ok: true, json: async () => [{ tag_name: 'v99.1.1', draft: true }, { tag_name: 'v26.10.10', draft: false, prerelease: true }, { tag_name: 'v26.3.27', draft: false }] };
  assert.equal(await latest(), '26.10.10');
  response = { ok: false, status: 403 };
  await assert.rejects(latest(), /403/);
  response = { ok: true, json: async () => [] };
  await assert.rejects(latest(), /не найден/);
  response = { ok: true, json: async () => ({}) };
  await assert.rejects(latest(), /Некорректный/);
  console.log('Xray Last: version ordering, prerelease selection, draft filtering and API failures passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
