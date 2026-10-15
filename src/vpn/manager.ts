import { ensureSelectedCoreUpdated } from "./coreAutoUpdater";
import { deviceHeaders, loadSession } from "../storage";
import { getSelectedCore, getSetting, setSetting, getPingMethod } from "../settings";
import { markVpnConnected, clearVpnConnected } from "./timer";
import { parseSubscriptionText, parseClashYamlProxies, clashProxyToNode } from "./parse";
import type { VpnNode } from "./parse";
import { buildXrayConfig, buildOutbound as buildXrayOutbound } from "./xrayConfig";
import { buildSingBoxConfig } from "./singboxConfig";
import { splitNameFlag } from "../theme";
import { loadFilter } from "./appFilter";
import { getDnsProvider } from "./dns";
import { computeBypassForNetwork, loadFilterSettings, roscomRoutingForNetwork } from "./connectionFilter";
import type { RoscomMode } from "./roscomRouting";
import {
  rankByPing,
  isNodeUsable,
  ensureFreshPings,
  isLteNode,
} from "./autoSelect";
import { getSnapshot as getPingSnapshot } from "./pingStore";
import { pingNodesBatch, loadLibCore, getCoreStatus, truncateTextFile, accessLogPath, errorLogPath } from "./native";
import {
  getInstalledPackageNames,
  getNetworkType,
  isVpnRunning,
  onVpnStateChanged,
  requestVpnPermission,
  isPrepared,
  startVpn,
  startLibCoreVpn,
  stopVpn,
} from "./native";
import type { FailoverInfo } from "./native";

const V2RAY_UA = "v2rayNG/1.10.24";
/** Максимум запасных серверов для авто-файловера */
const FAILOVER_MAX = 5;

let failoverPool: VpnNode[] = [];
/** Узел, на котором реально поднят туннель (для статистики «по серверам»).
 *  Выбранный узел может быть null (подключение на первый доступный),
 *  поэтому учитываем фактический. */
let lastConnectedNodeId: string | null = null;

export function getLastConnectedNodeId(): string | null {
  return lastConnectedNodeId;
}

/** Задаёт пул серверов-кандидатов для авто-файловера (вызывается из контекста при загрузке узлов). */
export function setFailoverPool(nodes: VpnNode[]): void {
  failoverPool = nodes;
}

/** Выбранный DNS-провайдер (преимущество спонсоров; для остальных — «Автоматически») */
function selectedDnsProvider(isSponsor: boolean) {
  const id = isSponsor ? getSetting("dns_provider", "auto") : "auto";
  return getDnsProvider(id);
}

function buildConfigFor(
  core: string,
  node: VpnNode,
  bypassDomains: string[],
  isSponsor: boolean,
  roscomMode?: RoscomMode | null
): string | null {
  try {
    const dns = selectedDnsProvider(isSponsor);
    if (core === "sing-box") return buildSingBoxConfig(node, dns, bypassDomains, roscomMode);
      if (!node.supportedByXray) return null;
    return buildXrayConfig(node, null, dns, bypassDomains, roscomMode);
  } catch {
    return null;
  }
}

/** Собирает инфо для авто-файловера: текущий сервер + запасные (не-LTE, поддерживаемые ядром).
 *  Запасные упорядочены по пингу (лучшие первыми), чтобы при обрыве
 *  переключалось на самый быстрый из рабочих. */
