import { requireNativeModule, Platform } from "expo-modules-core";

let native: any = null;
if (Platform.OS === "android") {
  try {
    native = requireNativeModule("XrayCore");
  } catch {
    native = null;
  }
}

export type ThemeName =
  | "standard"
  | "auto"
  | "default"
  | "dark"
  | "light"
  | "minimalist"
  | "v2ray"
  | "glass"
  | "foxcloud"
  | "pickme"
  | "happ";
export type CoreName = "xray" | "sing-box" | "mihomo";
/** Режим день/ночь — действует для тем standard, happ и v2ray */
export type ThemeMode = "auto" | "light" | "dark";

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
  "standard",
  "auto",
  "default",
  "dark",
  "light",
  "minimalist",
  "v2ray",
  "glass",
  "foxcloud",
  "pickme",
  "happ",
];

export function getThemeName(): ThemeName {
  const v = getSetting("theme", "standard");
  return (THEME_NAMES as string[]).includes(v) ? (v as ThemeName) : "standard";
}

const THEME_MODES: ThemeMode[] = ["auto", "light", "dark"];

export function getThemeMode(): ThemeMode {
  const v = getSetting("theme_mode", "auto");
  return (THEME_MODES as string[]).includes(v) ? (v as ThemeMode) : "auto";
}

export function setThemeMode(mode: ThemeMode) {
  setSetting("theme_mode", mode);
}

export function getSelectedCore(): CoreName {
  const v = getSetting("core", "xray");
  return v === "sing-box" || v === "mihomo" ? (v as CoreName) : "xray";
}
