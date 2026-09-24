import { tcpPing, pingNodesBatch, isVpnRunning } from "./native";
import { getPingMethod } from "../settings";
import { buildOutbound } from "./xrayConfig";
import type { VpnNode } from "./parse";

export type PingState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; delay: number; error?: string };

let map: Record<string, PingState> = {};
const listeners = new Set<() => void>();
let running = false;
/** Токен текущей волны: новый pingAll инкрементит его, и старая волна
 *  прекращает работу при первой возможности (между узлами/чанками).
 *  Без вытеснения долгая стартовая волна (авто-пинг всех нод при запуске,
 *  включая URL-тест LTE — минуты) держала running=true, и ручной тап «Пинг»
 *  молча игнорировался: пользователь видел «пинг не работает». */
let waveSeq = 0;

/** Жёсткий потолок ожидания одной порции URL-теста (pingBatch).
 *  Нативный промис изредка не возвращается вовсе (гонка stop/start VPN-сервиса) —
 *  без потолка волна висит вечно и running=true блокирует все следующие пинги. */
const PING_BATCH_CHUNK_TIMEOUT_MS = 30_000;
/** Потолок на одну TCP-пробу: нативный таймаут 5 с + запас на доставку промиса. */
const TCP_PROBE_TIMEOUT_MS = 8_000;

/** Резолвит промис значением по таймеру — страховка от потерянных нативных промисов. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    p.then(
      (v) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(fallback);
        }
      }
    );
  });
}

function emit() {
  map = { ...map };
  // Изолируем исключения подписчиков: бросок одного listener'а раньше
  // обрывал tcpWave на середине — все следующие записи волны терялись,
  // а UI показывал «не проверен» при полностью рабочих серверах.
  for (const l of listeners) {
    try {
      l();
    } catch (e: any) {
      console.warn("[pingStore] listener threw:", String(e?.message || e).slice(0, 120));
    }
  }
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
  const res = await withTimeout(
    pingNodesBatch([{ xrayJson: JSON.stringify({ outbounds: [ob] }) }]),
    PING_BATCH_CHUNK_TIMEOUT_MS,
    []
  );
  const r = res[0];
  if (r?.success && r.delay >= 0) return { status: "done", delay: r.delay };
  return { status: "done", delay: -1, error: r?.error || "недоступен" };
}

async function tcpPingOne(n: VpnNode): Promise<PingState> {
  // Таймаут пробы 5 с — живые серверы отвечают за 10–400 мс, НО медленные
  // узлы (RF-хостинги) соединяются за 2–4 с; при 2.5 с они ложно
  // помечались «недоступен». Скорость волны дают 8 воркеров, а не короткий таймаут.
  // Повторы — только для БЫСТРЫХ ошибок (DNS/refused/unreachable): это «окна
  // сетевых переходов» (VPN только что включили/выключили, wifi→LTE), и вторая
  // попытка обычно проходит. Полный таймаут не повторяем: хост дропает
  // рукопожатия (SS-агрегатор «Лучший сервер» на :1234 не принимает прямой
  // TCP, LTE/анти-блок отвечают только своим клиентам) — повтор сгорит те же
  // 5 с и мёртвый узел стоит волне 16+ с вместо 5 (старое приложение
  // Clash.Meta делало одну пробу на узел — cap волны ~5 с).
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 1) await new Promise((r) => setTimeout(r, 300));
    if (attempt === 2) await new Promise((r) => setTimeout(r, 1000));
    const t0 = Date.now();
    let delay = -1;
    try {
      delay = await withTimeout(tcpPing(n.address, n.port, 5000), TCP_PROBE_TIMEOUT_MS, -1);
    } catch {
      // ошибка пробы — быстрый сбой, пробуем ещё раз
    }
    if (delay >= 0) return { status: "done", delay };
    // ≥4.5 с = сработал нативный таймаут (5 с) или watchdog (8 с): повтор
    // бессмыслен — выходим сразу, не блокируя воркер ещё на 10+ секунд.
    if (Date.now() - t0 >= 4500) break;
  }
  return { status: "done", delay: -1, error: "недоступен" };
}

/** Пинг одной ноды (кнопка «скорость» в списке серверов). Метод — из настроек.
 *  LTE OPEN: только URL-тест через прокси и только при выключенном VPN —
 *  прямой TCP к LTE-нодам физически невозможен (см. комментарий pingAll). */
