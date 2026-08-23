import * as FileSystem from "expo-file-system/legacy";

const FILE = "gc_device_names.json";

function filePath(): string {
  return `${FileSystem.documentDirectory}${FILE}`;
}

export async function readAll(): Promise<Record<string, string>> {
  try {
    const info = await FileSystem.getInfoAsync(filePath());
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(filePath());
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function setName(hwidFull: string, name: string): Promise<void> {
  const all = await readAll();
  const clean = name.trim();
  if (clean) all[hwidFull] = clean;
  else delete all[hwidFull];
  await FileSystem.writeAsStringAsync(filePath(), JSON.stringify(all));
}
