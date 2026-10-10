import { tcpPing, quicPing, pingNodesBatch, isVpnRunning } from "./native";
import { getPingMethod, getPingUrlCandidates } from "../settings";
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
/** Жёсткий потолок одной TCP-пробы: 1500 мс. Замер с реальных серверов (РФ-сеть,
 *  VPN выкл.): живые узлы отвечают на TCP-рукопожатие за 43–117 мс, т.е. 1500 мс —
 *  это ~12× запаса. Отсутствие ответа — не доказательство смерти сервера;
 *  прямую пробу незачем ждать дольше. Именно прежний потолок 5 с + ретраи на мёртвых узлах
 *  (6 из 20 сгорали по 5 с) растягивали волну; не «последовательный await». */
const TCP_HARD_TIMEOUT_MS = 1_500;

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
 *  это TCP-рукопожатие или URL-тест через прокси (настройка ping_method).
 *  hysteria2 исключён: его проверяем прямым QUIC-зондом (tcpPingOne), а не
 *  через pingBatch — путь не проверен для hysteria-outbound'ов. */
function canUrlTest(n: VpnNode): boolean {
  return n.supportedByXray && n.protocol !== "hysteria2";
}

/** URL-тест одного узла протоколом (True Ping; работает только при выключенном
 *  VPN — pingBatch не поднимается, пока в процессе живёт Xray-инстанс туннеля).
 *  При отказе перебирает пул резервных URL: падение probe-URL не должно
 *  выглядеть как мёртвый узел. */
async function urlPingOne(n: VpnNode): Promise<PingState> {
  const ob = buildOutbound(n);
  if (!ob) return { status: "done", delay: -1, error: "конфиг не собирается" };
  const payload = [{ xrayJson: JSON.stringify({ outbounds: [ob] }) }];
  const candidates = getPingUrlCandidates();
  let lastErr = "недоступен";
  for (let i = 0; i < candidates.length; i++) {
    const res = await withTimeout(pingNodesBatch(payload, candidates[i]), PING_BATCH_CHUNK_TIMEOUT_MS, []);
    const r = res[0];
    if (r?.success && r.delay >= 0) return { status: "done", delay: r.delay };
    lastErr = r?.error || lastErr;
    // полный таймаут пробы нет смысла повторять на другом URL
    if (/timeout|deadline exceeded/i.test(lastErr)) break;
  }
  return { status: "done", delay: -1, error: lastErr };
}

/** Быстрая TCP-проба одного узла: ОДИН выстрел, жёсткий потолок 1500 мс,
 *  без ретраев и БЕЗ reject. Живой узел отвечает на рукопожатие за 43–117 мс
 *  (замер с реальных серверов, РФ-сеть, VPN выкл.), так что 1500 мс — ~12× запаса;
 *  отсутствие ответа не доказывает смерть сервера (анти-блокировка, DNS, сеть).
 *  Результат относится только к прямой пробе, без скрытого URL-фолбэка. Нативный `tcpPing` (Kotlin `java.net.Socket().connect(addr, 1500)` на
 *  отдельном потоке `gc-tcp-ping`) — это и есть «fast TCP check»: реальный сокет,
 *  жёсткий таймаут, замер времени рукопожатия, не блокирует JS-поток.
 *
 *  Важно про «не использовать reject»: нативный примитив на ошибке.reject'ится,
 *  но здесь мы ловим это (`.catch(() => -1)`) и возвращаем СОСТОЯНИЕ ошибки, а не
 *  бросаем — иначе `Promise.all` всей волны оборвался бы на первом мёртвом узле и
 *  остальные серверы остались бы непроверенными (ровно то, чего задача требует
 *  избежать). Для hysteria2 — QUIC-зонд (Version Negotiation RTT), тот же потолок. */
async function tcpPingOne(n: VpnNode): Promise<PingState> {
  const probe = n.protocol === "hysteria2" ? quicPing : tcpPing;
  // +200 мс к потолку — страховка на доставку промиса поверх нативного таймаута
  // (потерянный нативный промис не должен вешать волну).
  const delay = await withTimeout(
    probe(n.address, n.port, TCP_HARD_TIMEOUT_MS).catch(() => -1),
    TCP_HARD_TIMEOUT_MS + 200,
    -1
  );
  if (delay >= 0) return { status: "done", delay };
  return { status: "done", delay: -1, error: "недоступен" };
}