function buildFailoverInfo(
  core: string,
  current: VpnNode,
  bypassDomains: string[],
  isSponsor: boolean,
  roscomMode?: RoscomMode | null
): FailoverInfo | undefined {
  // Файловер НЕ должен менять класс сервера: у LTE OPEN-ноды запасные — только
  // другие LTE-ноды, у обычной — только обычные. Иначе при обрыве LTE-сервера
  // монитор молча переключал пользователя на обычный сервер (другой роутинг,
  // белый-списочный режим теряется) — жалоба «сидел на LTE, само переключило».
  const currentIsLte = isLteNode(current);
  const rest = failoverPool
    .filter((n) => n.id !== current.id)
    .filter((n) => (currentIsLte ? isLteNode(n) : n.source !== "lte"))
    .filter((n) => isNodeUsable(n))
    .filter((n) => (core === "xray" || core === "uwuray" || core === "xray-last" || core === "xray-joly" ? n.supportedByXray : true));
  // Сортировка по пингу — локальная (rankByPing отфильтровал бы LTE-ноды).
  const snap = getPingSnapshot();
  const ranked = rest
    .map((n) => ({ n, p: snap[n.id] }))
    .filter(
      (x): x is { n: VpnNode; p: { status: "done"; delay: number } } =>
        x.p?.status === "done" && !x.p.error && x.p.delay > 0
    )
    .sort((a, b) => a.p.delay - b.p.delay)
    .map((x) => x.n);
  // без пинга — исходный порядок, после пропингованных
  const rankedIds = new Set(ranked.map((n) => n.id));
  const unranked = rest.filter((n) => !rankedIds.has(n.id));
  const mk = (n: VpnNode) => {
    const config = buildConfigFor(core, n, bypassDomains, isSponsor, roscomMode);
    if (!config) return null;
    return { config, host: n.address, port: n.port };
  };
  // Текущий (выбранный) сервер — ПЕРВЫЙ кандидат. При обрыве связи пинг не
  // проходит ни к одному серверу, и монитор переключал ядро на «лучший по
  // пингу» — пользователь терял выбранный сервер. Теперь монитор сначала
  // пробует перезапустить свой же сервер (заодно перепривязывает сокеты ядра
  // к новой сети после Wi-Fi↔LTE), а на запасные уходит только если текущий
  // действительно недоступен (в Kotlin-мониторе кандидат перед переключением
  // сам проверяется TCP-пингом).
  const candidates = [
    mk(current),
    ...[...ranked, ...unranked].slice(0, FAILOVER_MAX).map(mk),
  ].filter((c): c is { config: string; host: string; port: number } => c !== null);
  if (!candidates.length) return undefined;
  return { host: current.address, port: current.port, candidates };
}

/** Настоящий тест узлов через ядро: строит xray-конфиг для каждого и
 *  запрашивает generate_204 ЧЕРЕЗ прокси (measureOutboundDelay в libXray).
 *  В отличие от TCP-пинга (порт REALITY открыт для всех — маскировка,
 *  поэтому пинг проходит даже у мёртвого прокси) — проверяет, что узел
 *  реально несёт трафик.
 *  ВАЖНО: требует выключенного VPN (pingBatch не работает при запущенном
 *  в процессе Xray-инстансе).
 *
 *  Возвращает узлы, прошедшие тест, по возрастанию задержки.
 *  Если ни один узел не прошёл — бросает ошибку (подключаться не к чему).
 *  Для ядер не-xray — фолбэк на TCP-пинг. */
