import { requireNativeModule } from "expo-modules-core";
import { EventEmitter } from "expo-modules-core";
import { Platform } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XrayNative: any =
  Platform.OS === "android"
    ? (() => {
        try {
          return requireNativeModule("XrayCore");
        } catch {
          return null;
        }
      })()
    : null;

export const xrayAvailable = XrayNative !== null;

export type AppInfo = {
  packageName: string;
  appName: string;
  system: boolean;
};

const emitter: any = XrayNative ? new EventEmitter(XrayNative) : null;

export function onCoreDownloadProgress(
  cb: (e: { name: string; received: number; total: number; progress: number }) => void
): () => void {
  if (!emitter) return () => {};
  const sub: any = emitter.addListener("onCoreDownloadProgress", cb);
  return () => sub.remove();
}

export function getCpuAbi(): string {
  if (!XrayNative) return "";
  try {
    return XrayNative.getCpuAbi() || "";
  } catch {
    return "";
  }
}

/** base64 PNG иконки приложения (или null) */
export function getAppIcon(packageName: string): Promise<string | null> {
  if (!XrayNative) return Promise.resolve(null);
  return XrayNative.getAppIcon(packageName).catch(() => null);
}

export function getCoreStatus(name: string): { downloaded: boolean; size: number; path: string } {
  if (!XrayNative) return { downloaded: false, size: 0, path: "" };
  try {
    const s = XrayNative.getCoreStatus(name);
    return { downloaded: Boolean(s?.downloaded), size: Number(s?.size || 0), path: String(s?.path || "") };
  } catch {
    return { downloaded: false, size: 0, path: "" };
  }
}

export async function downloadCore(
  name: string,
  url: string,
  sha256: string,
  size: number
): Promise<string> {
  if (!XrayNative) throw new Error("модуль недоступен");
  return XrayNative.downloadCore(name, url, sha256, size);
}

export async function deleteCore(name: string): Promise<boolean> {
  if (!XrayNative) return false;
  return XrayNative.deleteCore(name);
}

export async function loadLibCore(lib: "mihomo" | "singbox"): Promise<string> {
  if (!XrayNative) throw new Error("модуль недоступен");
  return XrayNative.loadLibCore(lib);
}

export type FailoverEntry = { config: string; host: string; port: number };

export type FailoverInfo = {
  host: string;
  port: number;
  candidates: FailoverEntry[];
};

function failoverArgs(failover?: FailoverInfo): [string | null, number, string | null] {
  if (!failover || !failover.candidates.length) return [null, 0, null];
  return [failover.host, failover.port, JSON.stringify(failover.candidates)];
}

export async function startLibCoreVpn(
  lib: "mihomo" | "singbox",
  config: string,
  allowedApps: string[] = [],
  disallowedApps: string[] = [],
  failover?: FailoverInfo
): Promise<boolean> {
  if (!XrayNative) throw new Error("модуль недоступен");
  const [foHost, foPort, foJson] = failoverArgs(failover);
  return XrayNative.startLibCoreVpn(
    lib,
    config,
    allowedApps.length ? allowedApps.join(",") : null,
    disallowedApps.length ? disallowedApps.join(",") : null,
    foHost,
    foPort,
    foJson
  );
}

export function stopLibCoreVpn(): void {
  if (!XrayNative) return;
  XrayNative.stopLibCoreVpn();
}

export function isLibCoreRunning(): boolean {
  if (!XrayNative) return false;
  try {
    return XrayNative.isLibCoreRunning();
  } catch {
    return false;
  }
}

export function onVpnStateChanged(cb: (running: boolean) => void): () => void {
  if (!emitter) return () => {};
  const sub: any = emitter.addListener("onVpnStateChanged", (e: { running: boolean }) =>
    cb(e.running)
  );
  return () => sub.remove();
}

/** Текущий тип сети: wifi / mobile / ethernet / other / none */
export function getNetworkType(): string {
  if (!XrayNative?.getNetworkType) return "none";
  try {
    return String(XrayNative.getNetworkType() || "none");
  } catch {
    return "none";
  }
}

