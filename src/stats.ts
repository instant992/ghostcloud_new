import * as FileSystem from "expo-file-system/legacy";

export type DayStat = { rx: number; tx: number };

type StatsFile = {
  daily: Record<string, DayStat>;
  nodes: Record<string, Record<string, DayStat>>;
};

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

function empty(): StatsFile {
  return { daily: {}, nodes: {} };
}

export async function readAll(): Promise<StatsFile> {
  try {
    const info = await FileSystem.getInfoAsync(filePath());
    if (!info.exists) return empty();
    const raw = await FileSystem.readAsStringAsync(filePath());
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.daily && typeof parsed.daily === "object") {
      return { daily: parsed.daily, nodes: parsed.nodes || {} };
    }
    // миграция старого формата {date: stat}
    const daily: Record<string, DayStat> = {};
    for (const k of Object.keys(parsed || {})) {
      const v = parsed[k];
      if (v && typeof v === "object" && typeof v.rx === "number") daily[k] = v;
    }
    return { daily, nodes: {} };
  } catch {
    return empty();
  }
}

async function writeAll(data: StatsFile): Promise<void> {
  // Храним максимум 35 дней
  const keys = Object.keys(data.daily).sort().slice(-35);
  const daily: Record<string, DayStat> = {};
  const nodes: StatsFile["nodes"] = {};
  for (const k of keys) {
    daily[k] = data.daily[k];
    if (data.nodes[k]) nodes[k] = data.nodes[k];
  }
  await FileSystem.writeAsStringAsync(filePath(), JSON.stringify({ daily, nodes }));
}

export async function addDelta(rx: number, tx: number, nodeId?: string | null): Promise<void> {
  if (!Number.isFinite(rx) || !Number.isFinite(tx)) return;
  const all = await readAll();
  const key = todayKey();

  const cur = all.daily[key] || { rx: 0, tx: 0 };
  all.daily[key] = { rx: cur.rx + Math.max(0, rx), tx: cur.tx + Math.max(0, tx) };

  if (nodeId) {
    const dayNodes = all.nodes[key] || {};
    const nCur = dayNodes[nodeId] || { rx: 0, tx: 0 };
    dayNodes[nodeId] = {
      rx: nCur.rx + Math.max(0, rx),
      tx: nCur.tx + Math.max(0, tx),
    };
    all.nodes[key] = dayNodes;
  }

  await writeAll(all);
}

function keyNDaysAgo(i: number): string {
  const d = new Date();
  d.setDate(d.getDate() - i);
  return todayKey(d);
}

/** Сумма за последние `days` дней включая сегодня */
export async function sumDays(days: number): Promise<DayStat> {
  const all = await readAll();
  const out: DayStat = { rx: 0, tx: 0 };
  for (let i = 0; i < days; i++) {
    const s = all.daily[keyNDaysAgo(i)];
    if (s) {
      out.rx += s.rx;
      out.tx += s.tx;
    }
  }
  return out;
}

/** Трафик по серверам за последние `days` дней, отсортирован по убыванию */
export async function nodeSums(days: number): Promise<Array<{ nodeId: string; rx: number; tx: number }>> {
  const all = await readAll();
  const acc: Record<string, DayStat> = {};
  for (let i = 0; i < days; i++) {
    const dayNodes = all.nodes[keyNDaysAgo(i)] || {};
    for (const [nodeId, s] of Object.entries(dayNodes)) {
      const cur = acc[nodeId] || { rx: 0, tx: 0 };
      acc[nodeId] = { rx: cur.rx + s.rx, tx: cur.tx + s.tx };
    }
  }
  return Object.entries(acc)
    .map(([nodeId, s]) => ({ nodeId, ...s }))
    .sort((a, b) => b.rx + b.tx - (a.rx + a.tx));
}

/** Данные для графика за последние N дней (от старых к новым) */
export async function lastNDays(n: number): Promise<Array<{ date: string; stat: DayStat }>> {
  const all = await readAll();
  const out: Array<{ date: string; stat: DayStat }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = keyNDaysAgo(i);
    out.push({ date: key, stat: all.daily[key] || { rx: 0, tx: 0 } });
  }
  return out;
}