export async function pickBestNode(
  nodes: VpnNode[],
  opts: { max?: number; excludeIds?: string[] } = {}
): Promise<VpnNode[]> {
  const max = opts.max ?? 4;
  const exclude = new Set(opts.excludeIds || []);
  const core = getSelectedCore();
  // Кандидаты: обычные (не LTE), способные собрать рабочий конфиг
  const candidates = nodes.filter(
    (n) =>
      !isLteNode(n) &&
      !exclude.has(n.id) &&
      isNodeUsable(n) &&
      (core === "xray" || core === "uwuray" || core === "xray-last" || core === "xray-joly" ? n.supportedByXray : true)
  );
  if (candidates.length === 0) return [];

  // Метод проверки — из настроек: "url" (по умолчанию для выбора лучшего —
  // полный тест протоколом) или "tcp" (быстрое рукопожатие)
  const method = getPingMethod();

  // Для ядра xray и метода url — настоящий URL-тест через прокси
  if (core === "xray" && method === "url") {
    // pingBatch не работает, пока в процессе поднят Xray-инстанс (VPN-сервис
    // останавливается асинхронно через intent) — ждём остановки
    for (let waited = 0; waited < 3000 && (await isVpnRunning()); waited += 200) {
      await new Promise((r) => setTimeout(r, 200));
    }
    const outbounds: string[] = [];
    const tested: VpnNode[] = [];
    for (const n of candidates) {
      const ob = buildXrayOutbound(n);
      if (!ob) continue;
      // минимальный конфиг только с outbound'ом — pingBatch парсит поле outbounds
      outbounds.push(JSON.stringify({ outbounds: [ob] }));
      tested.push(n);
    }
    if (outbounds.length) {
      const results = await pingNodesBatch(outbounds.map((xrayJson) => ({ xrayJson })));
      // Диагностика: почему узлы не прошли тест (видно в logcat ReactNativeJS)
      try {
        console.log(
          "[autoselect] pingBatch:",
          results.map((r, i) => `${tested[i]?.name}: ${r?.success ? "OK " + r.delay + "ms" : "FAIL " + (r?.error || "?")}`).join(" | ")
        );
      } catch {}
      const scored = tested
        .map((n, i) => ({ n, r: results[i] }))
        .filter((x) => x.r?.success && x.r.delay >= 0)
        .sort((a, b) => a.r.delay - b.r.delay)
        .map((x) => x.n);
      if (scored.length) return scored.slice(0, max);
      // Сам тест не смог запуститься (VPN ещё поднят в процессе и т.п.) —
      // это не значит, что серверы мёртвы: фолбэк на TCP-пинг ниже
      const testItselfFailed =
        results.length > 0 &&
        results.every(
          (r) => !r?.success && /isolated process|unknown method|недоступен|ping failed/i.test(r?.error || "")
        );
      // Тест отработал, но ни один узел не несёт трафик — не молча
      // подключаемся к мёртвому, а сообщаем
      if (!testItselfFailed && results.some((r) => r && typeof r.success === "boolean")) {
        throw new Error("Серверы недоступны — ни один не прошёл проверку. Попробуйте позже или выберите сервер вручную");
      }
      // результаты пустые (модуль недоступен и т.п.) — фолбэк на TCP-пинг
    }
  }

  // Фолбэк (другое ядро / модуль недоступен) — TCP-пинг через pingStore
  await ensureFreshPings(candidates);
  const ranked = rankByPing(candidates);
  if (ranked.length) return ranked.slice(0, max);
  return candidates.slice(0, max);
}

