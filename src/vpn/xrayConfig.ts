import { VpnNode } from "./parse";
import { getDnsProvider, type DnsProvider } from "./dns";

export function buildStreamSettings(node: VpnNode): Record<string, any> {
  const network = node.network || "tcp";
  const stream: Record<string, any> = {
    network,
    security: node.security === "tls" || node.security === "reality" ? node.security : "none",
  };

  if (stream.security === "tls" || stream.security === "reality") {
    stream.tlsSettings = stream.security === "reality" ? undefined : {
      serverName: node.sni || node.address,
      allowInsecure: false,
      fingerprint: node.fingerprint || "chrome",
      alpn: node.alpn,
    };
    if (stream.security === "reality") {
      stream.realitySettings = {
        serverName: node.sni || node.address,
        fingerprint: node.fingerprint || "chrome",
        publicKey: node.publicKey || "",
        shortId: node.shortId || "",
        spiderX: node.spiderX || "",
      };
      delete stream.tlsSettings;
    }
  }

  switch (network) {
    case "ws":
      stream.wsSettings = {
        path: node.path || "/",
        headers: node.host ? { Host: node.host } : undefined,
      };
      break;
    case "grpc":
      stream.grpcSettings = {
        authority: node.host || node.sni || "",
        serviceName: node.serviceName || node.path || "",
        multiMode: node.headerType === "multi",
      };
      break;
    case "kcp":
      stream.kcpSettings = {
        mtu: 1350,
        header: { type: node.headerType || "none" },
        seed: node.path || undefined,
      };
      break;
    case "http":
    case "h2":
      stream.network = "http";
      stream.httpSettings = {
        host: [node.host || node.address],
        path: node.path || "/",
      };
      break;
    case "tcp": {
      if (node.headerType === "http") {
        stream.tcpSettings = {
          header: {
            type: "http",
            request: {
              version: "1.1",
              method: "GET",
              path: [node.path || "/"],
              headers: { Host: [node.host || node.address].flat() },
            },
          },
        };
      }
      break;
    }
    case "httpupgrade":
      stream.httpupgradeSettings = {
        host: node.host || node.sni || node.address,
        path: node.path || "/",
      };
      break;
    case "xhttp":
    case "splithttp": {
      const settings: Record<string, any> = {
        host: node.host || node.sni || "",
        path: node.path || "/",
        mode: node.mode || (node.typeParam === "splithttp" ? "packet-up" : "auto"),
      };
      if (node.extra) {
        try {
          settings.extra = JSON.parse(node.extra);
        } catch {}
      }
      if (stream.network === "xhttp") stream.xhttpSettings = settings;
      else stream.splitHttpSettings = settings;
      break;
    }
    default:
      break;
  }

  return stream;
}

export function buildOutbound(node: VpnNode): Record<string, any> | null {
  const streamSettings = buildStreamSettings(node);

  switch (node.protocol) {
    case "vless":
      return {
        tag: "proxy",
        protocol: "vless",
        settings: {
          vnext: [
            {
              address: node.address,
              port: node.port,
              users: [
                {
                  id: node.uuid,
                  // xtls-rprx-vision допустим ТОЛЬКО для reality+tcp
                  flow:
                    node.flow ??
                    (streamSettings.security === "reality" && streamSettings.network === "tcp"
                      ? "xtls-rprx-vision"
                      : ""),
                  encryption: "none",
                },
              ],
            },
          ],
        },
        streamSettings,
      };
    case "vmess":
      return {
        tag: "proxy",
        protocol: "vmess",
        settings: {
          vnext: [
            {
              address: node.address,
              port: node.port,
              users: [
                {
                  id: node.uuid,
                  alterId: node.alterId ?? 0,
                  security: "auto",
                },
              ],
            },
          ],
        },
        streamSettings,
      };
    case "trojan":
      return {
        tag: "proxy",
        protocol: "trojan",
        settings: {
          servers: [
            {
              address: node.address,
              port: node.port,
              password: node.password,
            },
          ],
        },
        streamSettings,
      };
    case "ss":
      return {
        tag: "proxy",
        protocol: "shadowsocks",
        settings: {
          servers: [
            {
              address: node.address,
              port: node.port,
              method: node.method,
              password: node.password,
              uot: true,
            },
          ],
        },
      };
    default:
      return null;
  }
}

const TUN_GATEWAY_V4 = "26.26.26.1";
const TUN_GATEWAY_V6 = "fdfe:dcba:9876::1";
const TUN_DNS = "10.111.222.3";

export function buildXrayConfig(
  node: VpnNode,
  tunFd: number | null,
  dns?: DnsProvider,
  bypassDomains: string[] = []
): string {
  const outbound = buildOutbound(node);
  if (!outbound) throw new Error("Протокол не поддерживается ядром Xray");

  const provider = dns || getDnsProvider(null);

  // Правила «мимо VPN» для доменов из активных профилей фильтра соединения
  const domainRules: Record<string, any>[] = bypassDomains.map((d) => ({
    type: "field",
    domain: [d],
    outboundTag: "direct",
  }));

  const config: Record<string, any> = {
    log: { loglevel: "warning" },
    dns: {
      servers: provider.xray,
      queryStrategy: "UseIPv4",
    },
    inbounds: [
      {
        tag: "tun-in",
        protocol: "tun",
        settings: {
          name: "xraytun0",
          mtu: 1500,
          gateway: [TUN_GATEWAY_V4, TUN_GATEWAY_V6],
        },
      },
    ],
    outbounds: [
      outbound,
      { tag: "dns-out", protocol: "dns", settings: { nonIPQuery: "skip" } },
      { tag: "direct", protocol: "freedom" },
      { tag: "block", protocol: "blackhole" },
    ],
    routing: {
      domainStrategy: "AsIs",
      rules: [
        // Весь DNS с TUN (10.111.222.3) отвечает встроенный DNS-сервер Xray
        { type: "field", ip: [TUN_DNS], outboundTag: "dns-out" },
        // Домены активных профилей «мимо VPN» — напрямую
        ...domainRules,
        { type: "field", ip: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16"], outboundTag: "direct" },
        { type: "field", ip: ["224.0.0.0/3", "ff00::/8"], outboundTag: "block" },
      ],
    },
  };

  if (tunFd !== null) {
    config.env = { "xray.tun.fd": String(tunFd) };
  }

  return JSON.stringify(config);
}
