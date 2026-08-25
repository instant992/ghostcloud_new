import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getThemeName, getSetting } from "./settings";

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

/** Основная тема — фирменная тёмная с фиолетовым акцентом */
const defaultColors = {
  bg: "#0F0B1E",
  bgSoft: "#160F2B",
  card: "#1C1433",
  cardLight: "#251A42",
  border: "#2E2150",
  text: "#FFFFFF",
  textDim: "#9C93B8",
  textFaint: "#655A85",
  accent: "#A855F7",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(168,85,247,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7C3AED", "#A855F7"] as const,
};

/** Чисто тёмная — пока та же палитра, что и основная */
const darkColors = {
  bg: "#0F0B1E",
  bgSoft: "#160F2B",
  card: "#1C1433",
  cardLight: "#251A42",
  border: "#2E2150",
  text: "#FFFFFF",
  textDim: "#9C93B8",
  textFaint: "#655A85",
  accent: "#A855F7",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(168,85,247,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7C3AED", "#A855F7"] as const,
};

const lightColors = {
  bg: "#F4F2FA",
  bgSoft: "#EAE6F5",
  card: "#FFFFFF",
  cardLight: "#F3EFFB",
  border: "#E0D9F0",
  text: "#171226",
  textDim: "#5E5578",
  textFaint: "#9A92B0",
  accent: "#9333EA",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(147,51,234,0.10)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#7C3AED", "#A855F7"] as const,
};

/** Минимализм — тёмная таёжная тема (почти чёрная + фиолетовый акцент), как во Flutter-версии */
const minimalistColors = {
  bg: "#08080E",
  bgSoft: "#0A0A14",
  card: "#0E0C16",
  cardLight: "#14121F",
  border: "#1E1B2C",
  text: "#FFFFFF",
  textDim: "#8E88A6",
  textFaint: "#5C5772",
  accent: "#9B59B6",
  accentDeep: "#7B2FBE",
  accentSoft: "rgba(155,89,182,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7B2FBE", "#9B59B6"] as const,
};

/** v2ray — спокойная сине-циановая техническая палитра в духе v2rayNG */
const v2rayColors = {
  bg: "#05111F",
  bgSoft: "#071A2E",
  card: "#061522",
  cardLight: "#0A2036",
  border: "#12263C",
  text: "#FFFFFF",
  textDim: "#8CA6C4",
  textFaint: "#54708F",
  accent: "#3B82F6",
  accentDeep: "#2563EB",
  accentSoft: "rgba(59,130,246,0.14)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#2563EB", "#3B82F6"] as const,
};

/** Liquid Glass — нейтральные тёмные полупрозрачные поверхности */
const glassColors = {
  bg: "#0C0C12",
  bgSoft: "#101018",
  card: "rgba(255,255,255,0.05)",
  cardLight: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textDim: "#9C99AD",
  textFaint: "#66637A",
  accent: "#8B5CF6",
  accentDeep: "#7C3AED",
  accentSoft: "rgba(139,92,246,0.13)",
  green: "#34D399",
  red: "#F87171",
  orange: "#FBBF24",
  gradient: ["#7C3AED", "#8B5CF6"] as const,
};

/** FoxCloud — тёплые тёмные поверхности с оранжевым акцентом */
const foxcloudColors = {
  bg: "#110E0A",
  bgSoft: "#181410",
  card: "#1E1A14",
  cardLight: "#26201A",
  border: "#2E2820",
  text: "#FFFFFF",
  textDim: "#CCBBAA",
  textFaint: "#8A7A68",
  accent: "#E8720C",
  accentDeep: "#C25E00",
  accentSoft: "rgba(232,114,12,0.14)",
  green: "#34D399",
  red: "#EF4444",
  orange: "#F59E0B",
  gradient: ["#E8720C", "#F59E0B"] as const,
};

/** Pink (pickme) — нежная розово-лиловая тема */
const pickmeColors = {
  bg: "#170910",
  bgSoft: "#1F0D16",
  card: "#26101B",
  cardLight: "#301524",
  border: "#3A1A2C",
  text: "#FFFFFF",
  textDim: "#C99BB2",
  textFaint: "#8A6274",
  accent: "#EC4899",
  accentDeep: "#D63384",
  accentSoft: "rgba(236,72,153,0.14)",
  green: "#4ADE80",
  red: "#FB7185",
  orange: "#FF69B4",
  gradient: ["#D63384", "#EC4899"] as const,
};

