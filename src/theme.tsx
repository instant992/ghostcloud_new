import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getThemeName, getThemeMode, getSetting, type ThemeMode } from "./settings";
import { fontForTheme, setAppFont } from "./fontPatch";
import { getMaterialAppPalette, refreshMaterialPalette } from "./material/palette";

/** Стили темы (дизайн/UX). Режим (тёмный/светлый/авто) хранится отдельно. */
export type ThemeName =
  | "default"
  | "minimalist"
  | "v2ray"
  | "glass"
  | "foxcloud"
  | "pickme"
  | "happ"
  | "simple"
  | "awg"
  | "material";

export type { ThemeMode };

type Palette = {
  bg: string;
  bgSoft: string;
  card: string;
  cardLight: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  green: string;
  red: string;
  orange: string;
  gradient: readonly [string, string];
};

type PalettePair = { dark: Palette; light: Palette };

// ── Основная ──
const defaultDark: Palette = {
  bg: "#0F0B1E",
  bgSoft: "#160F2B",
  card: "#1C1433",
  cardLight: "#251A42",
  border: "#2E2150",
  text: "#FFFFFF",
  textDim: "#9C93B8",
  textFaint: "#8F84AC",
  accent: "#A855F7",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(168,85,247,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7C3AED", "#A855F7"],
};

const defaultLight: Palette = {
  bg: "#F4F2FA",
  bgSoft: "#EAE6F5",
  card: "#FFFFFF",
  cardLight: "#F3EFFB",
  border: "#E0D9F0",
  text: "#171226",
  textDim: "#5E5578",
  textFaint: "#6B6185",
  accent: "#9333EA",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(147,51,234,0.10)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#7C3AED", "#A855F7"],
};

// ── Минимализм ──
const minimalistDark: Palette = {
  bg: "#08080E",
  bgSoft: "#0A0A14",
  card: "#0E0C16",
  cardLight: "#14121F",
  border: "#1E1B2C",
  text: "#FFFFFF",
  textDim: "#8E88A6",
  textFaint: "#817B9A",
  accent: "#9B59B6",
  accentDeep: "#7B2FBE",
  accentSoft: "rgba(155,89,182,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7B2FBE", "#9B59B6"],
};

const minimalistLight: Palette = {
  bg: "#F4F3FA",
  bgSoft: "#F8F7FF",
  card: "#FFFFFF",
  cardLight: "#F0EEFF",
  border: "#D8D0EE",
  text: "#1A1030",
  textDim: "#5A4870",
  textFaint: "#756491",
  accent: "#9B59B6",
  accentDeep: "#7B2FBE",
  accentSoft: "rgba(155,89,182,0.12)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#7B2FBE", "#9B59B6"],
};

// ── v2ray ──
const v2rayDark: Palette = {
  bg: "#05111F",
  bgSoft: "#071A2E",
  card: "#061522",
  cardLight: "#0A2036",
  border: "#12263C",
  text: "#FFFFFF",
  textDim: "#8CA6C4",
  textFaint: "#6D89A9",
  accent: "#3B82F6",
  accentDeep: "#2563EB",
  accentSoft: "rgba(59,130,246,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#2563EB", "#3B82F6"],
};

const v2rayLight: Palette = {
  bg: "#F5F3FF",
  bgSoft: "#EDE9FE",
  card: "#FFFFFF",
  cardLight: "#E5E0FF",
  border: "#CDC4E8",
  text: "#1A0A2E",
  textDim: "#5B4A7A",
  textFaint: "#6B5C97",
  accent: "#3B82F6",
  accentDeep: "#2563EB",
  accentSoft: "rgba(59,130,246,0.12)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#2563EB", "#3B82F6"],
};

// ── Liquid Glass ──
// Базовые цвета фона совпадают со стандартной темой (defaultDark/defaultLight),
// но фон темы НЕ плоский: GlassBackdropProvider рисует мягкий градиент и
// фирменные блобы (react-native-svg). Однотонная заливка не годится — стеклу
// AGSL нечего преломлять, и блоки выглядят плоскими («как будто без liquid»).
// Фотообои liquid_bg убраны по запросу пользователя: на их светящихся блобах
// терялись фиолетовый акцент и серый текст.
const glassDark: Palette = {
  bg: "#0F0B1E",
  bgSoft: "#160F2B",
  card: "rgba(255,255,255,0.05)",
  cardLight: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textDim: "#9C99AD",
  textFaint: "#8A879E",
  accent: "#8B5CF6",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(139,92,246,0.13)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7C3AED", "#8B5CF6"],
};

