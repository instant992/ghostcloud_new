import { deviceHeaders, loadSession } from "../storage";
import { parseSubscriptionText, parseClashYamlProxies, clashProxyToNode } from "./parse";
import type { VpnNode } from "./parse";
import { buildXrayConfig } from "./xrayConfig";
import { loadFilter } from "./appFilter";
import {
  isVpnRunning,
  onVpnStateChanged,
  requestVpnPermission,
  isPrepared,
  startVpn,
  stopVpn,
} from "./native";

const V2RAY_UA = "v2rayNG/1.10.24";

async function fetchText(url: string, userAgent: string): Promise<string | null> {
  try {
    const headers = await deviceHeaders();
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "*/*", ...headers },
    });
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
  const config = buildXrayConfig(node, null);
  const filter = await loadFilter();
  // Если заполнен белый список — блок-лист игнорируется (ограничение Android)
  const allowed = filter.allowed;
  const blocked = allowed.length ? [] : filter.blocked;
  await startVpn(config, allowed, blocked);
}

export async function disconnect(): Promise<void> {
  await stopVpn();
}

export { isVpnRunning, onVpnStateChanged };
