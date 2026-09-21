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
import { pingNodesBatch, loadLibCore, getCoreStatus } from "./native";
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
  const rest = failoverPool
    .filter((n) => n.id !== current.id)
    .filter((n) => n.source !== "lte")
    .filter((n) => isNodeUsable(n))
    .filter((n) => (core === "xray" || core === "uwuray" ? n.supportedByXray : true));
  const ranked = rankByPing(rest);
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
      (core === "xray" || core === "uwuray" ? n.supportedByXray : true)
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
  return [...a, ...b.filter((n) => !seen.has(keyOf(n)))];
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

export async function connect(node: VpnNode, opts: ConnectOptions = {}): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) throw new Error("Нет разрешения на создание VPN-подключения");
  const running = await isVpnRunning();
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

  const core = getSelectedCore();
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
    saveTileConfig(config, "singbox");
    await startLibCoreVpn("singbox", config, allowed, blocked, failover);
    lastConnectedNodeId = node.id;
    markVpnConnected();
    return;
  }
  if (core === "uwuray") {
    // UwuRay — форк Xray-core: конфиг и анти-DPI (finalmask) как у Xray,
    // но ядро скачиваемое (System.load) — стартует через LibCoreVpnService.
    if (!node.supportedByXray) {
      throw new Error("Hysteria2 доступен только на ядре sing-box — выберите его в настройках");
    }
    await ensureUwuRayLoaded();
    const config = buildXrayConfig(node, null, selectedDnsProvider(isSponsor), bypass.domains, roscomMode);
    saveTileConfig(config, "uwuray");
    await startLibCoreVpn("uwuray", config, allowed, blocked, failover);
    lastConnectedNodeId = node.id;
    markVpnConnected();
    return;
  }
  if (!node.supportedByXray) {
    throw new Error("Hysteria2 доступен только на ядре sing-box — выберите его в настройках");
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
