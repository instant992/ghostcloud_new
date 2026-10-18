const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/vpn/parse.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const parseModule = { exports: {} };
vm.runInNewContext(source, {
  module: parseModule,
  exports: parseModule.exports,
  console,
  atob: undefined,
  escape,
  decodeURIComponent,
});
const { parseSubscriptionText } = parseModule.exports;

const xrayReality = {
  remarks: '🇫🇮 Финляндия 2',
  outbounds: [{
    tag: 'proxy',
    protocol: 'vless',
    settings: { vnext: [{
      address: 'finland2.ghostcloud.space',
      port: 443,
      users: [{ id: 'dfb94ae2-0483-4f0a-ab96-1f5d7e4194e1', flow: '', encryption: 'none' }],
    }] },
    streamSettings: {
      network: 'grpc',
      security: 'reality',
      grpcSettings: { serviceName: 'grpc-vless' },
      realitySettings: {
        serverName: 'finland2.ghostcloud.space',
        fingerprint: 'firefox',
        password: '91qH9qTnTPmJ4FJpCeDTF5uqDUHMYz5w490y_Lc-Tno',
        shortId: '221b405d0907dbfa',
      },
    },
  }],
};
const parsedReality = parseSubscriptionText(JSON.stringify(xrayReality));
assert.equal(parsedReality.nodes.length, 1);
assert.equal(parsedReality.nodes[0].protocol, 'vless');
assert.equal(parsedReality.nodes[0].security, 'reality');
assert.equal(parsedReality.nodes[0].publicKey, xrayReality.outbounds[0].streamSettings.realitySettings.password);
assert.equal(parsedReality.nodes[0].serviceName, 'grpc-vless');
assert.equal(parsedReality.nodes[0].name, '🇫🇮 Финляндия 2');

const xraySs = {
  outbounds: [{
    tag: 'proxy',
    protocol: 'shadowsocks',
    settings: { servers: [{
      address: 'est.foxcloud.space',
      port: 1234,
      method: 'chacha20-ietf-poly1305',
      password: 'secret',
    }] },
  }],
};
const parsedSs = parseSubscriptionText(JSON.stringify(xraySs));
assert.equal(parsedSs.nodes.length, 1);
assert.equal(parsedSs.nodes[0].protocol, 'ss');
assert.equal(parsedSs.nodes[0].address, 'est.foxcloud.space');
assert.equal(parsedSs.nodes[0].method, 'chacha20-ietf-poly1305');

console.log('xray-json-parse: ok');