/** Пинг одной ноды (кнопка «скорость» в списке серверов). Метод — из настроек.
 *  LTE OPEN: в TCP-режиме пробуем порт напрямую; в URL-режиме через прокси
 *  только при выключенном VPN. TCP-ошибка не означает, что прокси не работает. */
export async function pingOne(node: VpnNode): Promise<void> {
  const method = getPingMethod();
  if (!node.supportedByXray && node.protocol !== "hysteria2" && method === "url") {
    map[node.id] = { status: "done", delay: -1, error: "URL-тест только для Xray-узлов" };
    emit();
    return;
  }
  const vpnUp = method === "url" ? await isVpnRunning() : false;
  if (node.source === "lte" && node.protocol !== "hysteria2" && method === "url" && vpnUp) {
    map[node.id] = { status: "done", delay: -1, error: "не проверить при вкл. VPN" };
    emit();
    return;
  }
  map[node.id] = { status: "pending" };
  emit();
  // hysteria2: всегда QUIC-зонд напрямую (URL-тест через Xray невозможен)
  const useUrl = method === "url" && !vpnUp && canUrlTest(node);
  map[node.id] = useUrl ? await urlPingOne(node) : await tcpPingOne(node);
  emit();
}

/** URL-волна (True Ping): порции по 5, публикация результатов после каждой порции.
 *  waveToken — проверка вытеснения: если стартовала новая волна, эта
 *  прекращает работу между чанками. Возвращает id узлов с результатом.
 *  Пул резервных URL: если порция упала ЦЕЛИКОМ, вероятная причина —
 *  недоступность самого probe-URL (блокировка/сбой), а не смерть всех узлов;
 *  волна переключается на следующий URL пула (не более 2 переключений) и
 *  в конце добивает упавшие узлы уже рабочим URL. */
