import type { VpnNode } from "./parse";

/** Сервер из /api/servers → VLESS Reality нода для Xray */
export function apiServerToNode(s: any): VpnNode {
  const network = String(s.network || "tcp").toLowerCase();
  return {
    id: `api-${s.name}-${s.address}-${s.port}`,
    name: String(s.name || s.address),
    protocol: "vless",
    address: String(s.address),
    port: parseInt(String(s.port), 10),
    uuid: String(s.uuid || ""),
    security: "reality",
    sni: s.sni ? String(s.sni) : undefined,
    fingerprint: s.fingerprint ? String(s.fingerprint) : "chrome",
    publicKey: s.publicKey ? String(s.publicKey) : undefined,
    shortId: s.shortId ? String(s.shortId) : undefined,
    network,
    serviceName: s.serviceName ? String(s.serviceName) : undefined,
    supportedByXray: true,
    raw: "",
    source: String(s.category) === "lte" ? "lte" : "wifi",
  };
}
