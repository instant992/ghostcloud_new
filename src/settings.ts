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
  const v = getSetting("theme", "default");
  return (THEME_NAMES as string[]).includes(v) ? (v as ThemeName) : "default";
}

export function getSelectedCore(): CoreName {
  const v = getSetting("core", "xray");
  return v === "sing-box" || v === "mihomo" ? (v as CoreName) : "xray";
}
