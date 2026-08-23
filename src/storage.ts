import * as SecureStore from "expo-secure-store";

const KEYS = {
  subUrl: "gc_sub_url",
  rwSubUrl: "gc_rw_sub_url",
  combinedSubUrl: "gc_combined_sub_url",
  hy2SubUrl: "gc_hy2_sub_url",
  hwid: "gc_hwid",
  login: "gc_login",
  email: "gc_email",
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
  return (await SecureStore.getItemAsync(KEYS.selectedNode)) || null;
}