export async function pingOne(node: VpnNode): Promise<void> {
  if (!node.supportedByXray && getPingMethod() === "url") {
    map[node.id] = { status: "done", delay: -1, error: "URL-тест только для Xray-узлов" };
    emit();
    return;
  }
  const vpnUp = await isVpnRunning();
  if (node.source === "lte" && vpnUp) {
    map[node.id] = { status: "done", delay: -1, error: "не проверить при вкл. VPN" };
    emit();
    return;
  }
  map[node.id] = { status: "pending" };
  emit();
  const useUrl = node.source === "lte" || (getPingMethod() === "url" && canUrlTest(node));
  map[node.id] = useUrl ? await urlPingOne(node) : await tcpPingOne(node);
  emit();
}

/** URL-волна: порции по 5, публикация результатов после каждой порции.
 *  waveToken — проверка вытеснения: если стартовала новая волна, эта
 *  прекращает работу между чанками. Возвращает id узлов с результатом. */
async function urlWave(targets: VpnNode[], waveToken = 0): Promise<Set<string>> {
  const doneIds = new Set<string>();
  const withOb = targets
    .map((n) => ({ n, ob: buildOutbound(n) }))
    .filter((x): x is { n: VpnNode; ob: Record<string, any> } => !!x.ob);
  for (let i = 0; i < withOb.length; i += 5) {
    if (waveSeq !== waveToken) return doneIds;
    const chunk = withOb.slice(i, i + 5);
    const results = await withTimeout(
      pingNodesBatch(
        chunk.map((x) => ({ xrayJson: JSON.stringify({ outbounds: [x.ob] }) }))
      ),
      // нативный промис может не вернуться вовсе (потеря при гонке
      // stop/start сервиса) — жёсткий потолок на порцию, иначе волна
      // висит вечно и running=true блокирует все следующие пинги
      PING_BATCH_CHUNK_TIMEOUT_MS,
      []
    );
    for (let j = 0; j < chunk.length; j++) {
      const r = results?.[j];
      const st: PingState =
        r?.success && r.delay >= 0
          ? { status: "done", delay: r.delay }
          : { status: "done", delay: -1, error: r?.error || "недоступен" };
      map[chunk[j].n.id] = st;
      doneIds.add(chunk[j].n.id);
    }
    emit(); // результаты этой порции — сразу в UI
  }
  // Один ретрай-проход по транзиентным сбоям ядра: временный инстанс Xray
  // для pingBatch дерётся за общую блокировку с предыдущим чанком —
  // «io: read/write on closed pipe» не означает, что узел мёртв.
  const retry = withOb.filter((x) => {
    const s = map[x.n.id];
    return s?.status === "done" && !!s.error && /pipe|deadline|EOF|reset/i.test(s.error);
  });
  if (retry.length > 0) {
    for (let i = 0; i < retry.length; i += 3) {
      if (waveSeq !== waveToken) return doneIds;
      await new Promise((r) => setTimeout(r, 400));
      const chunk = retry.slice(i, i + 3);
      const results = await withTimeout(
        pingNodesBatch(
          chunk.map((x) => ({ xrayJson: JSON.stringify({ outbounds: [x.ob] }) }))
        ),
        PING_BATCH_CHUNK_TIMEOUT_MS,
        []
      );
      for (let j = 0; j < chunk.length; j++) {
        const r = results?.[j];
        if (r?.success && r.delay >= 0) {
          map[chunk[j].n.id] = { status: "done", delay: r.delay };
        }
      }
      emit();
    }
  }
  return doneIds;
}

/** Пинг всех нод, результаты появляются по мере готовности.
 *  Обычные узлы: TCP (8 воркеров) или URL-тест (настройка ping_method).
 *  LTE OPEN: прямой TCP к ним физически невозможен — провайдер не принимает
 *  рукопожатия на свои порты из обычной сети (узел работает только как прокси),
 *  поэтому LTE всегда проверяется URL-тестом через сам прокси; при включённом
 *  VPN pingBatch ядром запрещён (один инстанс Xray на процесс) — LTE помечается
 *  «не проверить при вкл. VPN» вместо бесполезного 5-секундного таймаута. */