const glassLight: Palette = {
  bg: "#F4F2FA",
  bgSoft: "#EAE6F5",
  card: "#DCDAE4",
  cardLight: "#D4D2DC",
  border: "#B0B0C0",
  text: "#1A1A22",
  textDim: "#48485A",
  textFaint: "#585868",
  accent: "#8B5CF6",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(139,92,246,0.12)",
  green: "#036546",
  red: "#DC2626",
  orange: "#854904",
  gradient: ["#7C3AED", "#8B5CF6"],
};

// ── FoxCloud ──
const foxcloudDark: Palette = {
  bg: "#110E0A",
  bgSoft: "#181410",
  card: "#1E1A14",
  cardLight: "#26201A",
  border: "#2E2820",
  text: "#FFFFFF",
  textDim: "#CCBBAA",
  textFaint: "#978775",
  accent: "#E8720C",
  accentDeep: "#C25E00",
  accentSoft: "rgba(232,114,12,0.14)",
  green: "#34D399",
  red: "#EF4444",
  orange: "#F59E0B",
  gradient: ["#E8720C", "#F59E0B"],
};

const foxcloudLight: Palette = {
  bg: "#F6EFE6",
  bgSoft: "#EFE5D8",
  card: "#FFFFFF",
  cardLight: "#F3EAE0",
  border: "#E2D5C4",
  text: "#2A1F14",
  textDim: "#6E5B48",
  textFaint: "#746452",
  accent: "#9F4E08",
  accentDeep: "#C25E00",
  accentSoft: "rgba(232,114,12,0.12)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#E8720C", "#F59E0B"],
};

// ── Pink ──
const pickmeDark: Palette = {
  bg: "#170910",
  bgSoft: "#1F0D16",
  card: "#26101B",
  cardLight: "#301524",
  border: "#3A1A2C",
  text: "#FFFFFF",
  textDim: "#C99BB2",
  textFaint: "#A27D8E",
  accent: "#EC4899",
  accentDeep: "#D63384",
  accentSoft: "rgba(236,72,153,0.14)",
  green: "#4ADE80",
  red: "#FB7185",
  orange: "#FF69B4",
  gradient: ["#D63384", "#EC4899"],
};

const pickmeLight: Palette = {
  bg: "#FBF0F5",
  bgSoft: "#F5E4EC",
  card: "#FFFFFF",
  cardLight: "#F8ECF2",
  border: "#EBD3DF",
  text: "#2A1220",
  textDim: "#7A5568",
  textFaint: "#7F5D70",
  accent: "#EC4899",
  accentDeep: "#D63384",
  accentSoft: "rgba(236,72,153,0.12)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#D63384", "#EC4899"],
};

// ── Happ ──
const happLight: Palette = {
  bg: "#ECECF4",
  bgSoft: "#E4E4EE",
  card: "#FFFFFF",
  cardLight: "#F2F2F9",
  border: "#D4D4E2",
  text: "#1A1A2E",
  textDim: "#55556E",
  textFaint: "#636381",
  accent: "#6C63FF",
  accentDeep: "#5856D6",
  accentSoft: "rgba(108,99,255,0.10)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#5856D6", "#6C63FF"],
};

const happDark: Palette = {
  bg: "#1A1A2E",
  bgSoft: "#20203A",
  card: "#262642",
  cardLight: "#2C2C4C",
  border: "#44447A",
  text: "#F0F0FF",
  textDim: "#AAAABC",
  textFaint: "#9797B2",
  accent: "#7C74FF",
  accentDeep: "#6C63FF",
  accentSoft: "rgba(124,116,255,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#5856D6", "#7C74FF"],
};

/** «Простой» — светлая, максимально контрастная, для пожилых людей. */
const simpleLight: Palette = {
  bg: "#F5F5F7",
  bgSoft: "#ECECF1",
  card: "#FFFFFF",
  cardLight: "#F0F0F4",
  border: "#D8D8E0",
  text: "#1A1A1E",
  textDim: "#55555E",
  textFaint: "#8A8A95",
  accent: "#3B82F6",
  accentDeep: "#2563EB",
  accentSoft: "rgba(59,130,246,0.12)",
  green: "#22C55E",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#2563EB", "#3B82F6"],
};