async function urlWave(targets: VpnNode[], waveToken = 0): Promise<Set<string>> {
  const doneIds = new Set<string>();
  const withOb = targets
    .map((n) => ({ n, ob: buildOutbound(n) }))
    .filter((x): x is { n: VpnNode; ob: Record<string, any> } => !!x.ob);
  if (withOb.length === 0) return doneIds;

  const candidates = getPingUrlCandidates();
  let urlIdx = 0;
  let switchesLeft = Math.min(2, candidates.length - 1);

  const runChunk = (chunk: typeof withOb, url: string) =>
    withTimeout(
      pingNodesBatch(
        chunk.map((x) => ({ xrayJson: JSON.stringify({ outbounds: [x.ob] }) })),
        url
      ),
      // нативный промис может не вернуться вовсе (потеря при гонке
      // stop/start сервиса) — жёсткий потолок на порцию, иначе волна
      // висит вечно и running=true блокирует все следующие пинги
      PING_BATCH_CHUNK_TIMEOUT_MS,
      []
    );

  for (let i = 0; i < withOb.length; i += 5) {
    if (waveSeq !== waveToken) return doneIds;
    const chunk = withOb.slice(i, i + 5);
    let results = await runChunk(chunk, candidates[urlIdx]);
    if (waveSeq !== waveToken) return doneIds;
    // Порция упала целиком — пробуем следующий URL пула (один раз на порцию,
    // всего ≤2 переключений на волну, чтобы не утроить длительность).
    const allFailed = !results || results.length === 0 || results.every((r) => !r?.success);
    if (allFailed && switchesLeft > 0) {
      urlIdx++;
      switchesLeft--;
      if (waveSeq !== waveToken) return doneIds;
      await new Promise((r) => setTimeout(r, 200));
      if (waveSeq !== waveToken) return doneIds;
      results = await runChunk(chunk, candidates[urlIdx]);
      if (waveSeq !== waveToken) return doneIds;
    }
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
  // Ретрай-проход: (а) транзиентные сбои ядра — временный инстанс Xray для
  // pingBatch дерётся за общую блокировку с предыдущим чанком, поэтому
  // «io: read/write on closed pipe» не означает, что узел мёртв;
  // (б) если URL переключался, узлы из ранних порций проверялись мёртвым URL
  // — добиваем их уже рабочим.
  const retry = withOb.filter((x) => {
    const s = map[x.n.id];
    return (
      s?.status === "done" &&
      !!s.error &&
      (urlIdx > 0 || /pipe|deadline|EOF|reset/i.test(s.error))
    );
  });
  if (retry.length > 0) {
    for (let i = 0; i < retry.length; i += 3) {
      if (waveSeq !== waveToken) return doneIds;
      await new Promise((r) => setTimeout(r, 400));
      if (waveSeq !== waveToken) return doneIds;
      const chunk = retry.slice(i, i + 3);
      const results = await runChunk(chunk, candidates[urlIdx]);
      if (waveSeq !== waveToken) return doneIds;
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
 *  Обычные узлы: параллельный TCP или URL-тест (настройка ping_method).
 *  LTE OPEN: в TCP-режиме пробуем порт напрямую с тем же таймаутом.
 *  Недоступность порта из текущей сети не доказывает отказ прокси.
 *  В URL-режиме проверяем через прокси. При включённом
 *  VPN pingBatch ядром запрещён (один инстанс Xray на процесс) — LTE помечается
 *  «не проверить при вкл. VPN» вместо бесполезного 5-секундного таймаута. */
export async function pingAll(nodes: VpnNode[]): Promise<void> {
  // hysteria2 поддерживается встроенным Xray v26.9.9 (протокол «hysteria»,
  // version 2), но прямая TCP-проба к QUIC-серверу бесполезна — для него
  // отдельный QUIC Version Negotiation RTT (см. tcpPingOne).
  const targets = nodes.filter((n) => n.supportedByXray || n.protocol === "hysteria2");
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
    const vpnUp = method === "url" ? await isVpnRunning() : false;
    if (cancelled()) return;
    const lteTargets = targets.filter((n) => n.source === "lte" && n.protocol !== "hysteria2");
    const normalTargets = targets.filter((n) => n.source !== "lte" || n.protocol === "hysteria2");

    if (method === "url" && !vpnUp) {
      // URL-тест: сам pingNodesBatch режет на порции по 5, но отдаёт всё в конце —
      // при 20 узлах это ~40 с сплошного спиннера («не работает»). Поэтому режем
      // на порции здесь и публикуем результаты после каждой.
      try {
        // hysteria2-узлы не в URL-волну (см. canUrlTest) — они добьются
        // TCP/QUIC-волной ниже через failedOb.
        const doneIds = await urlWave(
          targets.filter(canUrlTest),
          mySeq
        );
        if (cancelled()) return;
        // узлы, где outbound не собрался или URL-тест не вернул результат, — TCP-фолбэк
        const failedOb = normalTargets.filter((n) => !doneIds.has(n.id));
        await tcpWave(failedOb, mySeq);
      } catch (e: any) {
        // URL-тест не смог стартовать (изолированный процесс и т.п.) — TCP-фолбэк
        console.warn("[pingAll] url-test failed, fallback to TCP:", String(e?.message || e).slice(0, 100));
        await tcpWave(targets, mySeq);
      }
    } else {
      // Все обычные ноды стартуют одновременно (жёсткий потолок 1500 мс на пробу,
      // приложение исключено из собственного туннеля — пробы идут напрямую, поэтому
      // состояние VPN на путь TCP-пинга почти не влияет). waveToken — вытеснение.
      await tcpWave(method === "tcp" ? targets : normalTargets, mySeq);
      if (cancelled()) return;
      // URL mode cannot test LTE through the proxy while VPN is running.
      // Explicit TCP mode already probed every target, including LTE.
      if (method === "url") {
        for (const n of lteTargets) {
          map[n.id] = { status: "done", delay: -1, error: "не проверить при вкл. VPN" };
        }
        if (lteTargets.length > 0) emit();
      }
      // Explicit TCP mode never starts a proxy URL test, even on failed handshakes.
      // URL mode enters this branch only with VPN up, where pingBatch is forbidden.
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

/** TCP-волна: ВСЕ узлы стартуют ОДНОВРЕМЕННО — Promise.all по .map(), без
 *  for...of + await и без пула воркеров (прежняя версия тянула очередь по 8,
 *  поэтому при мёртвых узлах волна растягивалась). С жёстким потолком 1500 мс
 *  на пробу суммарное время ≈ 1.5 с независимо от числа серверов: живой отвечает
 *  за ~43–117 мс, мёртвый сгорает на таймауте, и всё это идёт параллельно.
 *  waveToken — проверка вытеснения: вытеснённая волна просто не пишет в map.
 *  Результаты публикуются по мере готовности каждого узла (emit внутри колбэка),
 *  а не одним скачком в конце. */
async function tcpWave(targets: VpnNode[], waveToken = 0): Promise<void> {
  if (targets.length === 0) return;
  await Promise.all(
    targets.map(async (node) => {
      const state = await tcpPingOne(node);
      if (waveSeq === waveToken) {
        map[node.id] = state;
        emit();
      }
    })
  );
}
