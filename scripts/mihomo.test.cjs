const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const cache = {};
function load(path) {
  if (cache[path]) return cache[path];
  const exports = cache[path] = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code, {exports, require: name => load(`src/vpn/${name.replace('./','')}.ts`)});
  return exports;
}
const {buildMihomoProxy: proxy, buildMihomoConfig: config, supportedByMihomo: supported} = load('src/vpn/mihomoConfig.ts');
const {clashProxyToNode: clash, parseShareLink: parse} = load('src/vpn/parse.ts');
const base = {id:'test',name:'test',address:'127.0.0.1',port:443,protocol:'vless',uuid:'00000000-0000-4000-8000-000000000001',network:'tcp',security:'tls',sni:'example.com',supportedByXray:true,raw:''};
let count=0;
function check(fn) { fn(); count++; }
check(()=>assert.equal(proxy(base).servername,'example.com'));
check(()=>assert.equal(proxy({...base,security:'reality',publicKey:'key',shortId:'ab'} )['reality-opts']['short-id'],'ab'));
check(()=>assert.equal(proxy({...base,network:'ws',path:'/quoted"\n',host:'host'})['ws-opts'].path,'/quoted"\n'));
check(()=>assert.equal(proxy({...base,network:'grpc',serviceName:'svc'})['grpc-opts']['grpc-service-name'],'svc'));
check(()=>assert.equal(proxy({...base,network:'h2',host:'h'})['h2-opts'].host[0],'h'));
check(()=>assert.equal(proxy({...base,protocol:'vmess',alterId:7}).alterId,7));
check(()=>assert.equal(proxy({...base,protocol:'trojan',password:'p'}).password,'p'));
check(()=>assert.equal(proxy({...base,protocol:'ss',security:'none',method:'aes-128-gcm',password:'p'}).cipher,'aes-128-gcm'));
check(()=>assert.equal(proxy({...base,protocol:'hysteria2',password:'p',obfs:'salamander',obfsPassword:'ob',pinSha256:'pin'})['obfs-password'],'ob'));
check(()=>{const p = proxy({...base,network:'xhttp',path:'/stream',host:'cdn.example.com',mode:'auto',xhttpOpts:{'sc-max-each-post-bytes':'1m'}}); assert.equal(p.network,'xhttp'); assert.equal(p['xhttp-opts'].path,'/stream'); assert.equal(p['xhttp-opts'].host,'cdn.example.com'); assert.equal(p['xhttp-opts'].mode,'auto');});
for (const network of ['splithttp','kcp','quic','unknown']) check(()=>{assert.equal(supported({...base,network}),false);assert.throws(()=>proxy({...base,network}));});
check(()=>assert.throws(()=>proxy({...base,headerType:'srtp'})));
check(()=>assert.throws(()=>proxy({...base,encryption:'mlkem768x25519plus.foo'})));
check(()=>assert.equal(proxy({...base,protocol:'trojan',password:'p',security:'reality',publicKey:'key'})['reality-opts']['public-key'],'key'));
check(()=>assert.throws(()=>proxy({...base,protocol:'ss',password:'p',network:'ws',security:'none'})));
check(()=>assert.throws(()=>proxy({...base,protocol:'hysteria2',password:'p',obfs:'unknown'})));
check(()=>assert.throws(()=>config(base,undefined,['bad,PROXY'])));
check(()=>{const c=JSON.parse(config(base,undefined,['example.org'],'whitelist'));assert.equal(c.rules[0],'DOMAIN-SUFFIX,example.org,DIRECT');assert.equal(c.rules.at(-1),'MATCH,PROXY');assert.equal(c.tun['auto-detect-interface'],false);assert.equal(c.dns['enhanced-mode'],'fake-ip');assert.ok(Object.keys(c['rule-providers']).length>0);});
check(()=>assert.equal(proxy(clash({type:'vmess',server:'localhost',port:443,uuid:base.uuid,cipher:'chacha20-poly1305'})).cipher,'chacha20-poly1305'));
  check(()=>assert.equal(proxy({...base,network:'httpupgrade',path:'/upgrade'})['ws-opts']['v2ray-http-upgrade'],true));
  check(()=>assert.equal(proxy({...base,headerType:'http',path:'/http'}).network,'http'));
check(()=>{const p=proxy(clash({type:'vless',server:'localhost',port:443,uuid:base.uuid,network:'h2',tls:true,alpn:['h2'],'h2-opts':{path:'/h2',host:['cdn.example']}}));assert.equal(p['h2-opts'].path,'/h2');assert.equal(p['h2-opts'].host[0],'cdn.example');assert.equal(p.alpn[0],'h2');});
check(()=>assert.equal(proxy({...base,security:'reality',publicKey:'key'})['client-fingerprint'],'chrome'));
// Fixtures used by native parser tests: no real server credentials.
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(['vless','vmess','trojan','ss','hysteria2'].map(protocol=>JSON.parse(config({...base,protocol,security:protocol==='ss'?'none':'tls',password:'p',method:'aes-128-gcm'})))));
console.log(`Mihomo: ${count} generator checks passed`);
