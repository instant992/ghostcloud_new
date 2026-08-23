import * as SecureStore from "expo-secure-store";

const ALLOWED_KEY = "gc_apps_allowed";
const BLOCKED_KEY = "gc_apps_blocked";

export type AppFilter = {
  allowed: string[];
  blocked: string[];
};

async function readList(key: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, list: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(list));
  } catch {}
}

export async function loadFilter(): Promise<AppFilter> {
  const [allowed, blocked] = await Promise.all([
    readList(ALLOWED_KEY),
    readList(BLOCKED_KEY),
  ]);
  return { allowed, blocked };
}

export async function saveAllowed(list: string[]): Promise<void> {
  await writeList(ALLOWED_KEY, list);
}

export async function saveBlocked(list: string[]): Promise<void> {
  await writeList(BLOCKED_KEY, list);
}
