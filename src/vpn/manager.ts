import { deviceHeaders, loadSession } from "../storage";
import { getSelectedCore, setSetting } from "../settings";
import { parseSubscriptionText, parseClashYamlProxies, clashProxyToNode } from "./parse";
import type { VpnNode } from "./parse";
import { buildXrayConfig } from "./xrayConfig";
import { buildSingBoxConfig } from "./singboxConfig";
import { buildMihomoConfig } from "./mihomoConfig";
import { loadFilter } from "./appFilter";
import {
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

/** Задаёт пул серверов-кандидатов для авто-файловера (вызывается из контекста при загрузке узлов). */
export function setFailoverPool(nodes: VpnNode[]): void {
  failoverPool = nodes;
}

function buildConfigFor(core: string, node: VpnNode): string | null {
  try {
    if (core === "sing-box") return buildSingBoxConfig(node);
    if (core === "mihomo") return buildMihomoConfig(node);
    if (!node.supportedByXray) return null;
    return buildXrayConfig(node, null);
  } catch {
    return null;
  }
}

/** Собирает инфо для авто-файловера: текущий сервер + запасные (не-LTE, поддерживаемые ядром). */
function buildFailoverInfo(core: string, current: VpnNode): FailoverInfo | undefined {
  const candidates = failoverPool
    .filter((n) => n.id !== current.id)
    .filter((n) => n.source !== "lte")
    .filter((n) => (core === "xray" ? n.supportedByXray : true))
    .slice(0, FAILOVER_MAX)
    .map((n) => {
      const config = buildConfigFor(core, n);
      if (!config) return null;
      return { config, host: n.address, port: n.port };
    })
    .filter((c): c is { config: string; host: string; port: number } => c !== null);
  if (!candidates.length) return undefined;
  return { host: current.address, port: current.port, candidates };
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
  const seen = new Set(a.map((n) => n.id));
  return [...a, ...b.filter((n) => !seen.has(n.id))];
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

export async function connect(node: VpnNode): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) throw new Error("Нет разрешения на создание VPN-подключения");
  const running = await isVpnRunning();
  if (running) {
    await stopVpn();
    await new Promise((r) => setTimeout(r, 800));
  }
  const filter = await loadFilter();
  // Если заполнен белый список — блок-лист игнорируется (ограничение Android)
  const allowed = filter.allowed;
  const blocked = allowed.length ? [] : filter.blocked;

  const core = getSelectedCore();
  const failover = buildFailoverInfo(core, node);

  // Сохраняем конфигурацию для плитки быстрых настроек (включение без приложения)
  const saveTileConfig = (config: string, coreKey: string) => {
    try {
      setSetting("tile_vpn_core", coreKey);
      setSetting("tile_vpn_config", config);
      setSetting("tile_vpn_allowed", allowed.join(","));
      setSetting("tile_vpn_blocked", blocked.join(","));
      setSetting("tile_vpn_host", node.address);
      setSetting("tile_vpn_port", String(node.port));
      setSetting(
        "tile_vpn_failover",
        failover ? JSON.stringify(failover.candidates) : ""
      );
    } catch {}
  };
  if (core === "sing-box") {
    const config = buildSingBoxConfig(node);
    saveTileConfig(config, "singbox");
    await startLibCoreVpn("singbox", config, allowed, blocked, failover);
    return;
  }
  if (core === "mihomo") {
    const config = buildMihomoConfig(node);
    saveTileConfig(config, "mihomo");
    await startLibCoreVpn("mihomo", config, allowed, blocked, failover);
    return;
  }
  if (!node.supportedByXray) {
    throw new Error("Hysteria2 доступен только на ядрах sing-box и mihomo — выберите их в настройках");
  }
  const config = buildXrayConfig(node, null);
  saveTileConfig(config, "xray");
  await startVpn(config, allowed, blocked, failover);
}

export async function disconnect(): Promise<void> {
  await stopVpn();
}

export { isVpnRunning, onVpnStateChanged };
