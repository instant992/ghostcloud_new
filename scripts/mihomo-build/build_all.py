import os, subprocess, pathlib, hashlib, json, shutil
root = pathlib.Path(__file__).resolve().parents[2]
source = root / 'core-src/mihomo-official'
commit = '88dcbf7f1614a67c3b36b848ee3592dfa92ada36'
if not source.exists():
    subprocess.run(['git', 'clone', '--branch', 'v1.19.32', '--depth', '1', 'https://github.com/MetaCubeX/mihomo.git', str(source)], check=True)
assert subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == commit
assert not subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True).strip(), 'Upstream must be clean'
ndk = 'C:\\Android\\Sdk\\ndk\\27.1.12297006\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\'
subprocess.run(['C:/Tools/go/bin/go.exe','mod','edit','-dropreplace=github.com/metacubex/sing-tun'],cwd=pathlib.Path(__file__).resolve().parent,check=True)
subprocess.run(['C:/Tools/go/bin/go.exe','mod','tidy'],cwd=pathlib.Path(__file__).resolve().parent,check=True)
# Make the upstream external fd explicitly BORROWED: dup only at tun.New,
# where ownership begins. Its Close then releases the internal duplicate.
modcache = subprocess.check_output(['C:/Tools/go/bin/go.exe','env','GOMODCACHE'],cwd=pathlib.Path(__file__).resolve().parent,text=True).strip()
tun_source = pathlib.Path(modcache) / 'github.com/metacubex/sing-tun@v0.4.27/tun_linux.go'
original = tun_source.read_text()
needle = 'nativeTun = &NativeTun{\n\t\t\ttunFd:   options.FileDescriptor,\n\t\t\ttunFile: os.NewFile(uintptr(options.FileDescriptor), "tun"),'
replacement = 'ownedFd, err := unix.Dup(options.FileDescriptor)\n\t\tif err != nil { return nil, err }\n\t\tnativeTun = &NativeTun{\n\t\t\ttunFd:   ownedFd,\n\t\t\ttunFile: os.NewFile(uintptr(ownedFd), "tun"),'
assert original.count(needle) == 1
scratch = root / 'core-src/mihomo-overlay'
scratch.mkdir(parents=True, exist_ok=True)
local_tun = scratch / 'sing-tun'
if local_tun.exists():
    for entry in local_tun.rglob('*'):
        if entry.is_file(): entry.chmod(0o666)
shutil.copytree(tun_source.parent, local_tun, dirs_exist_ok=True)
(local_tun / 'tun_linux.go').chmod(0o666)
(local_tun / 'tun_linux.go').write_text(original.replace(needle,replacement))
subprocess.run(['C:/Tools/go/bin/go.exe','mod','edit','-replace=github.com/metacubex/sing-tun=../../core-src/mihomo-overlay/sing-tun'],cwd=pathlib.Path(__file__).resolve().parent,check=True)
files = {}
for abi, arch, triple in [('arm64-v8a','arm64','aarch64-linux-android21'),('armeabi-v7a','arm','armv7a-linux-androideabi21'),('x86','386','i686-linux-android21'),('x86_64','amd64','x86_64-linux-android21')]:
    path = root / 'core-src/mihomo-dist/cores/mihomo-v1.19.32' / abi / 'libclash.so'
    path.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, GOOS='android', GOARCH=arch, CGO_ENABLED='1', CC=ndk+triple+'-clang.cmd', GOTMPDIR=str(pathlib.Path(os.environ.get('LOCALAPPDATA', 'C:/Users/Administrator/AppData/Local'))/'hermes/cache/scratch/go-mihomo'), GOMAXPROCS='4')
    pathlib.Path(env['GOTMPDIR']).mkdir(parents=True, exist_ok=True)
    if arch == 'arm': env['GOARM'] = '7'
    subprocess.run(['C:/Tools/go/bin/go.exe','build','-p=4','-buildmode=c-shared','-trimpath','-buildvcs=false','-ldflags=-s -w -checklinkname=0 -X github.com/metacubex/mihomo/constant.Version=v1.19.32 -extldflags=-Wl,-z,max-page-size=16384','-o',str(path),'.'],cwd=pathlib.Path(__file__).resolve().parent,env=env,check=True)
    data = path.read_bytes()
    assert data[:4] == b'\x7fELF'
    expected = {'arm64-v8a':(2,183), 'armeabi-v7a':(1,40), 'x86':(1,3), 'x86_64':(2,62)}[abi]
    assert (data[4], int.from_bytes(data[18:20], 'little')) == expected and data[5] == 1 and int.from_bytes(data[16:18], 'little') == 3
    subprocess.run([ndk+'llvm-readelf.exe','-h','-l',str(path)],check=True)
    symbols = subprocess.check_output([ndk+'llvm-nm.exe','-D','--defined-only',str(path)],text=True)
    for name in ['gcInit','gcStart','gcStop','gcVersion']:
        assert 'Java_expo_modules_xraycore_GcCore_'+name in symbols
    files[abi] = {'path':str(path.relative_to(root/'core-src/mihomo-dist')).replace('\\','/'), 'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)}
    print(abi, files[abi],flush=True)
    # This Windows build host has limited free space; ABI caches are disposable.
    subprocess.run(['C:/Tools/go/bin/go.exe','clean','-cache'],cwd=pathlib.Path(__file__).resolve().parent,env=env,check=True)
manifest = {'cores':{'mihomo':{'version':'1.19.32','upstream':'MetaCubeX/mihomo','tag':'v1.19.32','commit':'88dcbf7f1614a67c3b36b848ee3592dfa92ada36','prerelease':False,'files':files}}}
(root/'core-src/mihomo-dist/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('ALL_FOUR_ABIS_VERIFIED',flush=True)
