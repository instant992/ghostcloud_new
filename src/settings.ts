import { requireNativeModule, Platform } from "expo-modules-core";

let native: any = null;
if (Platform.OS === "android") {
  try {
    native = requireNativeModule("XrayCore");
  } catch {
    native = null;
  }
}

export type ThemeName = "dark" | "light";
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

export function getThemeName(): ThemeName {
  return getSetting("theme", "dark") === "light" ? "light" : "dark";
}

export function getSelectedCore(): CoreName {
  const v = getSetting("core", "xray");
  return v === "sing-box" || v === "mihomo" ? (v as CoreName) : "xray";
}
