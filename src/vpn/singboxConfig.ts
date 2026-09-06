import { VpnNode } from "./parse";
import { getDnsProvider, type DnsProvider } from "./dns";
import { singboxRoscom, type RoscomMode } from "./roscomRouting";

const TUN_ADDRESS_V4 = "26.26.26.1/30";
const TUN_ADDRESS_V6 = "fdfe:dcba:9876::1/126";

function tlsBlock(node: VpnNode): Record<string, any> | null {
  if (node.security !== "tls" && node.security !== "reality") return null;
  const tls: Record<string, any> = {
    enabled: true,
    server_name: node.sni || node.address,
    insecure: false,
  };
  if (node.alpn && node.alpn.length) tls.alpn = node.alpn;
  if (node.fingerprint) {
    tls.utls = { enabled: true, fingerprint: node.fingerprint };
  }
  if (node.security === "reality") {
    tls.reality = {
      enabled: true,
      public_key: node.publicKey || "",
      short_id: node.shortId || "",
    };
  }
  return tls;
}

function transportBlock(node: VpnNode): Record<string, any> | null {
  switch (node.network) {
    case "ws":
      return {
        type: "ws",
        path: node.path || "/",
        headers: node.host ? { Host: node.host } : undefined,
      };
    case "grpc":
      return {
        type: "grpc",
        service_name: node.serviceName || node.path || "",
      };
    case "http":
    case "h2":
      return {
        type: "http",
        path: node.path || "/",
        host: [node.host || node.address],
      };
    case "httpupgrade":
      return {
        type: "httpupgrade",
        path: node.path || "/",
        host: node.host || node.address,
      };
    default:
      return null;
  }
}

function buildOutbound(node: VpnNode): Record<string, any> | null {
  const tls = tlsBlock(node);
  const transport = transportBlock(node);

  switch (node.protocol) {
    case "hysteria2":
      return {
        type: "hysteria2",
        tag: "proxy",
        server: node.address,
        server_port: node.port,
        password: node.password || node.uuid || "",
        up_mbps: 100,
        down_mbps: 100,
        tls: tls || { enabled: true, server_name: node.sni || node.address, insecure: true },
      };
    case "vless":
      return {
        type: "vless",
        tag: "proxy",
        server: node.address,
        server_port: node.port,
        uuid: node.uuid,
        flow: node.flow && node.flow !== "" ? node.flow : "",
        tls,
        transport,
      };
    case "vmess":
      return {
        type: "vmess",
        tag: "proxy",
        server: node.address,
        server_port: node.port,
        uuid: node.uuid,
        security: "auto",
        alter_id: node.alterId ?? 0,
        tls,
        transport,
      };
    case "trojan":
      return {
        type: "trojan",
        tag: "proxy",
        server: node.address,
        server_port: node.port,
        password: node.password,
        tls: tls || { enabled: true, server_name: node.sni || node.address, insecure: false },
        transport,
      };
    case "ss":
      return {
        type: "shadowsocks",
        tag: "proxy",
        server: node.address,
        server_port: node.port,
        method: node.method,
        password: node.password,
      };
    default:
      return null;
  }
}

/** Конфиг sing-box для ноды. TUN-дескриптор подставляется нативным сервисом (поле tunFd). */
export function buildSingBoxConfig(
  node: VpnNode,
  dns?: DnsProvider,
  bypassDomains: string[] = [],
  roscomMode?: RoscomMode | null
): string {
  const outbound = buildOutbound(node);
  if (!outbound) throw new Error("Протокол не поддерживается ядром sing-box");
  const provider = dns || getDnsProvider(null);

  // DNS-серверы: берём первый из списка провайдера (остальные — запасные)
  const dnsServers = provider.singbox.map((addr, i) => ({
    tag: i === 0 ? "primary" : `backup${i}`,
    address: addr,
    address_resolver: undefined,
  }));

  // Правила «мимо VPN» для доменов активных профилей фильтра соединения
  const domainBypassRules: Record<string, any>[] = [];
  if (bypassDomains.length) {
    domainBypassRules.push({
      domain_suffix: bypassDomains,
      outbound: "direct",
    });
  }

  // RoscomVPN-роутинг: локальные rule-set'ы (.srs распакованы нативно в rule-set/)
  const roscom = roscomMode ? singboxRoscom(roscomMode) : { ruleSets: [], rules: [] };

  const config: Record<string, any> = {
    log: { level: "info", timestamp: true },
    dns: {
      servers: dnsServers,
      final: "primary",
      strategy: "ipv4_only",
    },
    inbounds: [
      {
        type: "tun",
        tag: "tun-in",
        interface_name: "gctun0",
        address: [TUN_ADDRESS_V4, TUN_ADDRESS_V6],
        mtu: 1500,
        auto_route: false,
        strict_route: false,
        stack: "mixed",
      },
    ],
    outbounds: [
      outbound,
      { type: "direct", tag: "direct" },
      // block нужен для правил RoscomVPN (реклама/торренты/слежка)
      ...(roscomMode ? [{ type: "block", tag: "block" }] : []),
    ],
    route: {
      rules: [
        ...domainBypassRules,
        ...roscom.rules,
        {
          ip_is_private: true,
          outbound: "direct",
        },
      ],
      rule_set: roscom.ruleSets,
      final: "proxy",
      auto_detect_interface: true,
    },
  };

  return JSON.stringify(config);
}

/** Поддерживается ли нода ядром sing-box */
export function supportedBySingBox(node: VpnNode): boolean {
  return ["hysteria2", "vless", "vmess", "trojan", "ss"].includes(node.protocol);
}
