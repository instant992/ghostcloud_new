import * as FileSystem from "expo-file-system/legacy";

export type DayStat = { rx: number; tx: number };
type StatsFile = Record<string, DayStat>;

const FILE = "gc_stats.json";

function filePath(): string {
  return `${FileSystem.documentDirectory}${FILE}`;
}

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function readAll(): Promise<StatsFile> {
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

async function writeAll(data: StatsFile): Promise<void> {
  // Храним максимум 35 дней
  const keys = Object.keys(data).sort().slice(-35);
  const pruned: StatsFile = {};
  for (const k of keys) pruned[k] = data[k];
  await FileSystem.writeAsStringAsync(filePath(), JSON.stringify(pruned));
}

export async function addDelta(rx: number, tx: number): Promise<void> {
  if (!Number.isFinite(rx) || !Number.isFinite(tx)) return;
  const all = await readAll();
  const key = todayKey();
  const cur = all[key] || { rx: 0, tx: 0 };
  all[key] = {
    rx: cur.rx + Math.max(0, rx),
    tx: cur.tx + Math.max(0, tx),
  };
  await writeAll(all);
}

/** Сумма за последние `days` дней включая сегодня */
export async function sumDays(days: number): Promise<DayStat> {
  const all = await readAll();
  const out: DayStat = { rx: 0, tx: 0 };
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const s = all[todayKey(d)];
    if (s) {
      out.rx += s.rx;
      out.tx += s.tx;
    }
  }
  return out;
}

/** Данные для графика за последние N дней (от старых к новым) */
export async function lastNDays(n: number): Promise<Array<{ date: string; stat: DayStat }>> {
  const all = await readAll();
  const out: Array<{ date: string; stat: DayStat }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    out.push({ date: key, stat: all[key] || { rx: 0, tx: 0 } });
  }
  return out;
}
