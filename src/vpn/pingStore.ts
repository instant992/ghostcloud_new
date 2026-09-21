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
    // 2.5 с достаточно: живые серверы отвечают за 10–300 мс, а мёртвый узел
    // не должен блокировать воркера на 5 с (проверка всего списка тянулась).
    const delay = await tcpPing(n.address, n.port, 2500);
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
    // URL-тест: сам pingNodesBatch режет на порции по 5, но отдаёт всё в конце —
    // при 20 узлах это ~40 с сплошного спиннера («не работает»). Поэтому режем
    // на порции здесь и публикуем результаты после каждой.
    try {
      const withOb = targets
        .map((n) => ({ n, ob: buildOutbound(n) }))
        .filter((x): x is { n: VpnNode; ob: Record<string, any> } => !!x.ob);
      const doneIds = new Set<string>();
      for (let i = 0; i < withOb.length; i += 5) {
        const chunk = withOb.slice(i, i + 5);
        const results = await pingNodesBatch(
          chunk.map((x) => ({ xrayJson: JSON.stringify({ outbounds: [x.ob] }) }))
        );
        for (let j = 0; j < chunk.length; j++) {
          const r = results[j];
          map[chunk[j].n.id] =
            r?.success && r.delay >= 0
              ? { status: "done", delay: r.delay }
              : { status: "done", delay: -1, error: r?.error || "недоступен" };
          doneIds.add(chunk[j].n.id);
        }
        emit(); // результаты этой порции — сразу в UI
      }
      // узлы, где outbound не собрался или URL-тест не вернул результат, — TCP-фолбэк
      const failedOb = targets.filter((n) => !doneIds.has(n.id));
      await tcpWave(failedOb);
    } catch (e: any) {
      // URL-тест не смог стартовать (изолированный процесс и т.п.) — TCP-фолбэк
      console.warn("[pingAll] url-test failed, fallback to TCP:", String(e?.message || e).slice(0, 100));
      await tcpWave(targets);
    }
  } else {
    await tcpWave(targets);
  }

  running = false;
  emit();
}

/** TCP-волна: 8 одновременных воркеров (было 4 — список из 20 узлов
 *  с мёртвыми серверами проверялся слишком долго) */
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
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
}
