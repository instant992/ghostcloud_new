import { tcpPing, pingNodesBatch, isVpnRunning } from "./native";
import { getPingMethod } from "../settings";
import { buildOutbound } from "./xrayConfig";
import type { VpnNode } from "./parse";

export type PingState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; delay: number; error?: string };

let map: Record<string, PingState> = {}
const listeners = new Set<() => void>();
let running = false;

function emit() {
  map = { ...map };
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSnapshot(): Record<string, PingState> {
  return map;
}

export function isRunning(): boolean {
  return running;
}

/** Узлы, для которых возможен URL-тест (полный протокол через Xray pingBatch).
 *  UDP/ICMP-пинг на Android без root невозможен — «по чему проверять пинг»
 *  это TCP-рукопожатие или URL-тест через прокси (настройка ping_method). */
function canUrlTest(n: VpnNode): boolean {
  return n.supportedByXray;
}

/** URL-тест одного узла протоколом (работает только при выключенном VPN —
 *  pingBatch не поднимается, пока в процессе живёт Xray-инстанс туннеля). */
async function urlPingOne(n: VpnNode): Promise<PingState> {
  const ob = buildOutbound(n);
  if (!ob) return { status: "done", delay: -1, error: "конфиг не собирается" };
  const res = await pingNodesBatch([{ xrayJson: JSON.stringify({ outbounds: [ob] }) }]);
  const r = res[0];
  if (r?.success && r.delay >= 0) return { status: "done", delay: r.delay };
  return { status: "done", delay: -1, error: r?.error || "недоступен" };
}

async function tcpPingOne(n: VpnNode): Promise<PingState> {
  try {
    const delay = await tcpPing(n.address, n.port, 5000);
    return { status: "done", delay };
  } catch (e: any) {
    return { status: "done", delay: -1, error: e?.message || "недоступен" };
  }
}

/** Пинг одной ноды (кнопка «скорость» в списке серверов). Метод — из настроек. */
export async function pingOne(node: VpnNode): Promise<void> {
  if (!node.supportedByXray && getPingMethod() === "url") {
    map[node.id] = { status: "done", delay: -1, error: "URL-тест только для Xray-узлов" };
    emit();
    return;
  }
  map[node.id] = { status: "pending" };
  emit();
  const useUrl = getPingMethod() === "url" && canUrlTest(node) && !(await isVpnRunning());
  map[node.id] = useUrl ? await urlPingOne(node) : await tcpPingOne(node);
  emit();
}

/** Пинг всех нод, результаты появляются по мере готовности.
 *  Метод из настроек: TCP (4 одновременно) или URL-тест через pingBatch
 *  (порциями по 5, только при выключенном VPN; иначе фолбэк на TCP). */
export async function pingAll(nodes: VpnNode[]): Promise<void> {
  if (running) return;
  const targets = nodes.filter((n) => n.supportedByXray);
  if (targets.length === 0) return;

  running = true;
  const next: Record<string, PingState> = {};
  for (const n of targets) next[n.id] = { status: "pending" };
  map = { ...map, ...next };
  emit();

  const method = getPingMethod();
  const vpnUp = await isVpnRunning();
  if (method === "url" && !vpnUp) {
    // URL-тест: порции по 5 обрабатывает сам pingNodesBatch
    try {
      const withOb = targets
        .map((n) => ({ n, ob: buildOutbound(n) }))
        .filter((x): x is { n: VpnNode; ob: Record<string, any> } => !!x.ob);
      const results = await pingNodesBatch(
        withOb.map((x) => ({ xrayJson: JSON.stringify({ outbounds: [x.ob] }) }))
      );
      for (let i = 0; i < withOb.length; i++) {
        const r = results[i];
        map[withOb[i].n.id] =
          r?.success && r.delay >= 0
            ? { status: "done", delay: r.delay }
            : { status: "done", delay: -1, error: r?.error || "недоступен" };
        emit();
      }
      // узлы без outbound (не собрались) — TCP-фолбэк
      const failedOb = targets.filter((n) => !withOb.some((x) => x.n.id === n.id));
      await tcpWave(failedOb);
    } catch (e: any) {
      // URL-тест не смог стартовать (изолированный процесс и т.п.) — TCP-фолбэк
      await tcpWave(targets);
    }
  } else {
    await tcpWave(targets);
  }

  running = false;
  emit();
}

/** TCP-волна: 4 одновременных воркера, как было */
async function tcpWave(targets: VpnNode[]): Promise<void> {
  if (targets.length === 0) return;
  let index = 0;
  const worker = async () => {
    while (index < targets.length) {
      const node = targets[index++];
      map[node.id] = await tcpPingOne(node);
      emit();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}
