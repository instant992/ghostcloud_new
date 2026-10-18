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

const configSource = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/vpn/xrayConfig.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const configModule = { exports: {} };
vm.runInNewContext(configSource, {
  module: configModule,
  exports: configModule.exports,
  console,
  require: (id) => {
    if (id === './dns') return { getDnsProvider: () => ({ xray: ['8.8.8.8'] }) };
    if (id === '../settings') return { getAntiDpi: () => false };
    if (id === './roscomRouting') return { xrayRoscomRules: () => [] };
    if (id === './native') return { accessLogPath: () => '', errorLogPath: () => '' };
    throw new Error(`unexpected import: ${id}`);
  },
});
const { buildOutbound } = configModule.exports;

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

const uriNode = parseSubscriptionText(
  'vless://dfb94ae2-0483-4f0a-ab96-1f5d7e4194e1@ge.ghostcloud.space:443?encryption=none&flow=xtls-rprx-vision&type=tcp&security=reality&sni=finl.ghostcloud.space&fp=chrome&pbk=public-key&sid=1a1df1c87d34dbf8#%F0%9F%9A%80%20%D0%9B%D1%83%D1%87%D1%88%D0%B8%D0%B9%20%D1%81%D0%B5%D1%80%D0%B2%D0%B5%D1%80'
).nodes[0];
const uriOutbound = buildOutbound(uriNode);
assert.equal(uriOutbound.settings.vnext[0].users[0].flow, 'xtls-rprx-vision');
assert.equal(uriOutbound.streamSettings.realitySettings.serverName, 'finl.ghostcloud.space');
assert.equal(uriOutbound.streamSettings.realitySettings.publicKey, 'public-key');
assert.equal(uriOutbound.streamSettings.realitySettings.shortId, '1a1df1c87d34dbf8');
assert.equal(uriOutbound.streamSettings.finalmask, undefined);

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
