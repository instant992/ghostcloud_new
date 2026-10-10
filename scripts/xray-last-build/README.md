# Xray Last Android JNI

Pinned official XTLS/Xray-core v26.10.10, commit 701af60772cda123492f86e383e1fdba066614a9 (prerelease). This is not a fork of the protocol implementation; gc_api.go provides unique Android JNI entry points.

Build from repository root: `python scripts/xray-last-build/build_all.py`.
Requires Windows Go with automatic go1.27 toolchain download and Android NDK 27.1 at C:/Android/Sdk. Run `go mod tidy` in this directory for a fresh dependency cache. The script verifies the upstream commit and clean tree, ELF ABI, JNI exports and SHA-256 for four ABIs. Outputs are ignored in core-src/xray-last-dist/.

Publication is separate and requires approval: merge the xray-last entry from generated manifest.json into the existing distribution manifest (preserve all other cores), copy its cores/xray-last-v26.10.10/ directory to the distribution repository, publish to GitLab instant99/ghostcloudcore_new and its GitHub mirror, then download each published artifact and compare SHA-256. Until publication, the application displays an honest unavailable-build message instead of installing upstream executable ZIPs.

The application checks the official GitHub releases list including prereleases. A newer upstream tag does not imply that our JNI build exists: it reports the installed core is old while waiting for a matching published Android build. Each new upstream tag requires rebuilding, validation and publication; builds are not automatically created by the mobile app.

Downloads validate HTTPS origin, byte count, SHA-256 and ELF ABI. Loaded libraries are never overwritten; an update is staged until process restart. One Go runtime owns the process, so switching engine families after use requires restart.

Smoke.java and smoke_tun.c run on Android ART via app_process, with a local SOCKS responder and optional root-created test TUN. They exercise JNI init/version, invalid config FD ownership, repeated start/stop and real proxied bytes. This does not replace testing the application VpnService against a real subscription. No production credentials or network endpoints are needed.