const simpleDark: Palette = {
  bg: "#121216",
  bgSoft: "#1A1A1E",
  card: "#1E1E24",
  cardLight: "#26262C",
  border: "#34343C",
  text: "#FFFFFF",
  textDim: "#A5A5AE",
  textFaint: "#6E6E78",
  accent: "#3B82F6",
  accentDeep: "#2563EB",
  accentSoft: "rgba(59,130,246,0.14)",
  green: "#22C55E",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#2563EB", "#3B82F6"],
};

// ── AWG (стиль AmneziaVPN: чёрный фон, контурный круг со свечением,
//    нижняя панель выбора сервера, док из иконок; акцент — фирменный фиолетовый) ──
const awgDark: Palette = {
  bg: "#0D0D0F",
  bgSoft: "#16161A",
  card: "#1E2227",
  cardLight: "#262A30",
  border: "#2E3238",
  text: "#FFFFFF",
  textDim: "#9A9AA5",
  textFaint: "#7A7A85",
  accent: "#A855F7",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(168,85,247,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7C3AED", "#A855F7"],
};

const awgLight: Palette = {
  bg: "#F5F4F2",
  bgSoft: "#EDECEA",
  card: "#FFFFFF",
  cardLight: "#F3F1EE",
  border: "#DCDAD6",
  text: "#17181C",
  textDim: "#5A5B62",
  textFaint: "#6E6F77",
  accent: "#9333EA",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(147,51,234,0.10)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#7C3AED", "#A855F7"],
};

const PALETTES: Record<ThemeName, PalettePair> = {
  default: { dark: defaultDark, light: defaultLight },
  minimalist: { dark: minimalistDark, light: minimalistLight },
  v2ray: { dark: v2rayDark, light: v2rayLight },
  // Liquid Glass: плоский фон (colors.bg) вместо фотообоев — тёмная и светлая
  // вариации как в стандартной теме; переключатель свет/тьма работает.
  glass: { dark: glassDark, light: glassLight },
  foxcloud: { dark: foxcloudDark, light: foxcloudLight },
  pickme: { dark: pickmeDark, light: pickmeLight },
  happ: { dark: happDark, light: happLight },
  simple: { dark: simpleDark, light: simpleLight },
  awg: { dark: awgDark, light: awgLight },
  material: { dark: getMaterialAppPalette(true), light: getMaterialAppPalette(false) },
};

/** «Авто»: светлая днём (в интервале восход–закат), тёмная ночью.
 *  Интервал берётся из расписания: «по солнцу» (восход/закат) или «своё время». */
export function resolveAutoMode(): "dark" | "light" {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  let rise: number;
  let set: number;
  if (
    getSetting("theme_schedule_enabled", "0") === "1" &&
    getSetting("theme_schedule_mode", "sun") === "custom"
  ) {
    rise = toMin(getSetting("theme_custom_rise", "07:00"));
    set = toMin(getSetting("theme_custom_set", "21:00"));
  } else {
    rise = toMin(getSetting("theme_sunrise", "06:00"));
    set = toMin(getSetting("theme_sunset", "20:00"));
  }
  if (rise <= set) return cur >= rise && cur < set ? "light" : "dark";
  // интервал через полночь
  return cur >= rise || cur < set ? "light" : "dark";
}

function resolveMode(mode: ThemeMode): "dark" | "light" {
  return mode === "auto" ? resolveAutoMode() : mode;
}

let activePaletteMode = resolveMode(getThemeMode());
export const colors: any = { ...PALETTES[getThemeName()][activePaletteMode] };

/** Фирменный фиолетовый — как акцент приложения (иконки, значки): яркий
 *  purple-500. Единый цвет названия приложения во всех темах. */
export const BRAND_PURPLE = "#A855F7";

/** Перекрашивает объект colors на месте — все экраны перерисуются при следующем рендере.
 *  Также переключает шрифт темы (свои шрифты у Liquid Glass и v2ray). */
export function applyTheme(style: ThemeName, mode: ThemeMode) {
  const pair = PALETTES[style] || PALETTES.default;
  const resolved = resolveMode(mode);
  Object.assign(colors, style === "material" ? getMaterialAppPalette(resolved === "dark") : pair[resolved] || pair.dark);
  activePaletteMode = resolved;
  setAppFont(fontForTheme(style));
}

export const THEME_LABELS: Record<ThemeName, string> = {
  default: "Основная",
  minimalist: "Минимализм",
  v2ray: "v2ray",
  glass: "Liquid Glass",
  foxcloud: "FoxCloud",
  pickme: "Pink",
  happ: "Happ",
  simple: "Простой",
  awg: "AWG",
  material: "Material You",
};

/** Код разблокировки секретной темы «Простой» (общий для настроек и экрана блокировки) */
export const SIMPLE_UNLOCK_CODE = "8ecctywih";

/** Порядок стилей в списке выбора. «Простой» — секретная тема, в список не входит
 *  (добавляется динамически в настройках после разблокировки кодом). */
export const THEME_ORDER: ThemeName[] = [
  "default",
  "glass",
  "minimalist",
  "foxcloud",
  "pickme",
  "v2ray",
  "happ",
  "awg",
  "material",
];

/** Светлая ли сейчас палитра (для статус-бара и стеклянных эффектов) */
export function isLightPalette(): boolean {
  return activePaletteMode === "light";
}

/** Непрозрачный фон для всплывающих штор/модалок. В теме Liquid Glass
 *  colors.card полупрозрачный и под шторкой просвечивает текст — поэтому
 *  там используется плотный тёмный фон. Размытие внутри RN-модалок не
 *  работает (модалка — отдельное окно), потому именно непрозрачность. */
export function sheetSurfaceBg(): string {
  const c = colors.card;
  if (typeof c === "string" && c.startsWith("rgba")) {
    return "#14141E";
  }
  return c;
}

/** Эталонные цвета кнопки питания — как в основной теме, одинаковые во всех темах.
 *  Меняются только от светлого/тёмного режима, не от стиля темы. */
export function powerButtonColors(): { off: string; on: string; glow: string } {
  return isLightPalette()
    ? { off: "#F3EFFB", on: "#7C3AED", glow: "#9333EA" }
    : { off: "#251A42", on: "#7C3AED", glow: "#A855F7" };
}

// ─── Контекст темы: подписка экранов на перерисовку при смене темы ───

const ThemeCtx = createContext<{ style: ThemeName; mode: ThemeMode; version: number }>({
  style: getThemeName(),
  mode: getThemeMode(),
  version: 0,
});

/** Вызывать в компонентах, чтобы они перерисовывались при смене темы */
export function useTheme() {
  const theme = useContext(ThemeCtx);
  return { ...theme, dark: resolveMode(theme.mode) === "dark" };
}

export type ThemePatch = { style?: ThemeName; mode?: ThemeMode };

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ style: ThemeName; mode: ThemeMode; version: number }>(
    () => ({
      style: getThemeName(),
      mode: getThemeMode(),
      version: 0,
    })
  );

  const change = (patch: ThemePatch) => {
    setState((s) => {
      const style = patch.style ?? s.style;
      const mode = patch.mode ?? s.mode;
      applyTheme(style, mode);
      return { style, mode, version: s.version + 1 };
    });
  };

  // Refresh Monet resources even in explicit dark/light mode.
  useEffect(() => {
    const refresh = () => {
      const changed = refreshMaterialPalette();
      if (!changed) return;
      setState((prev) => {
        if (prev.style === "material") applyTheme(prev.style, prev.mode);
        return { ...prev, version: prev.version + 1 };
      });
    };
    refresh();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => subscription.remove();
  }, []);

  // Авто-режим: переоцениваем при возврате в приложение и раз в минуту
  useEffect(() => {
    if (state.mode !== "auto") return;
    const reapply = () => {
      setState((prev) => {
        applyTheme(prev.style, "auto");
        return { ...prev, version: prev.version + 1 };
      });
    };
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      reapply();
    });
    const timer = setInterval(reapply, 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [state.mode]);

  return (
    <ThemeCtx.Provider value={state}>
      <ThemeSwitcherContext.Provider value={change}>{children}</ThemeSwitcherContext.Provider>
    </ThemeCtx.Provider>
  );
}