async function fetchText(url: string, userAgent: string): Promise<string | null> {
  try {
    const headers = await deviceHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "*/*", ...headers },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return null;
    const text = await res.text();
    if (/not supported|unsupported app/i.test(text.slice(0, 500)) && !text.includes("://")) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

/** Скачать текст подписки по URL (с HWID-заголовками) */
export async function fetchSubscriptionText(url: string): Promise<string> {
  const text = await fetchText(url, V2RAY_UA);
  if (!text) throw new Error("Подписка недоступна");
  return text;
}

function mergeNodes(a: VpnNode[], b: VpnNode[]): VpnNode[] {
  // Канонический ключ узла: один и тот же сервер может прийти из raw-подписки
  // (share-link, id = `proto-host-port-uuid8`) и из комбинированного Clash YAML
  // (id = `proto-host-port`) — старые id совпадали не всегда и список двоился.
  const keyOf = (n: VpnNode) =>
    `${n.protocol}|${n.address}|${n.port}|${(n.uuid || n.password || n.method || "").slice(0, 8)}`;
  const seen = new Set(a.map(keyOf));
  const merged = [...a, ...b.filter((n) => !seen.has(keyOf(n)))];
  return ensureUniqueIds(merged);
}

/** Канонический «отпечаток» узла: не зависит от формата подписки.
 *  Один и тот же сервер приходит то share-ссылками (id `proto-host-port-cred8`),
 *  то Clash YAML / sing-box JSON (id `proto-host-port`) — какой формат победит
 *  в mergeNodes, зависит от того, какая подписка ответила первой. Поэтому id
 *  НЕЛЬЗЯ использовать как единственный ключ сохранённого выбора. */
export function nodeFingerprint(n: VpnNode): string {
  return `${n.protocol}|${n.address}|${n.port}|${(n.uuid || n.password || n.method || "").slice(0, 8)}`;
}

/** Разрешает сохранённый выбор в узел из свежего списка.
 *  Три уровня: точный id → «отпечаток» (если при выборе сохранили его) →
 *  совместимость со старыми сохранёнными id обоих форматов. */
export function resolveSavedNode(savedId: string | null, nodes: VpnNode[]): VpnNode | null {
  if (!savedId || nodes.length === 0) return null;
  const exact = nodes.find((n) => n.id === savedId);
  if (exact) return exact;
  if (savedId.includes("|")) {
    return nodes.find((n) => nodeFingerprint(n) === savedId) || null;
  }
  // Старый формат с креденшелом: `trojan-host-443-abcd1234` → короткий `trojan-host-443`
  const lastDash = savedId.lastIndexOf("-");
  if (lastDash > 0) {
    const shortId = savedId.slice(0, lastDash);
    const m = nodes.find((n) => n.id === shortId || n.id.startsWith(`${savedId}-`));
    if (m) return m;
  }
  // Короткий формат → полный с креденшелом (`trojan-host-443` → `…-abcd1234`)
  return nodes.find((n) => n.id.startsWith(`${savedId}-`)) || null;
}

/** Гарантирует уникальность id. Подписка отдаёт один сервер под двумя именами
 *  («🚀 Лучший сервер» и «🇪🇪 Эстония» — одинаковые address/port/uuid):
 *  одинаковый id ломает React-ключи FlatList (строки рендерятся неверно) и
 *  слот карты пингов (две строки показывают одно значение). Первый узел пары
 *  сохраняет исходный id (сохранённый выбор пользователя остаётся валиден),
 *  дублям добавляется стабильный хэш имени — он не меняется между запусками. */
function ensureUniqueIds(nodes: VpnNode[]): VpnNode[] {
  const used = new Set<string>();
  const hashName = (s: string): string => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  };
  return nodes.map((n) => {
    if (!used.has(n.id)) {
      used.add(n.id);
      return n;
    }
    let id = `${n.id}-${hashName(n.name)}`;
    let k = 2;
    while (used.has(id)) id = `${n.id}-${hashName(n.name)}-${k++}`;
    used.add(id);
    return { ...n, id };
  });
}

/** Тянет узлы из raw Remnawave (vless/vmess/trojan/ss ссылки)
 *  и из комбинированной подписки (Clash YAML с HY2). */
export async function fetchNodes(): Promise<{ nodes: VpnNode[]; unsupportedCount: number }> {
  const session = await loadSession();
  if (!session?.subUrl && !session?.rwSubUrl) return { nodes: [], unsupportedCount: 0 };

  let rwNodes: VpnNode[] = [];
  let combinedNodes: VpnNode[] = [];

  // 1. Прямая подписка Remnawave — формат ссылок
  if (session.rwSubUrl) {
    const text = await fetchText(session.rwSubUrl, V2RAY_UA);
    if (text) {
      const { nodes, unsupported } = parseSubscriptionText(text);
      rwNodes = nodes;
      if (nodes.length === 0) {
        // возможно отдали YAML — пробуем как Clash
        for (const px of parseClashYamlProxies(text)) {
          const node = clashProxyToNode(px);
          if (node) rwNodes.push(node);
        }
      }
      void unsupported;
    }
  }

  // 2. Комбинированная подписка (VLESS + Hysteria2 в Clash YAML)
  if (session.subUrl && session.subUrl !== session.rwSubUrl) {
    const text = await fetchText(session.subUrl, "clash-verge/v2.0.0 clash");
    if (text) {
      for (const px of parseClashYamlProxies(text)) {
        const node = clashProxyToNode(px);
        if (node) combinedNodes.push(node);
      }
      if (combinedNodes.length === 0) {
        const { nodes } = parseSubscriptionText(text);
        combinedNodes = nodes;
      }
    }
  }

  const merged = mergeNodes(rwNodes, combinedNodes);
  const unsupportedCount = merged.filter((n) => !n.supportedByXray).length;
  return { nodes: merged, unsupportedCount };
}

