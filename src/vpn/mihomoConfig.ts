import { VpnNode } from "./parse";
import { getDnsProvider, type DnsProvider } from "./dns";

function yq(value: string | undefined): string {
  const s = String(value ?? "");
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function transportOpts(node: VpnNode): string[] {
  const lines: string[] = [];
  switch (node.network) {
    case "ws":
      lines.push(`  network: ws`);
      lines.push(`  ws-opts:`);
      lines.push(`    path: ${yq(node.path || "/")}`);
      if (node.host) {
        lines.push(`    headers:`);
        lines.push(`      Host: ${yq(node.host)}`);
      }
      break;
    case "grpc":
      lines.push(`  network: grpc`);
      lines.push(`  grpc-opts:`);
      lines.push(`    grpc-service-name: ${yq(node.serviceName || node.path || "")}`);
      break;
    case "h2":
    case "http":
      lines.push(`  network: h2`);
      lines.push(`  h2-opts:`);
      lines.push(`    path: ${yq(node.path || "/")}`);
      lines.push(`    host:`);
      lines.push(`      - ${yq(node.host || node.address)}`);
      break;
    default:
      break;
  }
  return lines;
}

function tlsOpts(node: VpnNode, indent: string): string[] {
  const lines: string[] = [];
  if (node.security === "reality") {
    lines.push(`${indent}tls: true`);
    lines.push(`${indent}servername: ${yq(node.sni || node.address)}`);
    if (node.fingerprint) lines.push(`${indent}client-fingerprint: ${yq(node.fingerprint)}`);
    lines.push(`${indent}reality-opts:`);
    lines.push(`${indent}  public-key: ${yq(node.publicKey || "")}`);
    lines.push(`${indent}  short-id: ${yq(node.shortId || "")}`);
  } else if (node.security === "tls" || node.protocol === "trojan" || node.protocol === "hysteria2") {
    if (node.protocol !== "trojan" && node.protocol !== "hysteria2") {
      lines.push(`${indent}tls: true`);
    }
    if (node.sni) lines.push(`${indent}servername: ${yq(node.sni)}`);
    if (node.fingerprint) lines.push(`${indent}client-fingerprint: ${yq(node.fingerprint)}`);
  }
  return lines;
}

/** Одна прокси-запись в формате Clash YAML */
export function mihomoProxyBlock(node: VpnNode, name = "gc-proxy"): string {
  const lines: string[] = [];
  lines.push(`- name: ${yq(name)}`);
  lines.push(`  server: ${yq(node.address)}`);
  lines.push(`  port: ${node.port}`);
  lines.push(`  udp: true`);

  switch (node.protocol) {
    case "vless":
      lines.push(`  type: vless`);
      lines.push(`  uuid: ${yq(node.uuid || "")}`);
      if (node.flow) lines.push(`  flow: ${yq(node.flow)}`);
      lines.push(...tlsOpts(node, "  "));
      lines.push(...transportOpts(node));
      break;
    case "vmess":
      lines.push(`  type: vmess`);
      lines.push(`  uuid: ${yq(node.uuid || "")}`);
      lines.push(`  alterId: ${node.alterId ?? 0}`);
      lines.push(`  cipher: auto`);
      lines.push(...tlsOpts(node, "  "));
      lines.push(...transportOpts(node));
      break;
    case "trojan":
      lines.push(`  type: trojan`);
      lines.push(`  password: ${yq(node.password || "")}`);
      lines.push(...tlsOpts(node, "  "));
      lines.push(...transportOpts(node));
      break;
    case "ss":
      lines.push(`  type: ss`);
      lines.push(`  cipher: ${yq(node.method || "aes-128-gcm")}`);
      lines.push(`  password: ${yq(node.password || "")}`);
      break;
    case "hysteria2":
      lines.push(`  type: hysteria2`);
      lines.push(`  password: ${yq(node.password || node.uuid || "")}`);
      if (node.sni) lines.push(`  sni: ${yq(node.sni)}`);
      break;
    default:
      throw new Error("Протокол не поддерживается ядром mihomo");
  }
  return lines.join("\n");
}

/** Полный YAML-конфиг mihomo для ноды. TUN-дескриптор подставляется нативно (gcStart). */
export function buildMihomoConfig(
  node: VpnNode,
  dns?: DnsProvider,
  bypassDomains: string[] = []
): string {
  const proxy = mihomoProxyBlock(node);
  const provider = dns || getDnsProvider(null);

  // Правила «мимо VPN» для доменов активных профилей фильтра соединения
  const domainRules = bypassDomains.map((d) => `  - DOMAIN-SUFFIX,${d},DIRECT`);

  return [
    `mode: rule`,
    `log-level: warning`,
    `ipv6: true`,
    `unified-delay: false`,
    `tcp-concurrent: true`,
    `tun:`,
    `  enable: true`,
    `  device: gctun0`,
    `  stack: mixed`,
    `  auto-route: false`,
    `  auto-detect-interface: false`,
    `dns:`,
    `  enable: true`,
    `  ipv6: true`,
    `  nameserver:`,
    ...provider.mihomo.map((s) => `    - ${s}`),
    `proxies:`,
    proxy,
    `proxy-groups:`,
    `  - name: ${yq("PROXY")}`,
    `    type: select`,
    `    proxies:`,
    `      - ${yq("gc-proxy")}`,
    `rules:`,
    ...domainRules,
    `  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve`,
    `  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve`,
    `  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve`,
    `  - IP-CIDR,127.0.0.0/8,DIRECT,no-resolve`,
    `  - IP-CIDR,169.254.0.0/16,DIRECT,no-resolve`,
    `  - IP-CIDR,224.0.0.0/3,DIRECT,no-resolve`,
    `  - MATCH,PROXY`,
    ``,
  ].join("\n");
}

/** Поддерживается ли нода ядром mihomo */
export function supportedByMihomo(node: VpnNode): boolean {
  return ["hysteria2", "vless", "vmess", "trojan", "ss"].includes(node.protocol);
}
