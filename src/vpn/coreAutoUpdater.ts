import { Alert } from "react-native";
import { fetchCoreMeta } from "../screens/settings/cores";
import { getCpuAbi, getXrayJolyStatus, getXrayLastStatus, downloadXrayJoly, downloadXrayLast, isVpnRunning } from "./native";

const inFlight = new Map<string, Promise<void>>();
const checked = new Map<string, number>();
const notified = new Set<string>();
const CHECK_INTERVAL = 5 * 60 * 1000;

function versionParts(value: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(value);
  return match ? match.slice(1).map(Number) : null;
}

function newer(a: string, b: string): boolean {
  const aa = versionParts(a), bb = versionParts(b);
  if (!aa || !bb) return true;
  for (let i = 0; i < 4; i++) {
    const left = aa[i] ?? -1, right = bb[i] ?? -1;
    if (left !== right) return left > right;
  }
  return false;
}

/** Manual connect only. Native downloads validate SHA/size/ELF, stage mapped libraries,
 * and activate only before first load in a process. Never restart the app automatically. */
export async function ensureSelectedCoreUpdated(core: string): Promise<void> {
  if (core !== "xray-joly" && core !== "xray-last") return;
  if (await isVpnRunning()) return;
  const existing = inFlight.get(core);
  if (existing) return existing;
  const task = (async () => {
    const status = core === "xray-joly" ? getXrayJolyStatus : getXrayLastStatus;
    const notifyPending = () => {
      const pending = status().pendingVersion;
      const key = `${core}:${pending}`;
      if (pending && !notified.has(key)) {
        notified.add(key);
        Alert.alert("Обновление ядра", `Загружена версия ${pending}. Она применится после перезапуска приложения. Сейчас используется установленное ядро.`);
      }
    };
    const installed = status();
    if (installed.pendingVersion) { notifyPending(); return; }
    if (installed.downloaded && Date.now() - (checked.get(core) || 0) < CHECK_INTERVAL) return;
    try {
      checked.set(core, Date.now());
      const meta = await fetchCoreMeta(core, getCpuAbi());
      if (!meta) throw new Error("Обновление ядра недоступно; ядро не установлено — повторите загрузку при доступной сети");
      if (installed.downloaded && installed.version === meta.version && installed.size === meta.size) return;
      // The upstream semantic version can stay unchanged while our JNI wrapper
      // changes (for example when socket protection is added). A size mismatch
      // must therefore trigger a download even when versions are equal.
      if (installed.downloaded && installed.version && !newer(meta.version, installed.version) && installed.size === meta.size) return;
      // A VPN may have started while metadata was being fetched.
      if (await isVpnRunning()) return;
      const download = core === "xray-joly" ? downloadXrayJoly : downloadXrayLast;
      await download(meta.url, meta.sha256, meta.size, meta.version);
      if (!status().downloaded) throw new Error("Ядро не установлено после загрузки");
      notifyPending();
    } catch (error) {
      // A failed check/download must not disable a known installed core.
      if (!status().downloaded) throw error;
    }
  })();
  inFlight.set(core, task);
  try { await task; } finally { inFlight.delete(core); }
}