const ThemeSwitcherContext = createContext<(patch: ThemePatch) => void>(() => {});

export function useThemeSwitcher() {
  return useContext(ThemeSwitcherContext);
}

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
};

/** Единая типографическая шкала. Использовать вместо произвольных
 *  fontSize по всему коду; иерархия: display → title → heading → body → sub → caption. */
export const typo: Record<
  "display" | "title" | "heading" | "body" | "bodyStrong" | "sub" | "caption",
  { fontSize: number; fontWeight: "500" | "600" | "700" | "800"; lineHeight: number }
> = {
  display: { fontSize: 30, fontWeight: "800", lineHeight: 36 },
  title: { fontSize: 26, fontWeight: "800", lineHeight: 32 },
  heading: { fontSize: 16, fontWeight: "800", lineHeight: 21 },
  body: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  sub: { fontSize: 13, fontWeight: "500", lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: "600", lineHeight: 15 },
};

/** Минимальный размер тач-таргета (44 — гайдлайн; 40 допустимо в плотных списках). */
export const hit = { min: 44, dense: 40 };

/** Единые пороги и цвета пинга для всех экранов.
 *  4 уровня: до 150 мс — отлично (зелёный), до 300 мс — приемлемо (жёлтый),
 *  свыше — медленно (оранжевый); таймаут/ошибка рисуется красным отдельно
 *  (см. pingFailLabel). */