export async function ensurePermission(): Promise<boolean> {
  // Разрешение на уведомления (Android 13+) — чтобы VPN-уведомление было видно в шторке
  try {
    const { PermissionsAndroid, Platform } = require("react-native");
    if (Platform.OS === "android" && Platform.Version >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    }
  } catch {}

  if (await isPrepared()) return true;
  return requestVpnPermission();
}

/** Итоговый набор «мимо VPN» из активных профилей фильтра соединения
 *  (пакеты — системный список, домены — правила ядра), под текущую сеть.
 *  Пакеты проверяются по списку реально установленных приложений — как в эталоне. */
function currentBypass(): { packages: string[]; domains: string[] } {
  try {
    const s = loadFilterSettings();
    const net = getNetworkType();
    const bypass = computeBypassForNetwork(s, net);
    // Android не может исключить из туннеля неустановленный пакет — такие
    // пакеты в список не попадают (иначе VPN-сервис бросал бы их молча)
    const installed = getInstalledPackageNames();
    const packages = installed.size
      ? bypass.packages.filter((p) => installed.has(p))
      : bypass.packages;
    return { packages, domains: bypass.domains };
  } catch {
    return { packages: [], domains: [] };
  }
}

export type ConnectOptions = {
  isSponsor?: boolean;
  /** Background restore/reconnect must not initiate downloads. */
  autoUpdateCore?: boolean;
};

/** UwuRay — скачиваемое ядро: после рестарта процесса библиотека не загружена.
 *  Грузим её лениво перед подключением (идемпотентно: GcUwuCore.load кэширует). */
let uwuRayLoadPromise: Promise<void> | null = null;
async function ensureUwuRayLoaded(): Promise<void> {
  if (uwuRayLoadPromise) return uwuRayLoadPromise;
  uwuRayLoadPromise = (async () => {
    const st = getCoreStatus("libuwuray.so");
    if (!st?.downloaded) {
      throw new Error("Ядро UwuRay не скачано — загрузите его в настройках");
    }
    try {
      await loadLibCore("uwuray");
    } catch (e: any) {
      // ERR_CORE_CONFLICT: в этом процессе уже загружено другое скачиваемое ядро
      // (Go-рантайм один на процесс) — нужен перезапуск приложения.
      const msg = String(e?.message || e || "");
      if (msg.includes("ERR_CORE_CONFLICT") || msg.includes("перезапустите")) {
        throw new Error("Переключено ядро — перезапустите приложение, чтобы применить UwuRay");
      }
      throw new Error(msg || "Не удалось загрузить ядро UwuRay");
    }
  })();
  try {
    await uwuRayLoadPromise;
  } catch (e) {
    uwuRayLoadPromise = null; // разрешить повторную попытку после перезапуска
    throw e;
  }
}

/** Sing-box — скачиваемое ядро (libsingbox.so), и после перезапуска приложения
 *  оно НЕ загружено в процесс: startLibCoreVpn сразу отклоняет запуск с
 *  ERR_NO_CORE «Ядро не загружено: singbox» (баг: подключение через sing-box
 *  не работало, пока пользователь заново не скачает ядро в настройках).
 *  Грузим лениво перед подключением — симметрично ensureUwuRayLoaded.
 *  Идемпотентно: GcSbCore.load кэширует путь, gcInit лёгкий. */
