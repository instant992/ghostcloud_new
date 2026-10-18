import * as SecureStore from "expo-secure-store";

const KEYS = {
  subUrl: "gc_sub_url",
  rwSubUrl: "gc_rw_sub_url",
  combinedSubUrl: "gc_combined_sub_url",
  hy2SubUrl: "gc_hy2_sub_url",
  hwid: "gc_hwid",
  login: "gc_login",
  email: "gc_email",
  tgId: "gc_tg_id",
  isFoxcloud: "gc_is_foxicloud",
  selectedNode: "gc_selected_node",
};

function uuidv4(): string {
  let out = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < 32; i++) {
    if (i === 12) {
      out += "4";
      continue;
    }
    if (i === 16) {
      out += chars[Math.floor(Math.random() * 4) + 8];
      continue;
    }
    out += chars[Math.floor(Math.random() * 16)];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

export async function getHwid(): Promise<string> {
  let hwid = await SecureStore.getItemAsync(KEYS.hwid);
  if (!hwid) {
    hwid = uuidv4();
    await SecureStore.setItemAsync(KEYS.hwid, hwid);
  }
  return hwid;
}

/** Заголовки устройства для Remnawave HWID-лимита */
export async function deviceHeaders(): Promise<Record<string, string>> {
  const hwid = await getHwid();
  let model = "android";
  let osVer = "";
  try {
    const Device = require("expo-device");
    if (Device.modelName) model = String(Device.modelName);
    if (Device.osVersion) osVer = String(Device.osVersion);
  } catch {}
  return {
    "x-hwid": hwid,
    "x-device-os": "android",
    "x-ver-os": osVer,
    "x-device-model": model,
  };
}

export type Session = {
  subUrl: string;
  rwSubUrl?: string;
  combinedSubUrl?: string;
  hy2SubUrl?: string;
  login?: string;
  email?: string;
  /** Telegram ID — для FoxiCloud-сессий (авторизация через бота) */
  tgId?: string;
  /** true = Telegram-авторизация (FoxiCloud): урезанный режим приложения */
  isFoxcloud?: boolean;
};

export async function saveSession(s: Session): Promise<void> {
  await SecureStore.setItemAsync(KEYS.subUrl, s.subUrl);
  if (s.rwSubUrl) await SecureStore.setItemAsync(KEYS.rwSubUrl, s.rwSubUrl);
  else await SecureStore.deleteItemAsync(KEYS.rwSubUrl);
  if (s.combinedSubUrl) await SecureStore.setItemAsync(KEYS.combinedSubUrl, s.combinedSubUrl);
  else await SecureStore.deleteItemAsync(KEYS.combinedSubUrl);
  if (s.hy2SubUrl) await SecureStore.setItemAsync(KEYS.hy2SubUrl, s.hy2SubUrl);
  else await SecureStore.deleteItemAsync(KEYS.hy2SubUrl);
  if (s.login) await SecureStore.setItemAsync(KEYS.login, s.login);
  if (s.email) await SecureStore.setItemAsync(KEYS.email, s.email);
  if (s.tgId) await SecureStore.setItemAsync(KEYS.tgId, s.tgId);
  else await SecureStore.deleteItemAsync(KEYS.tgId);
  if (s.isFoxcloud) await SecureStore.setItemAsync(KEYS.isFoxcloud, "1");
  else await SecureStore.deleteItemAsync(KEYS.isFoxcloud);
}

export async function loadSession(): Promise<Session | null> {
  const subUrl = await SecureStore.getItemAsync(KEYS.subUrl);
  const rwSubUrl = await SecureStore.getItemAsync(KEYS.rwSubUrl);
  if (!subUrl && !rwSubUrl) return null;
  return {
    subUrl: subUrl || rwSubUrl || "",
    rwSubUrl: rwSubUrl || undefined,
    combinedSubUrl: (await SecureStore.getItemAsync(KEYS.combinedSubUrl)) || undefined,
    hy2SubUrl: (await SecureStore.getItemAsync(KEYS.hy2SubUrl)) || undefined,
    login: (await SecureStore.getItemAsync(KEYS.login)) || undefined,
    email: (await SecureStore.getItemAsync(KEYS.email)) || undefined,
    tgId: (await SecureStore.getItemAsync(KEYS.tgId)) || undefined,
    isFoxcloud: (await SecureStore.getItemAsync(KEYS.isFoxcloud)) === "1",
  };
}

export async function clearSession(): Promise<void> {
  for (const key of Object.keys(KEYS).filter((k) => k !== "hwid" && k !== "selectedNode")) {
    await SecureStore.deleteItemAsync(KEYS[key as keyof typeof KEYS]);
  }
}

export async function saveSelectedNodeId(id: string | null): Promise<void> {
  if (id) await SecureStore.setItemAsync(KEYS.selectedNode, id);
  else await SecureStore.deleteItemAsync(KEYS.selectedNode);
}

export async function loadSelectedNodeId(): Promise<string | null> {
  const v = (await SecureStore.getItemAsync(KEYS.selectedNode)) || null;
  return v;
}

/** ID уведомлений безопасности, которые пользователь закрыл («Это был я»).
 *  Хранятся локально, чтобы модалка не возвращалась, даже если сервер
 *  продолжает присылать их в ленте (например, несколько алертов за день). */
const DISMISSED_ALERTS_KEY = "gc_sec_alerts_dismissed_v1";
export async function loadDismissedAlerts(): Promise<number[]> {
  try {
    const raw = await SecureStore.getItemAsync(DISMISSED_ALERTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}
export async function addDismissedAlerts(ids: number[]): Promise<void> {
  try {
    const cur = await loadDismissedAlerts();
    const set = new Set(cur);
    for (const id of ids) set.add(id);
    // держим последние 200 id, чтобы список не рос вечно
    const arr = [...set].slice(-200);
    await SecureStore.setItemAsync(DISMISSED_ALERTS_KEY, JSON.stringify(arr));
  } catch {}
}
