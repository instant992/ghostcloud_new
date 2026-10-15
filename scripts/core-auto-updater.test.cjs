const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let status,meta,running,downloads,checks,fail,notice;
function load(){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/vpn/coreAutoUpdater.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out,setTimeout,clearTimeout,Date,require:n=>n==='react-native'?{Alert:{alert:()=>notice++}}:n.includes('settings/cores')?{fetchCoreMeta:async()=>{checks++;return meta}}:{getCpuAbi:()=> 'x86_64',isVpnRunning:async()=>running,getXrayJolyStatus:()=>status,getXrayLastStatus:()=>status,downloadXrayJoly:download,downloadXrayLast:download}});return out;}
async function download(){downloads++;if(fail)throw Error('offline');status={...status,downloaded:true,version:meta.version,size:meta.size};}
function reset(){status={downloaded:true,version:'26.10.10',size:100,pendingVersion:''};meta={version:'26.10.13-2347',size:200,sha256:'a'.repeat(64),url:'https://example.invalid'};running=false;downloads=checks=notice=0;fail=false;}
(async()=>{reset();let m=load();await Promise.all([m.ensureSelectedCoreUpdated('xray-joly'),m.ensureSelectedCoreUpdated('xray-joly')]);assert.equal(downloads,1);assert.equal(checks,1);await m.ensureSelectedCoreUpdated('xray-joly');assert.equal(checks,1);
reset();m=load();running=true;await m.ensureSelectedCoreUpdated('xray-last');assert.equal(checks,0);
reset();m=load();await m.ensureSelectedCoreUpdated('xray');assert.equal(checks,0);
reset();m=load();fail=true;await m.ensureSelectedCoreUpdated('xray-joly');assert.equal(downloads,1);
reset();m=load();meta=null;await m.ensureSelectedCoreUpdated('xray-joly');status.downloaded=false;await assert.rejects(m.ensureSelectedCoreUpdated('xray-joly'),/не установлено/);
reset();m=load();status.downloaded=false;fail=true;await assert.rejects(m.ensureSelectedCoreUpdated('xray-last'),/offline/);
reset();m=load();status.pendingVersion='26.10.13-2347';await m.ensureSelectedCoreUpdated('xray-joly');await m.ensureSelectedCoreUpdated('xray-joly');assert.equal(downloads,0);assert.equal(notice,1);
reset();m=load();meta.version='26.10.9';meta.size=100;await m.ensureSelectedCoreUpdated('xray-joly');assert.equal(downloads,0);
console.log('Core auto updater: Xray Joly/Last dedupe, cooldown, active VPN/core skips, fallback, pending notice, no downgrade PASS');})().catch(e=>{console.error(e);process.exitCode=1});