let singBoxLoadPromise: Promise<void> | null = null;
async function ensureSingBoxLoaded(): Promise<void> {
  if (singBoxLoadPromise) return singBoxLoadPromise;
  singBoxLoadPromise = (async () => {
    const st = getCoreStatus("libsingbox.so");
    // Self-heal: .so на устройстве может быть СТАРОЙ сборки (без тегов
    // with_utls/with_quic — REALITY/hysteria2 падали с «not included in this
    // build»). Клиент скачивает ядро только если файла нет, версию не сверяет,
    // поэтому здесь сравниваем размер с манифестом раздачи и при расхождении
    // молча перекачиваем актуальную сборку (sha256 проверяет downloadCore).
    let meta: { url: string; sha256: string; size: number } | null = null;
    try {
      const { fetchCoreMeta, FALLBACK } = await import("../screens/settings/cores");
      const { getCpuAbi } = await import("./native");
      const abi = getCpuAbi();
      meta = (await fetchCoreMeta("sing-box", abi)) || FALLBACK["sing-box"]?.[abi] || null;
    } catch {
      meta = null;
    }
    if (st?.downloaded && meta && meta.size > 0 && st.size !== meta.size) {
      try {
        const { downloadCore } = await import("./native");
        await downloadCore("libsingbox.so", meta.url, meta.sha256, meta.size);
      } catch {
        // Сеть недоступна — пробуем старое .so: лучше «старое ядро с
        // ограничением», чем полный отказ подключения.
      }
    }
    const st2 = getCoreStatus("libsingbox.so");
    if (!st2?.downloaded) {
      throw new Error("Ядро Sing-box не скачано — загрузите его в настройках");
    }
    try {
      await loadLibCore("singbox");
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      // ERR_CORE_CONFLICT: в этом процессе уже загружено другое скачиваемое
      // ядро (Go-рантайм один на процесс) — нужен перезапуск приложения.
      if (msg.includes("ERR_CORE_CONFLICT") || msg.includes("перезапустите")) {
        throw new Error("Переключено ядро — перезапустите приложение, чтобы применить Sing-box");
      }
      throw new Error(msg || "Не удалось загрузить ядро Sing-box");
    }
  })();
  try {
    await singBoxLoadPromise;
  } catch (e) {
    singBoxLoadPromise = null; // разрешить повторную попытку после перезапуска
    throw e;
  }
}

