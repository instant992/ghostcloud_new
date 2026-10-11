import type { VpnNode } from "./parse";
import { getDnsProvider, type DnsProvider } from "./dns";
import { mihomoRoscom, type RoscomMode } from "./roscomRouting";

/** JSON is a YAML subset; no interpolation of credentials into YAML text. */
export function buildMihomoProxy(node: VpnNode): Record<string, any> {
  const network = node.network || "tcp";
  if (!["tcp", "ws", "grpc", "http", "h2"].includes(network)) {
    throw new Error(`Mihomo: транспорт ${network} пока не поддерживается клиентом — выберите Xray`);
  }
  if (node.headerType && node.headerType !== "none") throw new Error("Mihomo: TCP header не поддерживается клиентом");
  if (node.security && !["none", "tls", "reality"].includes(node.security)) throw new Error(`Mihomo: security ${node.security} не поддерживается`);
  if (node.flow && node.flow !== "xtls-rprx-vision") throw new Error(`Mihomo: flow ${node.flow} не поддерживается`);
  if (node.encryption && !["none", "auto", "zero", "aes-128-gcm", "chacha20-poly1305"].includes(node.encryption)) throw new Error("Mihomo: VLESS encryption не поддерживается клиентом");
  const proxy: Record<string, any> = { name: "PROXY", type: node.protocol, server: node.address, port: node.port, udp: true };
  switch (node.protocol) {
    case "vless":
      if (!node.uuid) throw new Error("Mihomo: отсутствует UUID");
      proxy.uuid = node.uuid;
      if (node.flow) proxy.flow = node.flow;
      break;
    case "vmess":
      if (!node.uuid) throw new Error("Mihomo: отсутствует UUID");
      proxy.uuid = node.uuid;
      proxy.alterId = node.alterId || 0;
      proxy.cipher = node.encryption || "auto";
      break;
    case "trojan":
      if (node.security === "reality") throw new Error("Mihomo: Trojan REALITY не поддерживается");
      proxy.password = node.password;
      break;
    case "ss":
      if (network !== "tcp" || (node.security && node.security !== "none")) throw new Error("Mihomo: SS transport/plugin не поддерживается клиентом");
      proxy.cipher = node.method;
      proxy.password = node.password;
      break;
    case "hysteria2":
      if (network !== "tcp" || node.security === "reality") throw new Error("Mihomo: неверный транспорт Hysteria2");
      proxy.password = node.password || node.uuid;
      if (node.obfs) {
        if (node.obfs !== "salamander" || !node.obfsPassword) throw new Error("Mihomo: неподдерживаемый obfs Hysteria2");
        proxy.obfs = node.obfs;
        proxy["obfs-password"] = node.obfsPassword;
      }
      if (node.pinSha256) proxy.fingerprint = node.pinSha256;
      break;
    default: throw new Error("Mihomo: протокол не поддерживается");
  }
  if (["trojan", "ss", "hysteria2"].includes(node.protocol) && !proxy.password) throw new Error("Mihomo: отсутствует пароль");
  const tls = node.security === "tls" || node.security === "reality" || node.protocol === "trojan" || node.protocol === "hysteria2";
  if (tls) {
    proxy.tls = true;
    proxy.servername = node.sni || node.address;
    proxy.sni = node.sni || node.address;
    proxy["skip-cert-verify"] = false;
    if (node.alpn?.length) proxy.alpn = node.alpn;
    if (node.fingerprint && node.protocol !== "hysteria2") proxy["client-fingerprint"] = node.fingerprint;
    if (node.security === "reality") {
      if (node.protocol !== "vless" || !node.publicKey) throw new Error("Mihomo: REALITY требует VLESS и public key");
      proxy["reality-opts"] = { "public-key": node.publicKey, "short-id": node.shortId || "" };
    }
  }
  if (network !== "tcp") {
    if (!["vless", "vmess", "trojan"].includes(node.protocol)) throw new Error("Mihomo: transport не поддерживается для протокола");
    if (node.protocol === "trojan" && !["ws", "grpc"].includes(network)) throw new Error("Mihomo: Trojan поддерживает TCP/WS/gRPC");
    proxy.network = network;
    if (network === "ws") proxy["ws-opts"] = { path: node.path || "/", headers: node.host ? { Host: node.host } : {} };
    if (network === "grpc") proxy["grpc-opts"] = { "grpc-service-name": node.serviceName || node.path || "" };
    if (network === "h2") proxy["h2-opts"] = { path: node.path || "/", host: [node.host || node.address] };
    if (network === "http") proxy["http-opts"] = { path: [node.path || "/"], headers: { Host: [node.host || node.address] } };
  }
  return proxy;
}

export function supportedByMihomo(node: VpnNode): boolean {
  try { buildMihomoProxy(node); return true; } catch { return false; }
}

export function buildMihomoConfig(node: VpnNode, dns?: DnsProvider, bypassDomains: string[] = [], roscomMode?: RoscomMode | null): string {
  const roscom = roscomMode ? mihomoRoscom(roscomMode) : { providers: {}, rules: [] };
  if (bypassDomains.some((d) => !d || /[,\s\r\n]/.test(d))) throw new Error("Mihomo: некорректный домен обхода");
  return JSON.stringify({
    mode: "rule", "log-level": "info", ipv6: true, "find-process-mode": "off",
    "allow-lan": false, "bind-address": "127.0.0.1",
    tun: { enable: true, stack: "gvisor", mtu: 1500, "auto-route": false, "auto-detect-interface": false, "dns-hijack": ["any:53", "tcp://any:53"], "inet4-address": ["26.26.26.1/30"], "inet6-address": ["fdfe:dcba:9876::1/126"] },
    dns: { enable: true, ipv6: true, "enhanced-mode": "fake-ip", "fake-ip-range": "198.18.0.1/16", "default-nameserver": ["8.8.8.8", "1.1.1.1"], nameserver: (dns || getDnsProvider(null)).mihomo, "fake-ip-filter": ["+.lan", "+.local"] },
    proxies: [buildMihomoProxy(node)], "rule-providers": roscom.providers,
    rules: [...bypassDomains.map((d) => `DOMAIN-SUFFIX,${d},DIRECT`), ...roscom.rules, "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve", "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve", "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve", "IP-CIDR6,fc00::/7,DIRECT,no-resolve", "MATCH,PROXY"],
  });
}
