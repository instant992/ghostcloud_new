import { getThemeName } from "./settings";

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

export const colors: any = { ...(getThemeName() === "light" ? lightColors : darkColors) };

/** Перекрашивает объект colors (применяется при перезагрузке JS-бандла) */
export function applyTheme(name: "dark" | "light") {
  Object.assign(colors, name === "light" ? lightColors : darkColors);
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
