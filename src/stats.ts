import * as FileSystem from "expo-file-system/legacy";

export type DayStat = { rx: number; tx: number };

export type AppDayStat = { rx: number; tx: number; name: string };

type StatsFile = {
  daily: Record<string, DayStat>;
  nodes: Record<string, Record<string, DayStat>>;
  apps: Record<string, Record<string, AppDayStat>>;
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
  return { daily: {}, nodes: {}, apps: {} };
}

export async function readAll(): Promise<StatsFile> {
  try {
    const info = await FileSystem.getInfoAsync(filePath());
    if (!info.exists) return empty();
    const raw = await FileSystem.readAsStringAsync(filePath());
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.daily && typeof parsed.daily === "object") {
      return { daily: parsed.daily, nodes: parsed.nodes || {}, apps: parsed.apps || {} };
    }
    // миграция старого формата {date: stat}
    const daily: Record<string, DayStat> = {};
    for (const k of Object.keys(parsed || {})) {
      const v = parsed[k];
      if (v && typeof v === "object" && typeof v.rx === "number") daily[k] = v;
    }
    return { daily, nodes: {}, apps: {} };
  } catch {
    return empty();
  }
}

async function writeAll(data: StatsFile): Promise<void> {
  // Храним максимум 35 дней
  const keys = Object.keys(data.daily).sort().slice(-35);
  const daily: Record<string, DayStat> = {};
  const nodes: StatsFile["nodes"] = {};
  const apps: StatsFile["apps"] = {};
  for (const k of keys) {
    daily[k] = data.daily[k];
    if (data.nodes[k]) nodes[k] = data.nodes[k];
    if (data.apps[k]) apps[k] = data.apps[k];
  }
  await FileSystem.writeAsStringAsync(filePath(), JSON.stringify({ daily, nodes, apps }));
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

/** Дельты трафика по приложениям за один цикл опроса (пишутся одним проходом) */
export async function addAppDeltas(
  entries: Array<{ pkg: string; name: string; rx: number; tx: number }>
): Promise<void> {
  if (!entries.length) return;
  const all = await readAll();
  const key = todayKey();
  const dayApps = all.apps[key] || {};
  for (const e of entries) {
    if (!e.pkg || (!Number.isFinite(e.rx) && !Number.isFinite(e.tx))) continue;
    const cur = dayApps[e.pkg] || { rx: 0, tx: 0, name: e.name };
    dayApps[e.pkg] = {
      rx: cur.rx + Math.max(0, e.rx || 0),
      tx: cur.tx + Math.max(0, e.tx || 0),
      name: e.name || cur.name,
    };
  }
  all.apps[key] = dayApps;
  await writeAll(all);
}

/** Трафик по приложениям за последние `days` дней, отсортирован по убыванию */
export async function appSums(
  days: number
): Promise<Array<{ pkg: string; name: string; rx: number; tx: number }>> {
  const all = await readAll();
  const acc: Record<string, { name: string; rx: number; tx: number }> = {};
  for (let i = 0; i < days; i++) {
    const dayApps = all.apps[keyNDaysAgo(i)] || {};
    for (const [pkg, s] of Object.entries(dayApps)) {
      const cur = acc[pkg] || { name: s.name, rx: 0, tx: 0 };
      acc[pkg] = { name: s.name || cur.name, rx: cur.rx + s.rx, tx: cur.tx + s.tx };
    }
  }
  return Object.entries(acc)
    .map(([pkg, s]) => ({ pkg, ...s }))
    .sort((a, b) => b.rx + b.tx - (a.rx + a.tx));
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
