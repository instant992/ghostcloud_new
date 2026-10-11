import { AppState, Platform } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import { BASE_URL } from "./api";
import {
  canInstallPackages,
  getCpuAbi,
  installApk,
  openInstallPermissionSettings,
} from "./vpn/native";

/** Данные об обновлении, как отдаёт /api/app/update */
export type UpdateInfo = {
  version: string;
  versionCode?: number;
  changelog: string;
  apkUrl: string;
  apkSize: number;
};

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; info: UpdateInfo; message?: string; downloaded?: boolean }
  | { status: "up-to-date" }
  | { status: "error"; message: string }
  | {
      status: "downloading";
      info: UpdateInfo;
      progress: number; // 0..1, -1 если размер неизвестен
      downloaded: number;
      total: number;
    };

let state: UpdateState = { status: "idle" };
const listeners = new Set<() => void>();

function emit(next: UpdateState) {
  state = next;
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSnapshot(): UpdateState {
  return state;
}

/** Сравнение версий в стиле старого приложения: major.minor.patch(+build) */
export function compareVersions(v1: string, v2: string): number {
  const a = v1.split("+")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const b = v2.split("+")[0].split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  const buildA = v1.includes("+") ? parseInt(v1.split("+")[1], 10) || 0 : 0;
  const buildB = v2.includes("+") ? parseInt(v2.split("+")[1], 10) || 0 : 0;
  return buildA - buildB;
}

/** ABI устройства — сервер отдаёт APK под нужную архитектуру */
function deviceAbi(): string {
  const abi = getCpuAbi();
  if (abi === "arm64-v8a" || abi === "armeabi-v7a") return abi;
  throw new Error(`Обновление APK для архитектуры ${abi || "неизвестно"} недоступно на сервере`);
}

/** The production feed advertises the legacy vpnghost alias. No arbitrary APK hosts. */
function trustedApkUrl(value: string): string {
  const url = new URL(value);
  const abi = deviceAbi();
  if (url.protocol !== "https:" || ![new URL(BASE_URL).origin, "https://vpnghost.space"].includes(url.origin)
      || url.username || url.password || url.pathname !== "/api/app/download" || url.hash
      || url.searchParams.get("abi") !== abi || Array.from(url.searchParams.keys()).some(k => k !== "abi")) {
    throw new Error("Сервер отдал недоверенную ссылку или APK другой архитектуры");
  }
  return url.toString();
}

let operation = 0;
let checkInFlight: Promise<UpdateInfo | null> | null = null;

/** Share cold-entry, foreground and manual checks. */
export function checkForUpdate(opts: { silent?: boolean } = {}): Promise<UpdateInfo | null> {
  if (downloading) return Promise.resolve(state.status === "downloading" ? state.info : null);
  if (checkInFlight) return checkInFlight;
  checkInFlight = performCheck(opts).finally(() => { checkInFlight = null; });
  return checkInFlight;
}

async function performCheck(opts: { silent?: boolean }): Promise<UpdateInfo | null> {
  const previous = state.status === "available" ? state : null;
  const generation = operation;
  const publish = (next: UpdateState) => { if (generation === operation && !downloading) emit(next); };
  if (!opts.silent && !previous) publish({ status: "checking" });
  try {
    const abi = deviceAbi();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/app/update?abi=${encodeURIComponent(abi)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data || data.update_available !== true) {
      publish({ status: "up-to-date" });
      return null;
    }
    const remote = String(data.version || "").replace(/^v/, "");
    const local = Application.nativeApplicationVersion || "";
    if (!/^\d+\.\d+\.\d+(?:\+\d+)?$/.test(remote)) throw new Error("Некорректная версия обновления");
    if (!local) throw new Error("Не удалось определить установленную версию");
    if (compareVersions(remote, local) <= 0) {
      publish({ status: "up-to-date" });
      return null;
    }
    const info: UpdateInfo = {
      version: remote,
      versionCode: typeof data.version_code === "number" ? data.version_code : undefined,
      changelog: String(data.changelog || ""),
      apkUrl: trustedApkUrl(String(data.apk_url || "")),
      apkSize: Number.isFinite(Number(data.apk_size)) ? Math.max(0, Number(data.apk_size)) : 0,
    };
    if (!info.apkUrl) {
      publish({ status: "error", message: "Сервер не отдал ссылку на APK" });
      return null;
    }
    const sameDownload = previous?.downloaded && previous.info.version === info.version
      && previous.info.versionCode === info.versionCode && previous.info.apkUrl === info.apkUrl
      && previous.info.apkSize === info.apkSize;
    publish({ status: "available", info, downloaded: !!sameDownload });
    return info;
  } catch (e: any) {
    const message = e?.message || "Не удалось проверить";
    if (previous) publish({ ...previous, message });
    else publish({ status: "error", message });
    return null;
  }
}

let downloading = false;

/** Скачивает APK и запускает системный установщик.
 *  Прогресс виден через subscribe() (баннер на главной). */
export async function downloadAndInstall(info: UpdateInfo): Promise<void> {
  if (downloading) return;
  try { trustedApkUrl(info.apkUrl); }
  catch (e: any) { emit({ status: "error", message: e?.message || "Недоступный APK" }); return; }
  downloading = true;
  operation++;
  const started: UpdateState = {
    status: "downloading",
    info,
    progress: -1,
    downloaded: 0,
    total: info.apkSize || 0,
  };
  emit(started);
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) throw new Error("Недоступно хранилище приложения");
    const fileUri = `${dir}GhostCloud-update-${info.version}.apk`;

    // A completion receipt distinguishes a fully downloaded APK from a partial file.
    // Bind it to the feed identity and actual size; reuse survives process restarts.
    const receiptUri = `${fileUri}.json`;
    const identity = JSON.stringify([info.version, info.versionCode ?? null, info.apkUrl, info.apkSize, deviceAbi()]);
    let ready = false;
    try {
      const receipt = JSON.parse(await FileSystem.readAsStringAsync(receiptUri));
      const existing = await FileSystem.getInfoAsync(fileUri);
      ready = existing.exists && !existing.isDirectory && existing.size > 0
        && receipt.identity === identity && receipt.size === existing.size;
    } catch {}
    if (!ready) {
      await FileSystem.deleteAsync(receiptUri, { idempotent: true });
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      let transferExpected = 0;
      const task = FileSystem.createDownloadResumable(info.apkUrl, fileUri, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) transferExpected = p.totalBytesExpectedToWrite;
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : info.apkSize || 0;
      emit({
        status: "downloading",
        info,
        progress: total > 0 ? p.totalBytesWritten / total : -1,
        downloaded: p.totalBytesWritten,
        total,
      });
    });
    const result = await task.downloadAsync();
    if (!result?.uri || result.status !== 200) throw new Error("Не удалось скачать файл обновления");
    const completed = await FileSystem.getInfoAsync(fileUri);
    // Feed apkSize is display metadata, not proof of transfer completeness.
    if (!completed.exists || completed.isDirectory || completed.size <= 0
        || (transferExpected > 0 && completed.size !== transferExpected)) {
      throw new Error("Файл обновления скачан не полностью");
    }
    await FileSystem.writeAsStringAsync(receiptUri, JSON.stringify({ identity, size: completed.size }));
    }

    // Разрешение «установка неизвестных приложений» — без него установщик не запустится
    if (!canInstallPackages()) {
      openInstallPermissionSettings();
      emit({ status: "available", info, downloaded: true, message: "APK уже скачан. Разрешите установку и нажмите «Установить»" });
      downloading = false;
      return;
    }

    // Нативный метод ждёт обычный файловый путь, а не file://-URI
    const path = fileUri.replace(/^file:\/\//, "");
    const ok = await installApk(path);
    if (!ok) throw new Error("Не удалось запустить установку");
    // Возвращаем баннер в состояние «доступно» — установка идёт в системном диалоге
    emit({ status: "available", info, downloaded: true });
  } catch (e: any) {
    emit({ status: "available", info, message: e?.message || "Ошибка скачивания" });
  } finally {
    downloading = false;
  }
}

/** One root-owned lifecycle subscription, independent of login/theme remounts. */
export function startUpdateChecks(appState: Pick<typeof AppState, "currentState" | "addEventListener"> = AppState): () => void {
  if (Platform.OS !== "android") return () => {};
  let previous = appState.currentState;
  void checkForUpdate({ silent: true });
  const subscription = appState.addEventListener("change", next => {
    if (next === "active" && previous !== "active") void checkForUpdate({ silent: true });
    previous = next;
  });
  return () => subscription.remove();
}

/** Первая строка changelog для компактного баннера */
export function firstChangelogLine(changelog: string): string {
  const line = (changelog || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0];
  if (!line) return "";
  return line.startsWith("-") ? line.slice(1).trim() : line;
}

export function formatSizeMb(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
