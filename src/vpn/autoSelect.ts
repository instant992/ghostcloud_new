import { getSnapshot, isRunning, pingAll } from "./pingStore";
import type { VpnNode } from "./parse";

/** Виртуальный ID режима «Автовыбор» — сохраняется как выбранный сервер.
 *  При подключении резолвится в лучший обычный сервер по пингу. */
export const AUTO_SERVER_ID = "__auto__";

/** LTE-узлы в автовыбор не участвуют */
const isLte = (n: VpnNode) => n.source === "lte" || n.id.startsWith("lte-");
export const isLteNode = isLte;

/** Проверка, что узел вообще способен собрать рабочий конфиг:
 *  у REALITY обязан быть publicKey (иначе ядро падает с «empty "password"»),
 *  у vless/vmess — uuid, у trojan/ss/hysteria2 — пароль.
 *  Битые записи подписки (без pbk и т.п.) в автовыбор/файловер не попадают. */
export function isNodeUsable(n: VpnNode): boolean {
  if (!n.address || !n.port) return false;
  if (n.security === "reality" && !n.publicKey) return false;
  switch (n.protocol) {
    case "vless":
    case "vmess":
      return !!n.uuid;
    case "trojan":
    case "ss":
    case "hysteria2":
      return !!(n.password || n.uuid);
    default:
      return false;
  }
}

/** Обычные серверы, отсортированные по пингу (лучшие сначала).
 *  Узлы без успешного замера не попадают в результат. */
export function rankByPing(nodes: VpnNode[]): VpnNode[] {
  const snap = getSnapshot();
  return nodes
    .filter((n) => !isLte(n) && isNodeUsable(n))
    .map((n) => ({ n, p: snap[n.id] }))
    .filter(
      (x): x is { n: VpnNode; p: { status: "done"; delay: number } } =>
        x.p?.status === "done" && !x.p.error && x.p.delay > 0
    )
    .sort((a, b) => a.p.delay - b.p.delay)
    .map((x) => x.n);
}

/** Узел для подключения: в режиме авто — лучший обычный сервер по пингу
 *  (фолбэк — первый работоспособный), иначе — выбранный вручную. */
export function resolveConnectNode(
  nodes: VpnNode[],
  selectedId: string | null
): VpnNode | null {
  if (selectedId === AUTO_SERVER_ID) {
    // Только обычные И способные собрать рабочий конфиг (битые REALITY без pbk — мимо)
    const regular = nodes.filter((n) => !isLte(n) && isNodeUsable(n));
    if (regular.length === 0) return null;
    const ranked = rankByPing(regular);
    if (ranked.length > 0) return ranked[0];
    return regular.find((n) => n.supportedByXray) || regular[0];
  }
  return nodes.find((n) => n.id === selectedId) || null;
}

/** Гарантирует свежие замеры пинга для обычных серверов перед автовыбором:
 *  если замеров нет — запускает пинг и ждёт завершения (с таймаутом). */
export async function ensureFreshPings(
  nodes: VpnNode[],
  timeoutMs = 15000
): Promise<void> {
  const regular = nodes.filter((n) => !isLte(n) && n.supportedByXray && isNodeUsable(n));
  if (regular.length === 0) return;
  const snap = getSnapshot();
  const hasAll = regular.every((n) => snap[n.id]?.status === "done");
  if (hasAll) return;
  if (!isRunning()) void pingAll(regular);
  await new Promise<void>((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (!isRunning() || Date.now() >= deadline) {
        clearInterval(timer);
        resolve();
      }
    }, 250);
  });
}
