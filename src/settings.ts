import { requireNativeModule, Platform } from "expo-modules-core";

let native: any = null;
if (Platform.OS === "android") {
  try {
    native = requireNativeModule("XrayCore");
  } catch {
    native = null;
  }
}

/** Стили темы (дизайн). Режим (dark/light/auto) хранится отдельно в "theme_mode". */
export type ThemeName =
  | "default"
  | "minimalist"
  | "v2ray"
  | "glass"
  | "foxcloud"
  | "pickme"
  | "happ"
  | "simple";
export type ThemeMode = "dark" | "light" | "auto";
export type CoreName = "xray" | "sing-box";

export function getSetting(key: string, fallback: string): string {
  try {
    const v = native?.getSetting(key);
    return typeof v === "string" && v.length > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: string) {
  try {
    native?.setSetting(key, value);
  } catch {}
}

const THEME_NAMES: ThemeName[] = [
  "default",
  "minimalist",
  "v2ray",
  "glass",
  "foxcloud",
  "pickme",
  "happ",
  "simple",
];

export function getThemeName(): ThemeName {
  const v = getSetting("theme", "glass");
  if ((THEME_NAMES as string[]).includes(v)) return v as ThemeName;
  // старые значения (когда режим и стиль хранились вместе) → стиль «Основная»
  if (v === "dark" || v === "light" || v === "auto") return "default";
  return "glass";
}

const THEME_MODES: ThemeMode[] = ["dark", "light", "auto"];

export function getThemeMode(): ThemeMode {
  const v = getSetting("theme_mode", "");
  if ((THEME_MODES as string[]).includes(v)) return v as ThemeMode;
  // миграция со старого единого значения темы
  const legacy = getSetting("theme", "");
  if (legacy === "light") return "light";
  if (legacy === "auto") return "auto";
  // Happ и Простой исторически светлые темы
  if (legacy === "happ" || legacy === "simple") return "light";
  return "dark";
}

export function getSelectedCore(): CoreName {
  const v = getSetting("core", "xray");
  if (v === "sing-box") return "sing-box";
  // Mihomo убран из приложения: ранее выбранное ядро мигрируем на встроенный Xray,
  // иначе в настройках не было бы активного пункта, а подключение падало бы.
  if (v === "mihomo") {
    setSetting("core", "xray");
    return "xray";
  }
  return "xray";
}

/** Маскировка трафика (анти-DPI): фрагментация TLS ClientHello средствами
 *  finalmask ядра Xray. По умолчанию включена — это чисто клиентская
 *  маскировка (TCP-поток сервер собирает обратно), настройка серверов
 *  не требуется. На ядре sing-box не применяется (нет finalmask). */
export function getAntiDpi(): boolean {
  return getSetting("antidpi", "1") === "1";
}

export function setAntiDpi(v: boolean) {
  setSetting("antidpi", v ? "1" : "0");
}

/** Список строк в настройках (закреплённые серверы, избранное и т.п.) */
export function getJsonList(key: string): string[] {
  try {
    const raw = getSetting(key, "");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setJsonList(key: string, list: string[]) {
  setSetting(key, JSON.stringify(list));
}
