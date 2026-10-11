const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};let fetched,manifest;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/screens/settings/cores.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,AbortController,setTimeout,clearTimeout,fetch:async url=>{fetched=url;return {ok:true,json:async()=>manifest}}});
(async()=>{
 manifest={cores:{mihomo:{version:'1.19.32',files:{x86_64:{path:'cores/mihomo-v1.19.32/x86_64/libclash.so',sha256:'a'.repeat(64),size:123}}}}};
 const m=await exportsObject.fetchCoreMeta('mihomo','x86_64');
 assert.equal(fetched,'https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/manifest.json');
 assert.equal(m.url,'https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/cores/mihomo-v1.19.32/x86_64/libclash.so');
 manifest.cores.mihomo.files.x86_64.path='../libclash.so';assert.equal(await exportsObject.fetchCoreMeta('mihomo','x86_64'),null);
 manifest={cores:{'sing-box':{version:'2',files:{x86:{path:'cores/sb/x86/libsingbox.so',sha256:'b',size:2}}}}};
 const s=await exportsObject.fetchCoreMeta('sing-box','x86');assert.ok(s.url.startsWith('https://gitlab.com/'));assert.ok(fetched.startsWith('https://gitlab.com/'));
 console.log('Mihomo metadata: GitHub routing, path validation, unrelated GitLab core unchanged PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
