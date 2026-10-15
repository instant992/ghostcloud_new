const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};let fetched,manifest;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/screens/settings/cores.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,AbortController,setTimeout,clearTimeout,fetch:async url=>{fetched=url;return {ok:true,json:async()=>manifest}}});
(async()=>{
 manifest={cores:{'xray-joly':{version:'26.10.13-2347',files:{x86_64:{path:'cores/xray-joly-v26.10.13-2347/x86_64/libxrayjoly.so',sha256:'a'.repeat(64),size:123}}}}};
 const m=await exportsObject.fetchCoreMeta('xray-joly','x86_64');
 assert.equal(fetched,'https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/manifest.json');
 assert.equal(m.url,'https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/cores/xray-joly-v26.10.13-2347/x86_64/libxrayjoly.so');
 manifest.cores['xray-joly'].files.x86_64.path='cores/xray-joly-v26.10.13-2347-4ab04d0-38296044511-1/x86_64/libxrayjoly.so';
 const published=await exportsObject.fetchCoreMeta('xray-joly','x86_64');
 assert.equal(published.url,'https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/cores/xray-joly-v26.10.13-2347-4ab04d0-38296044511-1/x86_64/libxrayjoly.so');
 manifest.cores['xray-joly'].files.x86_64.path='../libxrayjoly.so';assert.equal(await exportsObject.fetchCoreMeta('xray-joly','x86_64'),null);
 manifest={cores:{'xray-last':{version:'26.10.10',files:{x86_64:{path:'cores/xray-last-v26.10.10/x86_64/libxraylast.so',sha256:'a'.repeat(64),size:40000000}}}}};
 const x=await exportsObject.fetchCoreMeta('xray-last','x86_64');assert.ok(x.url.startsWith('https://raw.githubusercontent.com/instant992/'));assert.ok(fetched.startsWith('https://raw.githubusercontent.com/'));
 manifest.cores['xray-last'].files.x86_64.sha256='bad';assert.equal(await exportsObject.fetchCoreMeta('xray-last','x86_64'),null);
 console.log('Xray metadata: Joly/Last GitHub routing, immutable path validation PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
