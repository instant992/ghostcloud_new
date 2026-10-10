import os, subprocess, pathlib, hashlib, json
root = pathlib.Path(__file__).resolve().parents[2]
source = root / 'core-src/xray-official'
commit = '701af60772cda123492f86e383e1fdba066614a9'
if not source.exists():
    subprocess.run(['git', 'clone', '--branch', 'v26.10.10', '--depth', '1', 'https://github.com/XTLS/Xray-core.git', str(source)], check=True)
assert subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == commit
assert not subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True).strip(), 'Upstream must be clean'
ndk = 'C:\\Android\\Sdk\\ndk\\27.1.12297006\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\'
files = {}
for abi, arch, triple in [('arm64-v8a','arm64','aarch64-linux-android21'),('armeabi-v7a','arm','armv7a-linux-androideabi21'),('x86','386','i686-linux-android21'),('x86_64','amd64','x86_64-linux-android21')]:
    path = root / 'core-src/xray-last-dist/cores/xray-last-v26.10.10' / abi / 'libxraylast.so'
    path.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, GOOS='android', GOARCH=arch, CGO_ENABLED='1', CC=ndk+triple+'-clang.cmd')
    if arch == 'arm': env['GOARM'] = '7'
    subprocess.run(['C:/Tools/go/bin/go.exe','build','-buildmode=c-shared','-trimpath','-buildvcs=false','-ldflags=-s -w -checklinkname=0 -extldflags=-Wl,-z,max-page-size=16384','-o',str(path),'.'],cwd=pathlib.Path(__file__).resolve().parent,env=env,check=True)
    data = path.read_bytes()
    assert data[:4] == b'\x7fELF'
    expected = {'arm64-v8a':(2,183), 'armeabi-v7a':(1,40), 'x86':(1,3), 'x86_64':(2,62)}[abi]
    assert (data[4], int.from_bytes(data[18:20], 'little')) == expected and data[5] == 1 and int.from_bytes(data[16:18], 'little') == 3
    subprocess.run([ndk+'llvm-readelf.exe','-h','-l',str(path)],check=True)
    symbols = subprocess.check_output([ndk+'llvm-nm.exe','-D','--defined-only',str(path)],text=True)
    for name in ['gcInit','gcStart','gcStop','gcVersion']:
        assert 'Java_expo_modules_xraycore_GcXrayLastCore_'+name in symbols
    files[abi] = {'path':str(path.relative_to(root/'core-src/xray-last-dist')).replace('\\','/'), 'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)}
    print(abi, files[abi],flush=True)
manifest = {'cores':{'xray-last':{'version':'26.10.10','upstream':'XTLS/Xray-core','tag':'v26.10.10','commit':'701af60772cda123492f86e383e1fdba066614a9','prerelease':True,'files':files}}}
(root/'core-src/xray-last-dist/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('ALL_FOUR_ABIS_VERIFIED',flush=True)