export const PING_GOOD = 150;
export const PING_WARN = 300;

/** Средний (жёлтый) и медленный (оранжевый) уровни шкалы пинга.
 *  Задаются явно, а не через палитры: в палитрах нет поля yellow, а
 *  `orange` там янтарный (#FBBF24/#D97706) и почти не отличим от жёлтого —
 *  уровни сливались бы. Плюс в pickme `orange` вообще розовый #FF69B4.
 *  Вариант для светлых палитр — по образцу powerButtonColors(). */
export function pingWarnColor(): string {
  return isLightPalette() ? "#CA8A04" : "#FDE047";
}
export function pingBadColor(): string {
  return isLightPalette() ? "#C2410C" : "#FB923C";
}

export function pingColor(delay: number): string {
  if (delay < PING_GOOD) return colors.green;
  if (delay < PING_WARN) return pingWarnColor();
  return pingBadColor();
}

/** Подпись непроверенного узла рядом со значением пинга (красным).
 *  «Timeout» — для недоступных/не отвечавших узлов; для честного ограничения
 *  (URL-тест невозможен при включённом VPN) — отдельный короткий текст,
 *  иначе «Timeout» вводил бы в заблуждение. */
export function pingFailLabel(error?: string): string {
  if (error && /вкл\. VPN/i.test(error)) return "нет при VPN";
  if (error && /LTE не измеряется через TCP/i.test(error)) return "нужен True Ping";
  return "Timeout";
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i < 2 ? 0 : 1)} ${units[i]}`;
}

const COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  нидерланды: { name: "Нидерланды", flag: "🇳🇱" },
  netherlands: { name: "Нидерланды", flag: "🇳🇱" },
  nl: { name: "Нидерланды", flag: "🇳🇱" },
  германия: { name: "Германия", flag: "🇩🇪" },
  germany: { name: "Германия", flag: "🇩🇪" },
  de: { name: "Германия", flag: "🇩🇪" },
  финляндия: { name: "Финляндия", flag: "🇫🇮" },
  finland: { name: "Финляндия", flag: "🇫🇮" },
  fi: { name: "Финляндия", flag: "🇫🇮" },
  швеция: { name: "Швеция", flag: "🇸🇪" },
  sweden: { name: "Швеция", flag: "🇸🇪" },
  се: { name: "Швеция", flag: "🇸🇪" },
  франция: { name: "Франция", flag: "🇫🇷" },
  france: { name: "Франция", flag: "🇫🇷" },
  сша: { name: "США", flag: "🇺🇸" },
  usa: { name: "США", flag: "🇺🇸" },
  us: { name: "США", flag: "🇺🇸" },
  англия: { name: "Великобритания", flag: "🇬🇧" },
  uk: { name: "Великобритания", flag: "🇬🇧" },
  gb: { name: "Великобритания", flag: "🇬🇧" },
  турция: { name: "Турция", flag: "🇹🇷" },
  turkey: { name: "Турция", flag: "🇹🇷" },
  tr: { name: "Турция", flag: "🇹🇷" },
  япония: { name: "Япония", flag: "🇯🇵" },
  japan: { name: "Япония", flag: "🇯🇵" },
  казахстан: { name: "Казахстан", flag: "🇰🇿" },
  kz: { name: "Казахстан", flag: "🇰🇿" },
  россия: { name: "Россия", flag: "🇷🇺" },
  russia: { name: "Россия", flag: "🇷🇺" },
  польша: { name: "Польша", flag: "🇵🇱" },
  poland: { name: "Польша", flag: "🇵🇱" },
  австрия: { name: "Австрия", flag: "🇦🇹" },
  austria: { name: "Австрия", flag: "🇦🇹" },
  швейцария: { name: "Швейцария", flag: "🇨🇭" },
  switzerland: { name: "Швейцария", flag: "🇨🇭" },
  норвегия: { name: "Норвегия", flag: "🇳🇴" },
  norway: { name: "Норвегия", flag: "🇳🇴" },
  гонконг: { name: "Гонконг", flag: "🇭🇰" },
  hongkong: { name: "Гонконг", flag: "🇭🇰" },
  сингапур: { name: "Сингапур", flag: "🇸🇬" },
  singapore: { name: "Сингапур", flag: "🇸🇬" },
  эстония: { name: "Эстония", flag: "🇪🇪" },
  estonia: { name: "Эстония", flag: "🇪🇪" },
  ee: { name: "Эстония", flag: "🇪🇪" },
  италия: { name: "Италия", flag: "🇮🇹" },
  italy: { name: "Италия", flag: "🇮🇹" },
  it: { name: "Италия", flag: "🇮🇹" },
  бразилия: { name: "Бразилия", flag: "🇧🇷" },
  brazil: { name: "Бразилия", flag: "🇧🇷" },
  br: { name: "Бразилия", flag: "🇧🇷" },
  испания: { name: "Испания", flag: "🇪🇸" },
  spain: { name: "Испания", flag: "🇪🇸" },
  es: { name: "Испания", flag: "🇪🇸" },
  канада: { name: "Канада", flag: "🇨🇦" },
  canada: { name: "Канада", flag: "🇨🇦" },
  ca: { name: "Канада", flag: "🇨🇦" },
};

export function countryFromName(name: string): { name: string; flag: string } | null {
  const lower = (name || "").toLowerCase();
  // Сначала длинные ключи: иначе «sweden» матчится по «de» (Германия),
  // «finland» — по «fi»/«nl» и т.п. — страна определяется неверно.
  const keys = Object.keys(COUNTRY_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (key.length <= 2) {
      // Короткие коды — только отдельным токеном: иначе «сервер» содержит
      // «се» (Швеция), «тест» — «es» (Испания) и т.п.
      const re = new RegExp(`(^|[^a-zа-яё0-9])${key}([^a-zа-яё0-9]|$)`);
      if (re.test(lower)) return COUNTRY_MAP[key];
    } else if (lower.includes(key)) {
      return COUNTRY_MAP[key];
    }
  }
  return null;
}

/** Обратный индекс: эмодзи флага → страна. Флаг — первый символ имени сервера
 *  в подписке, это самый надёжный источник страны (текст имени может быть
 *  на любом языке и с номерами: «🇸🇪 Швеция | HY2», «🇩🇪 LTE 2»). */
const FLAG_TO_COUNTRY: Record<string, { name: string; flag: string }> = (() => {
  const m: Record<string, { name: string; flag: string }> = {};
  for (const key of Object.keys(COUNTRY_MAP)) {
    const v = COUNTRY_MAP[key];
    if (v?.flag && !m[v.flag]) m[v.flag] = v;
  }
  return m;
})();

/** Страна по эмодзи флага (🇸🇪 → Швеция). */
export function countryFromFlag(flag: string): { name: string; flag: string } | null {
  if (!flag) return null;
  return FLAG_TO_COUNTRY[flag] || null;
}

/** Ведущие декоративные эмодзи + разделители перед именем сервера
 *  («🚀 Лучший сервер» → ракета и пробел). Флаги стран обрабатываются отдельно. */
const LEADING_EMOJI_RE = /^(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2190-\u2BFF\uFE0F])+[\s|·-]*/;

/** Отделяет флаг-эмодзи из начала имени сервера.
 *  Возвращает флаг (или подобранный по стране) и имя без флагов/разделителей.
 *  Сервер «Лучший сервер» (url-test группа из подписки) помечается молнией ⚡
 *  вместо флага — это не страна, а агрегатор лучшего узла. */
export function splitNameFlag(raw: string): { flag: string; name: string } {
  let name = (raw || "").trim();
  let flag = "";
  while (name.length >= 2) {
    const c1 = name.charCodeAt(0);
    const c2 = name.charCodeAt(1);
    if (c1 === 0xd83c && c2 >= 0xdde6 && c2 <= 0xddff) {
      flag += name.slice(0, 2);
      name = name.slice(2).trim();
      while (name.startsWith("|") || name.startsWith("-") || name.startsWith("·")) {
        name = name.slice(1).trim();
      }
    } else {
      break;
    }
  }
  if (/лучш/i.test(name)) {
    // Убираем ведущий декоративный эмодзи (🚀/⚡/✨), чтобы он не дублировал молнию
    return { flag: "⚡", name: name.replace(LEADING_EMOJI_RE, "").trim() };
  }
  if (!flag) {
    const c = countryFromName(name);
    flag = c?.flag || "🌍";
  }
  return { flag, name };
}