/** Пакеты всех установленных приложений (через запятую) — для проверки
 *  профилей фильтра соединения: в список «мимо VPN» попадают только
 *  реально установленные приложения. */
export function getInstalledPackageNames(): Set<string> {
  if (!XrayNative?.getInstalledPackageNames) return new Set();
  try {
    const raw = String(XrayNative.getInstalledPackageNames() || "");
    if (!raw) return new Set();
    return new Set(raw.split(",").filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Выдан ли доступ к данным использования (нужен для статистики трафика
 *  по приложениям на Android 10+). Если нативный модуль недоступен
 *  (не-сборка), считаем доступным, чтобы не показывать ложную подсказку. */
export function isUsageStatsAvailable(): boolean {
  if (!XrayNative) return true;
  if (!XrayNative.isUsageStatsAvailable) return true;
  try {
    return Boolean(XrayNative.isUsageStatsAvailable());
  } catch {
    return true;
  }
}

/** Открывает системные настройки выдачи доступа к данным использования */
export function openUsageAccessSettings(): void {
  try {
    XrayNative?.openUsageAccessSettings?.();
  } catch {}
}

/** События смены типа сети (Wi-Fi ↔ LTE) — для фильтра соединения */
export function onNetworkTypeChanged(cb: (type: string) => void): () => void {
  if (!emitter) return () => {};
  const sub: any = emitter.addListener("onNetworkTypeChanged", (e: { type: string }) =>
    cb(String(e?.type || "none"))
  );
  return () => sub.remove();
}

export async function startVpn(
  configJson: string,
  allowedApps: string[] = [],
  disallowedApps: string[] = [],
  failover?: FailoverInfo
): Promise<boolean> {
  if (!XrayNative) throw new Error("VPN-модуль недоступен (соберите нативное приложение)");
  const [foHost, foPort, foJson] = failoverArgs(failover);
  return XrayNative.startVpn(
    configJson,
    allowedApps.length ? allowedApps.join(",") : null,
    disallowedApps.length ? disallowedApps.join(",") : null,
    foHost,
    foPort,
    foJson
  );
}

/** Установленные приложения: [{packageName, appName, system}] */
export async function getInstalledApps(includeSystem: boolean): Promise<AppInfo[]> {
  if (!XrayNative) return [];
  try {
    const res = await XrayNative.getInstalledApps(includeSystem);
    if (!Array.isArray(res)) return [];
    return res.map((a: any) => ({
      packageName: String(a?.packageName || ""),
      appName: String(a?.appName || a?.packageName || ""),
      system: Boolean(a?.system),
    }));
  } catch {
    return [];
  }
}

export function stopVpn(): void {
  if (!XrayNative) return;
  XrayNative.stopVpn();
  XrayNative.stopCoreVpn();
  XrayNative.stopLibCoreVpn();
}

export async function requestVpnPermission(): Promise<boolean> {
  if (!XrayNative) return false;
  return XrayNative.requestPermission();
}

export async function isPrepared(): Promise<boolean> {
  if (!XrayNative) return false;
  try {
    return await XrayNative.isPrepared();
  } catch {
    return false;
  }
}

export function isVpnRunning(): boolean {
  if (!XrayNative) return false;
  try {
    return XrayNative.isVpnRunning() || XrayNative.isCoreRunning() || XrayNative.isLibCoreRunning();
  } catch {
    return false;
  }
}

/** Запуск VPN через внешнее ядро (sing-box), исполняемый файл из nativeLibraryDir */
export async function startCoreVpn(
  coreName: string,
  configJson: string,
  allowedApps: string[] = [],
  disallowedApps: string[] = []
): Promise<boolean> {
  if (!XrayNative) throw new Error("VPN-модуль недоступен");
  return XrayNative.startCoreVpn(
    coreName,
    configJson,
    allowedApps.length ? allowedApps.join(",") : null,
    disallowedApps.length ? disallowedApps.join(",") : null
  );
}

export function getCoreVersion(coreName: string): Promise<string> {
  if (!XrayNative) return Promise.resolve("");
  return XrayNative.getCoreVersion(coreName).catch(() => "");
}

/** TCP-пинг хоста, возвращает задержку в мс */
export async function tcpPing(host: string, port: number, timeoutMs = 5000): Promise<number> {
  if (!XrayNative) throw new Error("модуль недоступен");
  const res: any = await XrayNative.tcpPing(host, port, timeoutMs);
  return typeof res === "number" ? res : Number(res || -1);
}

export type UidTraffic = {
  uid: number;
  packageName: string;
  appName: string;
  rx: number;
  tx: number;
};

/** Счётчики трафика (с загрузки системы) по UID установленных приложений.
 *  Наше собственное приложение исключено на нативной стороне. */
export async function getUidTraffic(): Promise<UidTraffic[]> {
  if (!XrayNative?.getUidTraffic) return [];
  try {
    const res = await XrayNative.getUidTraffic();
    if (!Array.isArray(res)) return [];
    return res.map((a: any) => ({
      uid: Number(a?.uid || 0),
      packageName: String(a?.packageName || ""),
      appName: String(a?.appName || a?.packageName || ""),
      rx: Number(a?.rx || 0),
      tx: Number(a?.tx || 0),
    }));
  } catch {
    return [];
  }
}

/** Суммарные байты приложения (tx/rx) с загрузки системы */
export async function getTrafficSnapshot(): Promise<{ tx: number; rx: number }> {
  if (!XrayNative) return { tx: 0, rx: 0 };
  try {
    const snap = XrayNative.getTrafficSnapshot();
    return {
      tx: typeof snap?.tx === "number" ? snap.tx : Number(snap?.tx || 0),
      rx: typeof snap?.rx === "number" ? snap.rx : Number(snap?.rx || 0),
    };
  } catch {
    return { tx: 0, rx: 0 };
  }
}

export function getXrayVersion(): string {
  if (!XrayNative) return "";
  try {
    return XrayNative.xrayVersion() || "";
  } catch {
    return "";
  }
}

/** configs: [{xrayJson, outboundTag}] — максимум 5 за один вызов */
export async function pingNodesBatch(
  outbounds: Array<{ xrayJson: string }>
): Promise<Array<{ success: boolean; delay: number; error?: string }>> {
  if (!XrayNative) return [];
  const results: Array<{ success: boolean; delay: number; error?: string }> = [];
  for (let i = 0; i < outbounds.length; i += 5) {
    const chunk = outbounds.slice(i, i + 5).map((c) => ({
      xrayJson: c.xrayJson,
      outboundTag: "proxy",
    }));
    try {
      const payload = JSON.stringify({ configs: chunk });
      // pingBatch — AsyncFunction на нативной стороне, обязательно await:
      // без него JSON.parse(Promise) бросает «Unexpected token 'o'» и все
      // узлы ложно помечаются непроверенными
      const res = await XrayNative.pingBatch(payload, 10, "https://cp.cloudflare.com/generate_204");
      const parsed = JSON.parse(res);
      if (!parsed?.success) throw new Error(parsed?.error || "ping failed");
      const items = parsed?.data?.results || [];
      for (let j = 0; j < chunk.length; j++) {
        const it = items[j];
        results.push({
          success: Boolean(it?.success),
          delay: typeof it?.delay === "number" ? it.delay : -1,
          error: it?.error,
        });
      }
    } catch (e: any) {
      for (let j = 0; j < chunk.length; j++) {
        results.push({ success: false, delay: -1, error: e?.message || "ping failed" });
      }
    }
  }
  return results;
}

// ── Смена иконки приложения на рабочем столе (перенесено из старого проекта:
//    переключение activity-alias — «default» призрак / «foxcloud» лисья) ──

/** Текущая иконка лаунчера: "default" | "foxcloud" */
export function getLauncherIcon(): string {
  if (!XrayNative) return "default";
  try {
    return XrayNative.getLauncherIcon() || "default";
  } catch {
    return "default";
  }
}

/** Применяет иконку. Возвращает успех. На некоторых оболочках подпись под
 *  иконкой обновится после возврата на главный экран. */
export function setLauncherIcon(type: "default" | "foxcloud"): boolean {
  if (!XrayNative) return false;
  try {
    return XrayNative.setLauncherIcon(type) === true;
  } catch {
    return false;
  }
}
