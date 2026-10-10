import { requireNativeModule, Platform } from "expo-modules-core";

let native: any = null;
if (Platform.OS === "android") {
  try {
    native = requireNativeModule("XrayCore");
  } catch {
    native = null;
  }
}

/** Стили темы (дизайн). Режим (dark/light/auto) хранится отдельно в "theme_mode". */
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
export type ThemeMode = "dark" | "light" | "auto";
export type CoreName = "xray" | "sing-box" | "uwuray";

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
  "default",
  "minimalist",
  "v2ray",
  "glass",
  "foxcloud",
  "pickme",
  "happ",
  "simple",
  "awg",
  "material",
];

export function getThemeName(): ThemeName {
  const v = getSetting("theme", "glass");
  if ((THEME_NAMES as string[]).includes(v)) return v as ThemeName;
  // старые значения (когда режим и стиль хранились вместе) → стиль «Основная»
  if (v === "dark" || v === "light" || v === "auto") return "default";
  return "glass";
}

const THEME_MODES: ThemeMode[] = ["dark", "light", "auto"];

export function getThemeMode(): ThemeMode {
  const v = getSetting("theme_mode", "");
  if ((THEME_MODES as string[]).includes(v)) return v as ThemeMode;
  // миграция со старого единого значения темы
  const legacy = getSetting("theme", "");
  if (legacy === "light") return "light";
  if (legacy === "auto") return "auto";
  // Happ и Простой исторически светлые темы
  if (legacy === "happ" || legacy === "simple") return "light";
  return "dark";
}

export function getSelectedCore(): CoreName {
  const v = getSetting("core", "xray");
  if (v === "sing-box") return "sing-box";
  if (v === "uwuray") return "uwuray";
  // Mihomo убран из приложения: ранее выбранное ядро мигрируем на встроенный Xray,
  // иначе в настройках не было бы активного пункта, а подключение падало бы.
  if (v === "mihomo") {
    setSetting("core", "xray");
    return "xray";
  }
  return "xray";
}

/** Маскировка трафика (анти-DPI): фрагментация TLS ClientHello средствами
 *  finalmask ядра Xray. По умолчанию включена — это чисто клиентская
 *  маскировка (TCP-поток сервер собирает обратно), настройка серверов
 *  не требуется. На ядре sing-box не применяется (нет finalmask). */
export function getAntiDpi(): boolean {
  return getSetting("antidpi", "1") === "1";
}

export function setAntiDpi(v: boolean) {
  setSetting("antidpi", v ? "1" : "0");
}

/** Kill Switch: блокирующий туннель (VpnService.setBlocking(true)).
 *  При обрыве/смерти ядра Android режет весь трафик вместо утечки напрямую.
 *  Читается нативными сервисами прямо из gc_settings (ключ "killswitch"),
 *  поэтому применяется ко всем путям старта: приложение, плитка, бут-ресивер.
 *  По умолчанию выключен. */
export function getKillSwitch(): boolean {
  return getSetting("killswitch", "0") === "1";
}

export function setKillSwitch(v: boolean) {
  setSetting("killswitch", v ? "1" : "0");
}

/** Автоподключение при запуске приложения (бут-эффект в context.tsx). */
export function getAutoConnect(): boolean {
  return getSetting("autoconnect", "0") === "1";
}

export function setAutoConnect(v: boolean) {
  setSetting("autoconnect", v ? "1" : "0");
}

/** Автоподключение при загрузке устройства (нативный BootReceiver,
 *  ключ "autoboot" — ресивер читает его до старта JS). */
export function getAutoConnectBoot(): boolean {
  return getSetting("autoboot", "0") === "1";
}

export function setAutoConnectBoot(v: boolean) {
  setSetting("autoboot", v ? "1" : "0");
}

/** Метод проверки пинга:
 *  - "tcp": рукопожатие TCP с портом сервера (быстро, работает всегда);
 *  - "url": полный тест протоколом через прокси-туннель (Xray pingBatch,
 *    HTTP GET через прокси — как «via proxy get» в happ) — точнее, но дольше
 *    и не работает при уже включённом VPN.
 *  По умолчанию — "url": TCP-рукопожатие к REALITY-серверам с анти-блокировкой
 *  часто не проходит, и рабочие серверы ложно помечались «недоступен».
 *  UDP/ICMP-пинг на Android без root невозможен (нет сырых сокетов). */
export type PingMethod = "tcp" | "url";

export function getPingMethod(): PingMethod {
  return getSetting("ping_method", "url") === "tcp" ? "tcp" : "url";
}

export function setPingMethod(v: PingMethod) {
  setSetting("ping_method", v);
}

/** URL для URL-теста пинга (True Ping: HTTP HEAD через прокси-туннель).
 *  По умолчанию — connectivity-check Xiaomi MIUI: работает из российских
 *  сетей, в отличие от gstatic.com, который периодически недоступен и
 *  ронял весь URL-тест в «недоступен». Свой URL можно задать в настройках. */
export const DEFAULT_PING_URL = "http://connect.rom.miui.com/generate_204";

/** Пул резервных URL для True Ping.
 *  libXray шлёт HEAD и НЕ проверяет статус-код (nodep/measure.go,
 *  PingHTTPRequest: задержка = время до ответа, тело не читается), поэтому
 *  подходит любой стабильно отвечающий хост — не только generate_204.
 *  Порядок — по измеренной доступности/скорости HEAD из РФ-сети:
 *  apple 12 мс, msft 26 мс, firefox 29 мс, gstatic 61–84 мс,
 *  cloudflare 61 мс (нестабилен, периодически блокируется — поэтому последний). */
export const PING_URL_POOL = [
  "http://captive.apple.com/hotspot-detect.html",
  "http://www.msftconnecttest.com/connecttest.txt",
  "http://detectportal.firefox.com/success.txt",
  "https://www.gstatic.com/generate_204",
  "https://cp.cloudflare.com/generate_204",
];

/** URL-кандидаты для True Ping. Если пользователь задал свой URL — используется
 *  только он (явный выбор важнее пула); иначе дефолт + пул по порядку. */
export function getPingUrlCandidates(): string[] {
  const custom = (getSetting("ping_url", "") || "").trim();
  if (/^https?:\/\/\S+$/i.test(custom)) return [custom];
  return [DEFAULT_PING_URL, ...PING_URL_POOL];
}

export function getPingUrl(): string {
  const v = (getSetting("ping_url", "") || "").trim();
  return /^https?:\/\/\S+$/i.test(v) ? v : DEFAULT_PING_URL;
}

/** Сырое значение настройки: пустая строка означает «пул адресов», а не дефолт.
 *  Нужно в UI, чтобы отличать явный выбор пользователя от авто-режима. */
export function getPingUrlRaw(): string {
  return (getSetting("ping_url", "") || "").trim();
}

export function setPingUrl(v: string) {
  setSetting("ping_url", (v || "").trim());
}

/** Список строк в настройках (закреплённые серверы, избранное и т.п.) */
export function getJsonList(key: string): string[] {
  try {
    const raw = getSetting(key, "");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setJsonList(key: string, list: string[]) {
  setSetting(key, JSON.stringify(list));
}
