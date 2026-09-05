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
  | { status: "available"; info: UpdateInfo }
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
  return "arm64-v8a";
}

/** Проверка обновления на сервере. Возвращает UpdateInfo или null,
 *  если обновление не нужно (актуальная версия / сервер молчит). */
export async function checkForUpdate(opts: { silent?: boolean } = {}): Promise<UpdateInfo | null> {
  if (!opts.silent) emit({ status: "checking" });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/app/update?abi=${deviceAbi()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data || data.update_available !== true) {
      emit({ status: "up-to-date" });
      return null;
    }
    const remote = String(data.version || "").replace(/^v/, "");
    const local = Application.nativeApplicationVersion || "";
    if (!remote || compareVersions(remote, local) <= 0) {
      emit({ status: "up-to-date" });
      return null;
    }
    const info: UpdateInfo = {
      version: remote,
      versionCode: typeof data.version_code === "number" ? data.version_code : undefined,
      changelog: String(data.changelog || ""),
      apkUrl: String(data.apk_url || ""),
      apkSize: Number(data.apk_size || 0),
    };
    if (!info.apkUrl) {
      emit({ status: "error", message: "Сервер не отдал ссылку на APK" });
      return null;
    }
    emit({ status: "available", info });
    return info;
  } catch (e: any) {
    const message = e?.message || "Не удалось проверить";
    if (!opts.silent) emit({ status: "error", message });
    return null;
  }
}

let downloading = false;

/** Скачивает APK и запускает системный установщик.
 *  Прогресс виден через subscribe() (баннер на главной). */
export async function downloadAndInstall(info: UpdateInfo): Promise<void> {
  if (downloading) return;
  downloading = true;
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

    // Старый файл мешал бы повторной загрузке — удаляем
    try {
      const existing = await FileSystem.getInfoAsync(fileUri);
      if (existing.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch {}

    const task = FileSystem.createDownloadResumable(info.apkUrl, fileUri, {}, (p) => {
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
    if (!result?.uri) throw new Error("Не удалось скачать файл обновления");

    // Разрешение «установка неизвестных приложений» — без него установщик не запустится
    if (!canInstallPackages()) {
      openInstallPermissionSettings();
      emit({ status: "available", info });
      downloading = false;
      return;
    }

    // Нативный метод ждёт обычный файловый путь, а не file://-URI
    const path = result.uri.replace(/^file:\/\//, "");
    const ok = await installApk(path);
    if (!ok) throw new Error("Не удалось запустить установку");
    // Возвращаем баннер в состояние «доступно» — установка идёт в системном диалоге
    emit({ status: "available", info });
  } catch (e: any) {
    emit({ status: "error", message: e?.message || "Ошибка скачивания" });
  } finally {
    downloading = false;
  }
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
