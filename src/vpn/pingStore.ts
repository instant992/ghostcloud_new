import { tcpPing } from "./native";

export type PingState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; delay: number; error?: string };

let map: Record<string, PingState> = {};
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

/** TCP-пинг одной ноды (кнопка «скорость» в списке серверов) */
export async function pingOne(node: { id: string; address: string; port: number; supportedByXray: boolean }): Promise<void> {
  if (!node.supportedByXray) {
    map[node.id] = { status: "done", delay: -1, error: "не поддерживается" };
    emit();
    return;
  }
  map[node.id] = { status: "pending" };
  emit();
  try {
    const delay = await tcpPing(node.address, node.port, 5000);
    map[node.id] = { status: "done", delay };
  } catch (e: any) {
    map[node.id] = { status: "done", delay: -1, error: e?.message || "недоступен" };
  }
  emit();
}

/** TCP-пинг всех нод (по 4 одновременно), результаты появляются по мере готовности */
export async function pingAll(nodes: Array<{ id: string; address: string; port: number; supportedByXray: boolean }>): Promise<void> {
  if (running) return;
  const targets = nodes.filter((n) => n.supportedByXray);
  if (targets.length === 0) return;

  running = true;
  const next: Record<string, PingState> = {};
  for (const n of targets) next[n.id] = { status: "pending" };
  map = { ...map, ...next };
  emit();

  let index = 0;
  const worker = async () => {
    while (index < targets.length) {
      const node = targets[index++];
      try {
        const delay = await tcpPing(node.address, node.port, 5000);
        map[node.id] = { status: "done", delay };
      } catch (e: any) {
        map[node.id] = {
          status: "done",
          delay: -1,
          error: e?.message || "недоступен",
        };
      }
      emit();
    }
  };

  await Promise.all([worker(), worker(), worker(), worker()]);
  running = false;
  emit();
}