/** Happ — светлая неоморфная тема: белый фон, мягкие тени, индиго-акцент */
const happColors = {
  bg: "#ECECF4",
  bgSoft: "#E4E4EE",
  card: "#FFFFFF",
  cardLight: "#F2F2F9",
  border: "#D4D4E2",
  text: "#1A1A2E",
  textDim: "#55556E",
  textFaint: "#9090AA",
  accent: "#6C63FF",
  accentDeep: "#5856D6",
  accentSoft: "rgba(108,99,255,0.10)",
  green: "#059669",
  red: "#DC2626",
  orange: "#D97706",
  gradient: ["#5856D6", "#6C63FF"] as const,
};

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

const PALETTES: Record<Exclude<ThemeName, "auto">, Palette> = {
  default: defaultColors,
  dark: darkColors,
  light: lightColors,
  minimalist: minimalistColors,
  v2ray: v2rayColors,
  glass: glassColors,
  foxcloud: foxcloudColors,
  pickme: pickmeColors,
  happ: happColors,
};

/** «Авто»: светлая днём (в интервале восход–закат), тёмная ночью */
export function resolveAutoTheme(): "dark" | "light" {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const rise = toMin(getSetting("theme_sunrise", "06:00"));
  const set = toMin(getSetting("theme_sunset", "20:00"));
  if (rise <= set) return cur >= rise && cur < set ? "light" : "dark";
  // интервал через полночь
  return cur >= rise || cur < set ? "light" : "dark";
}

function storedTheme(): ThemeName {
  return getThemeName();
}

function resolveTheme(name: ThemeName): Exclude<ThemeName, "auto"> {
  return name === "auto" ? resolveAutoTheme() : name;
}

export const colors: any = { ...PALETTES[resolveTheme(storedTheme())] };

/** Перекрашивает объект colors на месте — все экраны перерисуются при следующем рендере */
export function applyTheme(name: ThemeName) {
  Object.assign(colors, PALETTES[resolveTheme(name)] || defaultColors);
}

export const THEME_LABELS: Record<ThemeName, string> = {
  auto: "Авто",
  default: "Основная",
  dark: "Тёмная",
  light: "Светлая",
  minimalist: "Минимализм",
  v2ray: "v2ray",
  glass: "Liquid Glass",
  foxcloud: "FoxCloud",
  pickme: "Pink",
  happ: "Happ",
};

/** Порядок тем в списке выбора — как во Flutter-версии */
export const THEME_ORDER: ThemeName[] = [
  "auto",
  "default",
  "dark",
  "light",
  "minimalist",
  "glass",
  "foxcloud",
  "pickme",
  "v2ray",
  "happ",
];

/** Светлые темы (для авто-переключения и подбора иконки) */
export function isLightTheme(name: ThemeName): boolean {
  if (name === "light" || name === "happ") return true;
  return false;
}

// ─── Контекст темы: подписка экранов на перерисовку при смене темы ───

const ThemeCtx = createContext<{ name: ThemeName; version: number }>({
  name: storedTheme(),
  version: 0,
});

/** Вызывать в компонентах, чтобы они перерисовывались при смене темы */
export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ name: ThemeName; version: number }>(() => ({
    name: storedTheme(),
    version: 0,
  }));

  const change = (name: ThemeName) => {
    applyTheme(name);
    setState((s) => ({ name, version: s.version + 1 }));
  };

  // Авто-тема: переоцениваем при возврате в приложение и раз в минуту
  useEffect(() => {
    if (state.name !== "auto") return;
    const reapply = () => {
      applyTheme("auto");
      setState((prev) => ({ name: prev.name, version: prev.version + 1 }));
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
  }, [state.name]);

  return (
    <ThemeCtx.Provider value={state}>
      <ThemeSwitcherContext.Provider value={change}>{children}</ThemeSwitcherContext.Provider>
    </ThemeCtx.Provider>
  );
}

const ThemeSwitcherContext = createContext<(name: ThemeName) => void>(() => {});

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
};

export function countryFromName(name: string): { name: string; flag: string } | null {
  const lower = (name || "").toLowerCase();
  for (const key of Object.keys(COUNTRY_MAP)) {
    if (lower.includes(key)) return COUNTRY_MAP[key];
  }
  return null;
}

/** Отделяет флаг-эмодзи из начала имени сервера.
 *  Возвращает флаг (или подобранный по стране) и имя без флагов/разделителей. */
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
  if (!flag) {
    const c = countryFromName(name);
    flag = c?.flag || "🌍";
  }
  return { flag, name };
}