export async function connect(node: VpnNode, opts: ConnectOptions = {}): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) throw new Error("Нет разрешения на создание VPN-подключения");
  const running = await isVpnRunning();
  const core = getSelectedCore();
  if (!running && opts.autoUpdateCore !== false) await ensureSelectedCoreUpdated(core);
  if (running) {
    stopVpn();
    // Ждём фактической остановки (нативная сторона может гасить failover-монитор
    // до 3 с), а не фиксированные 800 мс — иначе runXray стартует на ещё не
    // закрытом туннеле и падает (краш при быстрой смене сервера).
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (!(await isVpnRunning())) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // Страховка: даже если сервис не рапортует остановку, даём ему договорить
    await new Promise((r) => setTimeout(r, 300));
  }
  const filter = await loadFilter();
  const bypass = currentBypass();
  // Новое подключение — начинаем журнал запросов с чистого листа (как в старом
  // приложении «Запросы» показывал соединения текущей сессии).
  try {
    truncateTextFile(accessLogPath());
    truncateTextFile(errorLogPath());
  } catch {}
  // Системный фильтр приложений: к выбранному вручную белому/чёрному списку
  // добавляются пакеты активных профилей «мимо VPN» (Android фиксирует список
  // приложений при establish(), поэтому пакеты — только на старте)
  const bypassPkgs = new Set(bypass.packages);
  let allowed = filter.allowed;
  let blocked = filter.blocked;
  if (allowed.length) {
    // белый список: пакет профиля «мимо VPN» должен быть исключён из белого
    allowed = allowed.filter((p) => !bypassPkgs.has(p));
  } else {
    blocked = [...new Set([...blocked, ...bypass.packages])];
  }

  const isSponsor = opts.isSponsor === true;
  // RoscomVPN-роутинг: LTE Open-серверы ВСЕГДА получают WHITELIST-роутинг
  // (напрямую только белые списки РФ) — профиль для этого включать не нужно;
  // обычные серверы получают DEFAULT-роутинг, только если профиль активен.
  let roscomMode: RoscomMode | null = null;
  try {
    if (isLteNode(node)) {
      roscomMode = "whitelist";
    } else {
      const active = roscomRoutingForNetwork(loadFilterSettings(), getNetworkType());
      if (active) roscomMode = "default";
    }
  } catch {}
  const failover = buildFailoverInfo(core, node, bypass.domains, isSponsor, roscomMode);

  // Сохраняем конфигурацию для плитки быстрых настроек (включение без приложения)
  // + имя сервера для уведомления (без ведущего флага — в шторке флаги-эмодзи
  // часто рендерятся квадратами, а «Германия» читается всегда).
  const serverName = splitNameFlag(node.name).name || node.name;
  const saveTileConfig = (config: string, coreKey: string) => {
    try {
      setSetting("tile_vpn_core", coreKey);
      setSetting("tile_vpn_config", config);
      setSetting("tile_vpn_allowed", allowed.join(","));
      setSetting("tile_vpn_blocked", blocked.join(","));
      setSetting("tile_vpn_host", node.address);
      setSetting("tile_vpn_port", String(node.port));
      setSetting("tile_vpn_server_name", serverName);
      setSetting(
        "tile_vpn_failover",
        failover ? JSON.stringify(failover.candidates) : ""
      );
    } catch {}
  };
  if (core === "sing-box") {
    const config = buildSingBoxConfig(node, selectedDnsProvider(isSponsor), bypass.domains, roscomMode);
    // Ядро скачиваемое — грузим .so лениво перед стартом (иначе нативный
    // гейт отклонит: ERR_NO_CORE «Ядро не загружено: singbox»).
    await ensureSingBoxLoaded();
    saveTileConfig(config, "singbox");
    await startLibCoreVpn("singbox", config, allowed, blocked, failover);
    lastConnectedNodeId = node.id;
    markVpnConnected();
    return;
  }
  if (core === "xray-joly") {
    if (!getCoreStatus("libxrayjoly.so").downloaded) throw new Error("Xray Joly не установлен — скачайте ядро в настройках");
    await loadLibCore("xray-joly");
    const config = buildXrayConfig(node, null, selectedDnsProvider(isSponsor), bypass.domains, roscomMode);
    saveTileConfig(config, "xray-joly");
    await startLibCoreVpn("xray-joly", config, allowed, blocked, failover);
    lastConnectedNodeId = node.id;
    markVpnConnected();
    return;
  }
  if (core === "xray-last") {
    if (!getCoreStatus("libxraylast.so").downloaded) throw new Error("Xray Last не установлен — скачайте ядро в настройках");
    await loadLibCore("xray-last");
    const config = buildXrayConfig(node, null, selectedDnsProvider(isSponsor), bypass.domains, roscomMode);
    saveTileConfig(config, "xray-last");
    await startLibCoreVpn("xray-last", config, allowed, blocked, failover);
    lastConnectedNodeId = node.id;
    markVpnConnected();
    return;
  }
  if (core === "uwuray") {
    // UwuRay — форк Xray-core: конфиг и анти-DPI (finalmask) как у Xray,
    // но ядро скачиваемое (System.load) — стартует через LibCoreVpnService.
    await ensureUwuRayLoaded();
    const config = buildXrayConfig(node, null, selectedDnsProvider(isSponsor), bypass.domains, roscomMode);
    saveTileConfig(config, "uwuray");
    await startLibCoreVpn("uwuray", config, allowed, blocked, failover);
    lastConnectedNodeId = node.id;
    markVpnConnected();
    return;
  }
  const config = buildXrayConfig(node, null, selectedDnsProvider(isSponsor), bypass.domains, roscomMode);
  saveTileConfig(config, "xray");
  await startVpn(config, allowed, blocked, failover, serverName);
  lastConnectedNodeId = node.id;
  markVpnConnected();
}

export async function disconnect(): Promise<void> {
  clearVpnConnected();
  await stopVpn();
}

export { isVpnRunning, onVpnStateChanged };