export async function pingAll(nodes: VpnNode[]): Promise<void> {
  const targets = nodes.filter((n) => n.supportedByXray);
  if (targets.length === 0) return;

  // Новая волна вытесняет старую: старая выйдет на ближайшей проверке токена.
  running = true;
  const mySeq = ++waveSeq;
  const cancelled = () => waveSeq !== mySeq;
  const next: Record<string, PingState> = {};
  for (const n of targets) next[n.id] = { status: "pending" };
  map = { ...map, ...next };
  emit();

  try {
    const method = getPingMethod();
    const vpnUp = await isVpnRunning();
    const lteTargets = targets.filter((n) => n.source === "lte");
    const normalTargets = targets.filter((n) => n.source !== "lte");

    if (method === "url" && !vpnUp) {
      // URL-тест: сам pingNodesBatch режет на порции по 5, но отдаёт всё в конце —
      // при 20 узлах это ~40 с сплошного спиннера («не работает»). Поэтому режем
      // на порции здесь и публикуем результаты после каждой.
      try {
        const doneIds = await urlWave(targets, mySeq);
        if (cancelled()) return;
        // узлы, где outbound не собрался или URL-тест не вернул результат, — TCP-фолбэк
        const failedOb = normalTargets.filter((n) => !doneIds.has(n.id));
        await tcpWave(failedOb, 8, mySeq);
      } catch (e: any) {
        // URL-тест не смог стартовать (изолированный процесс и т.п.) — TCP-фолбэк
        console.warn("[pingAll] url-test failed, fallback to TCP:", String(e?.message || e).slice(0, 100));
        await tcpWave(targets, 8, mySeq);
      }
    } else {
      // При включённом VPN пробы конкурируют с трафиком туннеля за CPU/радио —
      // на слабом устройстве 8 параллельных рукопожатий могут не уложиться
      // в таймаут и дать ложные «недоступен». Снижаем напор.
      await tcpWave(normalTargets, vpnUp ? 3 : 8, mySeq);
      if (cancelled()) return;
      // LTE-ноды: TCP бесполезен (см. комментарий к функции)
      for (const n of lteTargets) {
        map[n.id] = vpnUp
          ? { status: "done", delay: -1, error: "не проверить при вкл. VPN" }
          : { status: "pending" };
      }
      if (lteTargets.length > 0) emit();
      if (!vpnUp) {
        // Обычные ноды, упавшие по TCP: часть серверов не принимает прямые
        // рукопожатия (анти-блокировка отвечает только на REALITY/TLS с
        // корректного клиента) — при этом через прокси они рабочие. Добиваем
        // их URL-тестом, чтобы «работает, но прочерк» не вводило в заблуждение.
        const tcpFailed = normalTargets.filter((n) => {
          const s = map[n.id];
          return s && s.status === "done" && !!s.error;
        });
        try {
          await urlWave([...lteTargets, ...tcpFailed], mySeq);
        } catch {
          if (cancelled()) return;
          for (const n of [...lteTargets, ...tcpFailed]) {
            if (map[n.id]?.status === "pending") {
              map[n.id] = { status: "done", delay: -1, error: "недоступен" };
            }
          }
          emit();
        }
      }
    }
  } finally {
    // ОБЯЗАТЕЛЬНО в finally: любой бросок выше (потерянный нативный промис,
    // исключение подписчика в emit) раньше оставлял running=true навсегда —
    // все следующие pingAll молча выходили, пинг «ломался» до перезапуска.
    // Если волна вытеснена новой — running/pending не трогаем: ими владеет
    // новая волна, иначе спиннер погаснет посреди её работы.
    if (!cancelled()) {
      running = false;
      // Узлы, не получившие результат (оборванная волна), — из pending в ошибку,
      // чтобы UI не крутил спиннер вечно.
      for (const n of targets) {
        if (map[n.id]?.status === "pending") {
          map[n.id] = { status: "done", delay: -1, error: "не проверен" };
        }
      }
      emit();
    }
  }
}

/** TCP-волна: N одновременных воркеров (8 при выключенном VPN; меньше при
 *  включённом — пробы конкурируют с трафиком туннеля за CPU/радио).
 *  waveToken — проверка вытеснения между узлами. */
async function tcpWave(targets: VpnNode[], workers = 8, waveToken = 0): Promise<void> {
  if (targets.length === 0) return;
  let index = 0;
  const worker = async () => {
    while (index < targets.length) {
      if (waveSeq !== waveToken) return;
      const node = targets[index++];
      const res = await tcpPingOne(node);
      if (waveSeq !== waveToken) return;
      map[node.id] = res;
      emit();
    }
  };
  const n = Math.max(1, Math.min(workers, targets.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
}
