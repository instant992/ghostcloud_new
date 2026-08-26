import { requireNativeModule, Platform } from "expo-modules-core";

export type AppIcon = "ghostcloud" | "ghostvpn";

let native: any = null;
if (Platform.OS === "android") {
  try {
    native = requireNativeModule("XrayCore");
  } catch {
    native = null;
  }
}

export function getLauncherIcon(): AppIcon {
  try {
    const v = native?.getLauncherIcon();
    return v === "ghostvpn" ? "ghostvpn" : "ghostcloud";
  } catch {
    return "ghostcloud";
  }
}

/** Возвращает true при успехе. На Android иконка лаунчера обновится после перезапуска процесса. */
export function setLauncherIcon(icon: AppIcon): boolean {
  try {
    native?.setLauncherIcon(icon);
    return true;
  } catch {
    return false;
  }
}

export function restartApp() {
  try {
    native?.restartApp();
  } catch {}
}
