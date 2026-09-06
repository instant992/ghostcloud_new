/** Фильтр соединения — профили обхода «Для чего НЕ нужен VPN».
 *  Перенесено из эталонного приложения (bypass_profiles_page.dart + bypass_profile_scope.dart):
 *  встроенные профили «Для России», «Для России 2 (приложения)», «Россия (LTE)»
 *  + до 5 своих профилей. У каждого — сетевой режим (Везде / Wi-Fi / LTE);
 *  одновременно может работать несколько профилей с разными сетями. */

import { getSetting, setSetting } from "../settings";
import {
  RUSSIA_DIRECT_PACKAGES,
  RUSSIA_LTE_PACKAGES,
  RUSSIA_DIRECT_DOMAINS,
} from "./connectionFilterData";

/** Сетевой режим, в котором применяется профиль */
export type BypassScope = "all" | "wifi" | "mobile";

export const SCOPE_LABELS: Record<BypassScope, string> = {
  all: "Везде",
  wifi: "Wi-Fi",
  mobile: "Моб. (LTE)",
};

export type BypassProfile = {
  id: string;
  name: string;
  builtin?: boolean;
  domains: string[];
  packages: string[];
};

export const BUILTIN_RUSSIA_ID = "__builtin_russia__";
export const BUILTIN_RUSSIA_APPS2_ID = "__builtin_russia_apps2__";
export const BUILTIN_RUSSIA_LTE_ID = "__builtin_russia_lte__";
export const BUILTIN_ROSCOMVPN_ID = "__builtin_roscomvpn__";

/** Описание профиля RoscomVPN (роутинг по geo-категориям, правила в конфиге ядра) */
export const ROSCOMVPN_DESCRIPTION =
  "Роском-роутинг: RU-сервисы, банки и игры идут напрямую, YouTube, Telegram и GitHub — через VPN, реклама, торренты и слежка — блокируются. На LTE Open работает режим «белый список»: напрямую только сайты из белого списка РФ.";

/** Встроенные профили — защищены от удаления и редактирования */
export const BUILTIN_PROFILES: BypassProfile[] = [
  {
    id: BUILTIN_RUSSIA_ID,
    name: "Для России",
    builtin: true,
    domains: RUSSIA_DIRECT_DOMAINS,
    packages: [],
  },
  {
    id: BUILTIN_RUSSIA_APPS2_ID,
    name: "Для России 2 (приложения)",
    builtin: true,
    domains: [],
    packages: RUSSIA_DIRECT_PACKAGES,
  },
  {
    id: BUILTIN_RUSSIA_LTE_ID,
    name: "Россия (LTE)",
    builtin: true,
    domains: [],
    packages: RUSSIA_LTE_PACKAGES,
  },
  {
    // Особый профиль: не списки «мимо VPN», а geo-правила в конфигурации ядра
    // (RoscomVPN routing). Режим выбирается автоматически по типу сервера:
    // обычные — DEFAULT, LTE Open — WHITELIST.
    id: BUILTIN_ROSCOMVPN_ID,
    name: "RoscomVPN (роутинг)",
    builtin: true,
    domains: [],
    packages: [],
  },
];

export function isBuiltinProfileId(id: string): boolean {
  return BUILTIN_PROFILES.some((p) => p.id === id);
}

export function profileById(id: string, userProfiles: BypassProfile[]): BypassProfile | null {
  return BUILTIN_PROFILES.find((p) => p.id === id) || userProfiles.find((p) => p.id === id) || null;
}

export type FilterSettings = {
  /** Пользовательские профили (встроенные в коде) */
  profiles: BypassProfile[];
  /** profileId -> сетевой режим */
  scopes: Record<string, BypassScope>;
  /** Активные профили (может быть несколько с разными сетями) */
  active: string[];
};

const SETTINGS_KEY = "connection_filter_v1";
/** Максимум своих профилей — как в эталоне */
export const MAX_USER_PROFILES = 5;

