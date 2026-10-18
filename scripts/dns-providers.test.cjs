const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('src/vpn/dns.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  { exports: exportsObject, module: { exports: exportsObject } }
);

for (const provider of exportsObject.DNS_PROVIDERS) {
  for (const server of provider.xray) {
    if (server.startsWith('https://')) {
      const url = new URL(server);
      assert.equal(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname), false, `${provider.id}: DoH must use a hostname`);
      assert.ok(url.pathname.length > 1, `${provider.id}: DoH path is empty`);
    }
  }
}

assert.equal(exportsObject.getDnsProvider('auto').xray[0], 'https://dns.google/dns-query');
assert.equal(exportsObject.getDnsProvider('google').xray[0], 'https://dns.google/dns-query');
assert.equal(exportsObject.getDnsProvider('cloudflare').xray[0], 'https://cloudflare-dns.com/dns-query');
console.log('dns-providers: valid hostname DoH endpoints');