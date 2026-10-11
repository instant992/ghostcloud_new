# GhostCloud Mihomo JNI (official v1.19.32)

Pinned MetaCubeX/mihomo commit: `88dcbf7f1614a67c3b36b848ee3592dfa92ada36`.

Windows prerequisites: Go at `C:/Tools/go/bin/go.exe` (module requests Go 1.27), NDK 27.1.12297006 at `C:/Android/Sdk/ndk`, Python. Run from client root:

```
python scripts/mihomo-build/build_all.py
node scripts/mihomo.test.cjs scripts/mihomo-build/fixtures.json
node scripts/mihomo-metadata.test.cjs
```

The script clones/checks a clean upstream, resolves checksummed dependencies, copies sing-tun 0.4.27 into ignored `core-src/mihomo-overlay`, then patches only external descriptor ownership: `tun.New` duplicates the borrowed FD before wrapping it in `os.File`. This avoids closing Android's original FD and avoids leaking a Java duplicate on parse failure. Upstream and Go module cache are never edited. Kotlin passes Mihomo the original borrowed `pfd.fd` for initial start and failover. Returned start errors include TUN construction errors; C JNI strings are freed.

Four standalone downloaded c-shared libraries and a verified manifest are emitted to `core-src/mihomo-dist`. ELF class/machine/DYN and all four JNI exports are checked. Linker uses 16 KB page alignment. The build clears disposable Go build cache after each ABI on this disk-limited host. Nothing copies `libclash.so` into APK jniLibs.

Publication belongs to the parent task: merge manifest entry and `cores/mihomo-v1.19.32` into `instant992/ghostcloudcore_new` GitHub main. Client Mihomo metadata and fallback use only `https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/`; other cores keep existing GitLab origin.

Generator deliberately rejects XHTTP/splithttp/httpupgrade/KCP/QUIC and unsupported custom VLESS encryption rather than silently falling back to TCP. Those capabilities in upstream are not a promise that the client translates every transport option. Roscom MRS providers, domain bypass, secure TLS, REALITY, SS, Hysteria2 Salamander, WS and gRPC are mapped.

Go tests use generated credential-free fixtures and a local HTTP server through a real SOCKS listener; `Smoke.java` runs JNI on Android ART, repeated malformed configs, SOCKS bytes and repeated actual TUN start/stop with descriptor checks. Compile Java against Android SDK, dex with d8, build `smoke_tun.c` with target clang.cmd; run via rooted emulator `app_process` with CLASSPATH=classes.dex, library/home/helper paths as arguments. Do not claim Android runtime verification solely from ELF checks.