export function loadFilterSettings(): FilterSettings {
  const empty: FilterSettings = { profiles: [], scopes: {}, active: [] };
  try {
    const raw = getSetting(SETTINGS_KEY, "");
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty;
    return {
      profiles: Array.isArray(parsed.profiles)
        ? parsed.profiles
            .filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string")
            .map((p: any) => ({
              id: String(p.id),
              name: String(p.name),
              domains: Array.isArray(p.domains) ? p.domains.map(String).filter(Boolean) : [],
              packages: Array.isArray(p.packages) ? p.packages.map(String).filter(Boolean) : [],
            }))
        : [],
      scopes: parsed.scopes && typeof parsed.scopes === "object" ? parsed.scopes : {},
      active: Array.isArray(parsed.active) ? parsed.active.map(String) : [],
    };
  } catch {
    return empty;
  }
}

export function saveFilterSettings(s: FilterSettings): void {
  setSetting(SETTINGS_KEY, JSON.stringify(s));
}

export function getScope(s: FilterSettings, id: string): BypassScope {
  const stored = s.scopes[id];
  if (stored === "wifi" || stored === "mobile" || stored === "all") return stored;
  // Профиль «Россия (LTE)» по умолчанию работает только в мобильной сети
  return id === BUILTIN_RUSSIA_LTE_ID ? "mobile" : "all";
}

/** Применяется ли режим к типу сети (тип сети: wifi / mobile / ethernet / other) */
export function scopeMatches(scope: BypassScope, netType: string): boolean {
  if (scope === "all") return true;
  if (scope === "wifi") return netType === "wifi" || netType === "ethernet";
  return netType === "mobile";
}

/** Пересекаются ли два сетевых режима (нельзя активировать одновременно).
 *  «Везде» конфликтует с любым; одинаковые конфликтуют; Wi-Fi и LTE — нет. */
export function scopesConflict(a: BypassScope, b: BypassScope): boolean {
  if (a === "all" || b === "all") return true;
  return a === b;
}

/** Активация профиля: снимает все профили с пересекающимся режимом сети */
export function activateProfile(s: FilterSettings, id: string): FilterSettings {
  const scope = getScope(s, id);
  const active = s.active.filter((other) => {
    if (other === id) return false;
    return !scopesConflict(scope, getScope(s, other));
  });
  active.push(id);
  return { ...s, active };
}

export function deactivateProfile(s: FilterSettings, id: string): FilterSettings {
  return { ...s, active: s.active.filter((a) => a !== id) };
}

/** Итоговый результат фильтра для текущей сети:
 *  пакеты «мимо VPN» и домены «мимо VPN» из всех активных подходящих профилей. */
export function computeBypassForNetwork(s: FilterSettings, netType: string): {
  packages: string[];
  domains: string[];
} {
  const packages = new Set<string>();
  const domains = new Set<string>();
  for (const id of s.active) {
    const p = profileById(id, s.profiles);
    if (!p) continue;
    if (!scopeMatches(getScope(s, id), netType)) continue;
    for (const pkg of p.packages) packages.add(pkg.trim());
    for (const d of p.domains) {
      const clean = d.trim().toLowerCase();
      if (clean) domains.add(clean);
    }
  }
  return { packages: [...packages].filter(Boolean), domains: [...domains] };
}

/** Есть ли активные профили, которые зависят от типа сети (не «Везде») —
 *  таким нужен рестарт при смене сети. */
export function hasNetworkDependentProfiles(s: FilterSettings): boolean {
  return s.active.some((id) => getScope(s, id) !== "all");
}

/** Активен ли профиль RoscomVPN для текущей сети (роутинг в конфиге ядра).
 *  Возвращает режим: "whitelist" для LTE-узлов, "default" для обычных. */
export function roscomRoutingForNetwork(
  s: FilterSettings,
  netType: string
): import("./roscomRouting").RoscomMode | null {
  if (!s.active.includes(BUILTIN_ROSCOMVPN_ID)) return null;
  if (!scopeMatches(getScope(s, BUILTIN_ROSCOMVPN_ID), netType)) return null;
  return "default"; // режим уточняется по типу узла в manager.ts (LTE → whitelist)
}

export function newUserId(): string {
  return `user_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
