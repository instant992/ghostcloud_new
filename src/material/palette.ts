import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";
import { getSystemMaterialPalette, type SystemMaterialPalette } from "./native";

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function blend(background: string, foreground: string, alpha: number): string {
  const bg = parseInt(background.slice(1), 16);
  const fg = parseInt(foreground.slice(1), 16);
  const channel = (shift: number) => Math.round(((bg >> shift) & 255) * (1 - alpha) + ((fg >> shift) & 255) * alpha);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** Android shade 600 = MD tone 40; shade 100 = tone 90. */
export function createMaterialTheme(dark: boolean, palette: SystemMaterialPalette | null): MD3Theme {
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  if (!palette) return base;
  const tone = (family: string, value: number) => palette[`${family}_${value === 100 ? 0 : value === 99 ? 10 : value === 95 ? 50 : 1000 - value * 10}`];
  const colors = { ...base.colors };
  for (const [role, family] of [["Primary", "accent1"], ["Secondary", "accent2"], ["Tertiary", "accent3"]] as const) {
    const key = role.toLowerCase() as "primary" | "secondary" | "tertiary";
    colors[key] = tone(family, dark ? 80 : 40);
    colors[`on${role}`] = tone(family, dark ? 20 : 100);
    colors[`${key}Container`] = tone(family, dark ? 30 : 90);
    colors[`on${role}Container`] = tone(family, dark ? 90 : 10);
  }
  colors.background = colors.surface = tone("neutral1", dark ? 10 : 99);
  colors.onBackground = colors.onSurface = tone("neutral1", dark ? 90 : 10);
  colors.surfaceVariant = tone("neutral2", dark ? 30 : 90);
  colors.onSurfaceVariant = tone("neutral2", dark ? 80 : 30);
  colors.outline = tone("neutral2", dark ? 60 : 50);
  colors.outlineVariant = tone("neutral2", dark ? 30 : 80);
  colors.inverseSurface = tone("neutral1", dark ? 90 : 20);
  colors.inverseOnSurface = tone("neutral1", dark ? 20 : 95);
  colors.inversePrimary = tone("accent1", dark ? 40 : 80);
  colors.shadow = colors.scrim = tone("neutral1", 0);
  colors.surfaceDisabled = rgba(colors.onSurface, 0.12);
  colors.onSurfaceDisabled = rgba(colors.onSurface, 0.38);
  colors.backdrop = rgba(tone("neutral2", 20), 0.4);
  colors.elevation = {
    level0: "transparent",
    level1: blend(colors.surface, colors.primary, 0.05),
    level2: blend(colors.surface, colors.primary, 0.08),
    level3: blend(colors.surface, colors.primary, 0.11),
    level4: blend(colors.surface, colors.primary, 0.12),
    level5: blend(colors.surface, colors.primary, 0.14),
  };
  // Error roles deliberately retain the MD3 semantic error palette.
  return { ...base, colors };
}

let systemPalette = getSystemMaterialPalette();
let materialThemes = {
  dark: createMaterialTheme(true, systemPalette),
  light: createMaterialTheme(false, systemPalette),
};

export function getMaterialTheme(dark: boolean): MD3Theme {
  return dark ? materialThemes.dark : materialThemes.light;
}

/** Re-read on foreground to pick up wallpaper/system palette changes. */
export function refreshMaterialPalette(): boolean {
  const next = getSystemMaterialPalette();
  if (JSON.stringify(next) === JSON.stringify(systemPalette)) return false;
  systemPalette = next;
  materialThemes = { dark: createMaterialTheme(true, next), light: createMaterialTheme(false, next) };
  return true;
}

export function hasSystemMaterialPalette(): boolean {
  return systemPalette !== null;
}

/** Structural return type keeps the palette layer independent of theme.tsx. */
export function getMaterialAppPalette(dark: boolean) {
  const c = getMaterialTheme(dark).colors;
  return {
    bg: c.background,
    bgSoft: c.elevation.level1,
    card: c.elevation.level2,
    cardLight: c.elevation.level3,
    border: c.outlineVariant,
    text: c.onBackground,
    textDim: c.onSurfaceVariant,
    textFaint: c.outline,
    accent: c.primary,
    accentDeep: c.primaryContainer,
    accentSoft: c.primaryContainer,
    green: dark ? "#34D399" : "#059669",
    red: c.error,
    orange: dark ? "#FBBF24" : "#D97706",
    gradient: [c.primaryContainer, c.primary] as readonly [string, string],
  };
}
