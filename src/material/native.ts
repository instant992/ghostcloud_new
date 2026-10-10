import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export const SYSTEM_PALETTE_FAMILIES = ["accent1", "accent2", "accent3", "neutral1", "neutral2"] as const;
export const SYSTEM_PALETTE_SHADES = [0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;
export type SystemMaterialPalette = Record<string, string>;

/** Null also supports running an older APK which lacks the new native method. */
export function getSystemMaterialPalette(): SystemMaterialPalette | null {
  if (Platform.OS !== "android" || Number(Platform.Version) < 31) return null;
  try {
    const value: unknown = requireNativeModule("XrayCore").getSystemMaterialPalette?.();
    if (!value || typeof value !== "object") return null;
    const result: SystemMaterialPalette = {};
    for (const family of SYSTEM_PALETTE_FAMILIES) {
      for (const shade of SYSTEM_PALETTE_SHADES) {
        const key = `${family}_${shade}`;
        const color = (value as Record<string, unknown>)[key];
        if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return null;
        result[key] = color;
      }
    }
    return result;
  } catch {
    return null;
  }
}
