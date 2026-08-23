export type VpnNode = {
  id: string;
  name: string;
  protocol: "vless" | "vmess" | "trojan" | "ss" | "hysteria2";
  address: string;
  port: number;
  security?: string;
  network?: string;
  supportedByXray: boolean;
  raw: string;
  // protocol-specific
  uuid?: string;
  password?: string;
  method?: string;
  sni?: string;
  host?: string;
  path?: string;
  fingerprint?: string;
  publicKey?: string;
  shortId?: string;
  spiderX?: string;
  flow?: string;
  serviceName?: string;
  headerType?: string;
  alterId?: number;
  encryption?: string;
  typeParam?: string;
  mode?: string;
  source?: "sub" | "wifi" | "lte";
};

function b64decode(input: string): string {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  const bin = atobUniversal(s);
  try {
    return decodeURIComponent(escape(bin));
  } catch {
    return bin;
  }
}

function atobUniversal(b64: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of b64) {
    if (ch === "=" || ch === "\n" || ch === "\r") continue;
    const idx = chars.indexOf(ch);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parseShareLink(link: string): VpnNode | null {
  const trimmed = link.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  if (trimmed.startsWith("vless://")) return parseVless(trimmed);
  if (trimmed.startsWith("vmess://")) return parseVmess(trimmed);
  if (trimmed.startsWith("trojan://")) return parseTrojan(trimmed);
  if (trimmed.startsWith("ss://")) return parseShadowsocks(trimmed);
  if (trimmed.startsWith("hysteria2://") || trimmed.startsWith("hy2://"))
    return parseHysteria2(trimmed);
  return null;
}

function parseQueryParams(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    params[pair.slice(0, eq).toLowerCase()] = safeDecodeURIComponent(pair.slice(eq + 1));
  }
  return params;
}

function parseVless(link: string): VpnNode | null {
  try {
    const withoutScheme = link.slice("vless://".length);
    const hashIdx = withoutScheme.indexOf("#");
    const name = hashIdx >= 0 ? safeDecodeURIComponent(withoutScheme.slice(hashIdx + 1)) : "VLESS";
    const mainPart = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;
    const [userinfoHost, query] = mainPart.split("?", 2);
    const atIdx = userinfoHost.lastIndexOf("@");
    if (atIdx === -1) return null;
    const uuid = userinfoHost.slice(0, atIdx);
    let hostport = userinfoHost.slice(atIdx + 1);
    let address = "";
    let port = 443;
    if (hostport.startsWith("[")) {
      const close = hostport.indexOf("]");
      address = hostport.slice(1, close);
      port = parseInt(hostport.slice(close + 2), 10);
    } else {
      const colon = hostport.lastIndexOf(":");
      address = hostport.slice(0, colon);
      port = parseInt(hostport.slice(colon + 1), 10);
    }
    const p = parseQueryParams(query || "");
    return {
      id: `vless-${address}-${port}-${uuid.slice(0, 8)}`,
      name,
      protocol: "vless",
      address,
      port,
      uuid,
      security: p.security,
      network: p.type || "tcp",
      flow: p.flow,
      sni: p.sni || p.host,
      host: p.host,
      path: p.path,
      fingerprint: p.fp,
      publicKey: p.pbk,
      shortId: p.sid,
      spiderX: p.spx,
      serviceName: p.servicename,
      headerType: p.headertype,
      encryption: p.encryption,
      typeParam: p.type,
      mode: p.mode,
      supportedByXray: true,
      raw: link,
    };
  } catch {
    return null;
  }
}

function parseVmess(link: string): VpnNode | null {
  try {
    const body = link.slice("vmess://".length);

    // Формат 1: base64-JSON (VMessQRCode / v2rayN)
    const decoded = b64decode(body);
    if (decoded.trim().startsWith("{")) {
      const json = JSON.parse(decoded);
      const address = String(json.add || "");
      const port = parseInt(String(json.port || 443), 10);
      if (!address) return null;
      return {
        id: `vmess-${address}-${port}-${String(json.id || "").slice(0, 8)}`,
        name: String(json.ps || json.remarks || "VMess"),
        protocol: "vmess",
        address,
        port,
        uuid: String(json.id || ""),
        alterId: parseInt(String(json.aid ?? json.alterId ?? 0), 10) || 0,
        network: String(json.net || "tcp"),
        security: String(json.tls === "tls" ? "tls" : "none"),
        sni: String(json.sni || json.host || ""),
        host: String(json.host || ""),
        path: String(json.path || ""),
        fingerprint: String(json.fp || ""),
        serviceName: String(json.path && json.net === "grpc" ? json.path : "") || undefined,
        headerType: String(json.type || "") || undefined,
        encryption: "auto",
        mode: String(json.mode || ""),
        supportedByXray: true,
        raw: link,
      };
    }

    // Формат 2: URI vmess://uuid@host:port?params#name
    if (body.includes("@")) {
      return parseVlessLikeUri("vmess", body);
    }
    return null;
  } catch {
    return null;
  }
}

function parseVlessLikeUri(protocol: "vmess", body: string): VpnNode | null {
  const hashIdx = body.indexOf("#");
  const name = hashIdx >= 0 ? safeDecodeURIComponent(body.slice(hashIdx + 1)) : protocol.toUpperCase();
  const mainPart = hashIdx >= 0 ? body.slice(0, hashIdx) : body;
  const [userinfoHost, query] = mainPart.split("?", 2);
  const atIdx = userinfoHost.lastIndexOf("@");
  if (atIdx === -1) return null;
  const uuidOrPwd = userinfoHost.slice(0, atIdx);
  let hostport = userinfoHost.slice(atIdx + 1);
  let address = "";
  let port = 443;
  if (hostport.startsWith("[")) {
    const close = hostport.indexOf("]");
    address = hostport.slice(1, close);
    port = parseInt(hostport.slice(close + 2), 10);
  } else {
    const colon = hostport.lastIndexOf(":");
    address = hostport.slice(0, colon);
    port = parseInt(hostport.slice(colon + 1), 10);
  }
  const p = parseQueryParams(query || "");
  return {
    id: `${protocol}-${address}-${port}-${uuidOrPwd.slice(0, 8)}`,
    name,
    protocol,
    address,
    port,
    uuid: uuidOrPwd,
    password: undefined,
    network: p.type || "tcp",
    security: p.security,
    sni: p.sni,
    host: p.host,
    path: p.path,
    fingerprint: p.fp,
    serviceName: p.servicename,
    headerType: p.headertype,
    encryption: "auto",
    mode: p.mode,
    supportedByXray: true,
    raw: `${protocol}://${body}`,
  } as VpnNode;
}

function parseTrojan(link: string): VpnNode | null {
  try {
    const withoutScheme = link.slice("trojan://".length);
    const hashIdx = withoutScheme.indexOf("#");
    const name = hashIdx >= 0 ? safeDecodeURIComponent(withoutScheme.slice(hashIdx + 1)) : "Trojan";
    const mainPart = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;
    const [pwdHost, query] = mainPart.split("?", 2);
    const atIdx = pwdHost.lastIndexOf("@");
    if (atIdx === -1) return null;
    const password = safeDecodeURIComponent(pwdHost.slice(0, atIdx));
    let hostport = pwdHost.slice(atIdx + 1);
    let address = "";
    let port = 443;
    if (hostport.startsWith("[")) {
      const close = hostport.indexOf("]");
      address = hostport.slice(1, close);
      port = parseInt(hostport.slice(close + 2), 10);
    } else {
      const colon = hostport.lastIndexOf(":");
      address = hostport.slice(0, colon);
      port = parseInt(hostport.slice(colon + 1), 10);
    }
    const p = parseQueryParams(query || "");
    return {
      id: `trojan-${address}-${port}-${password.slice(0, 8)}`,
      name,
      protocol: "trojan",
      address,
      port,
      password,
      security: p.security || "tls",
      sni: p.sni || p.peer,
      host: p.host,
      network: p.type || "tcp",
      path: p.path,
      serviceName: p.servicename,
      fingerprint: p.fp,
      headerType: p.headertype,
      supportedByXray: true,
      raw: link,
    };
  } catch {
    return null;
  }
}

function parseShadowsocks(link: string): VpnNode | null {
  try {
    const withoutScheme = link.slice("ss://".length);

    // SIP002: ss://base64(method:password)@host:port#name или ss://method:password@host:port?plugin=...#name
    const hashIdx = withoutScheme.indexOf("#");
    const name = hashIdx >= 0 ? safeDecodeURIComponent(withoutScheme.slice(hashIdx + 1)) : "Shadowsocks";
    const mainPart = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;

    const qIdx = mainPart.indexOf("?");
    const mainNoQ = qIdx >= 0 ? mainPart.slice(0, qIdx) : mainPart;
    const query = qIdx >= 0 ? parseQueryParams(mainPart.slice(qIdx + 1)) : {};

    const atIdx = mainNoQ.lastIndexOf("@");
    if (atIdx !== -1) {
      let userInfo = mainNoQ.slice(0, atIdx);
      const hostport = mainNoQ.slice(atIdx + 1);
      const colon = hostport.lastIndexOf(":");
      const address = hostport.startsWith("[")
        ? hostport.slice(1, hostport.indexOf("]"))
        : hostport.slice(0, colon);
      const port = parseInt(
        hostport.startsWith("]") ? hostport.split("]:")[1] : hostport.slice(colon + 1),
        10
      );
      let method = "";
      let password = "";
      if (userInfo.includes(":")) {
        // может быть base64(method:password)
        if (!/^[a-z0-9-]+:/i.test(userInfo)) {
          userInfo = b64decode(userInfo);
        }
        const sep = userInfo.indexOf(":");
        method = userInfo.slice(0, sep);
        password = safeDecodeURIComponent(userInfo.slice(sep + 1));
      } else {
        const decoded = b64decode(userInfo);
        const sep = decoded.indexOf(":");
        method = decoded.slice(0, sep);
        password = decoded.slice(sep + 1);
      }
      return {
        id: `ss-${address}-${port}`,
        name,
        protocol: "ss",
        address,
        port,
        method,
        password,
        supportedByXray: true,
        raw: link,
      };
    }

    // Legacy: ss://base64(method:password@host:port)#name
    const decoded = b64decode(mainNoQ);
    const sep = decoded.indexOf(":");
    const method = decoded.slice(0, sep);
    const rest = decoded.slice(sep + 1);
    const lastAt = rest.lastIndexOf("@");
    const password = rest.slice(0, lastAt);
    const hostport = rest.slice(lastAt + 1);
    const colon = hostport.lastIndexOf(":");
    const address = hostport.slice(0, colon);
    const port = parseInt(hostport.slice(colon + 1), 10);
    if (!address || !port) return null;
    return {
      id: `ss-${address}-${port}`,
      name,
      protocol: "ss",
      address,
      port,
      method,
      password,
      supportedByXray: true,
      raw: link,
    };
  } catch {
    return null;
  }
}

function parseHysteria2(link: string): VpnNode | null {
  try {
    const withoutScheme = link.replace(/^hy2:\/\//, "hysteria2://").slice("hysteria2://".length);
    const hashIdx = withoutScheme.indexOf("#");
    const name = hashIdx >= 0 ? safeDecodeURIComponent(withoutScheme.slice(hashIdx + 1)) : "Hysteria2";
    const mainPart = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;
    const [authHost, query] = mainPart.split("?", 2);
    const atIdx = authHost.lastIndexOf("@");
    const auth = atIdx >= 0 ? authHost.slice(0, atIdx) : "";
    const hostport = atIdx >= 0 ? authHost.slice(atIdx + 1) : authHost;
    let address = "";
    let port = 443;
    if (hostport.startsWith("[")) {
      const close = hostport.indexOf("]");
      address = hostport.slice(1, close);
      port = parseInt(hostport.slice(close + 2), 10);
    } else {
      const colon = hostport.lastIndexOf(":");
      address = hostport.slice(0, colon);
      port = parseInt(hostport.slice(colon + 1), 10) || 443;
    }
    const p = parseQueryParams(query || "");
    return {
      id: `hy2-${address}-${port}`,
      name,
      protocol: "hysteria2",
      address,
      port,
      password: auth,
      sni: p.sni,
      security: "tls",
      supportedByXray: false,
      raw: link,
    };
  } catch {
    return null;
  }
}

export function parseSubscriptionText(text: string): { nodes: VpnNode[]; unsupported: VpnNode[] } {
  const nodes: VpnNode[] = [];
  const unsupported: VpnNode[] = [];

  const push = (node: VpnNode | null) => {
    if (!node) return;
    if (!node.address || !node.port) return;
    if (node.supportedByXray) nodes.push(node);
    else unsupported.push(node);
  };

  const trimmed = text.trim();

  // Вариант 0: Clash YAML (комбинированная подписка возвращает именно его)
  if (/^\s*proxies:\s*$/m.test(trimmed) || trimmed.includes("port:") && trimmed.includes("server:")) {
    const yamlNodes = parseClashYamlProxies(trimmed);
    if (yamlNodes.length > 0) {
      for (const px of yamlNodes) push(clashProxyToNode(px));
      return { nodes, unsupported };
    }
  }

  // Вариант 1: JSON (sing-box / v2ray config / clash с полями proxies)
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed);
      const arr = Array.isArray(json) ? json : [];
      for (const item of arr) {
        if (typeof item === "string") push(parseShareLink(item));
      }
      if (Array.isArray(json.outbounds)) {
        for (const ob of json.outbounds) {
          if (ob?.server && typeof ob.server === "string") {
            push(jsonToNode(ob));
          }
        }
      }
      if (json.proxies && Array.isArray(json.proxies)) {
        for (const px of json.proxies) push(clashProxyToNode(px));
      }
      return { nodes, unsupported };
    } catch {}
  }

  // Вариант 2: base64-список ссылок
  let lines: string[];
  if (!trimmed.includes("://")) {
    try {
      const decoded = b64decode(trimmed);
      lines = decoded.split(/\r?\n/);
    } catch {
      lines = trimmed.split(/\r?\n/);
    }
  } else {
    lines = trimmed.split(/\r?\n/);
  }

  for (const line of lines) push(parseShareLink(line));

  // Дедупликация по id
  const seen = new Set<string>();
  const unique = nodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
  const uniqueUnsupported = unsupported.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  return { nodes: unique, unsupported: uniqueUnsupported };
}

// ── Clash YAML (минимальный парсер блока proxies:) ──

function yamlIndent(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

function yamlValue(raw: string): any {
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function setNested(obj: any, path: string[], value: any): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof cur[path[i]] !== "object" || cur[path[i]] === null) cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
}

export function parseClashYamlProxies(text: string): any[] {
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^proxies:\s*(#.*)?$/.test(l.trim()));
  if (startIdx === -1) return [];
  const baseIndent = yamlIndent(lines[startIdx]);

  const result: any[] = [];
  let current: any = null;
  const stack: Array<{ indent: number; path: string[] }> = [];

  const applyField = (raw: string, fieldIndent: number) => {
    const m = raw.match(/^([^:#\s][^:]*):\s?(.*)$/);
    if (!m || !current) return;
    const key = m[1].trim().replace(/^["']|["']$/g, "");
    const valueRaw = m[2].trim();
    while (stack.length > 0 && stack[stack.length - 1].indent >= fieldIndent) stack.pop();
    const parentPath = stack.length > 0 ? stack[stack.length - 1].path : [];
    const path = [...parentPath, key];
    if (valueRaw === "" || valueRaw === "{}") {
      stack.push({ indent: fieldIndent, path });
      if (valueRaw === "{}") setNested(current, path, {});
    } else {
      setNested(current, path, yamlValue(valueRaw));
    }
  };

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = yamlIndent(line);
    if (indent <= baseIndent) break;

    const dashIdx = line.indexOf("- ");
    if (indent <= (stack.length > 0 ? stack[stack.length - 1].indent : indent) && dashIdx !== -1 && dashIdx < indent + 4) {
      current = {};
      result.push(current);
      stack.length = 0;
      const rest = line.slice(dashIdx + 2);
      if (rest.trim()) {
        applyField(rest, indent + (dashIdx - indent) + 2);
      }
    } else if (current) {
      applyField(line.trim(), indent);
    }
  }
  return result;
}

// sing-box outbound → VpnNode (базовая поддержка vless/vmess/trojan/shadowsocks)
function jsonToNode(ob: any): VpnNode | null {
  const type = String(ob.type || "").toLowerCase();
  const address = String(ob.server || "");
  const port = parseInt(String(ob.server_port || 0), 10);
  if (!address || !port) return null;
  const tls = ob.tls?.enabled ? "tls" : "reality_enabled" in ob ? "tls" : "";
  const base = {
    id: `${type}-${address}-${port}`,
    name: String(ob.tag || type),
    address,
    port,
    security: ob.tls?.server_name ? "tls" : tls,
    sni: ob.tls?.server_name,
    network: String(ob.transport?.type || "tcp"),
    path: ob.transport?.path,
    host: ob.transport?.headers?.Host?.[0],
    supportedByXray: true,
    raw: "",
  };
  switch (type) {
    case "vless":
      return { ...base, protocol: "vless", uuid: ob.uuid, flow: ob.flow, publicKey: ob.tls?.reality?.public_key, shortId: ob.tls?.reality?.short_id } as VpnNode;
    case "vmess":
      return { ...base, protocol: "vmess", uuid: ob.uuid, alterId: ob.alter_id || 0 } as VpnNode;
    case "trojan":
      return { ...base, protocol: "trojan", password: ob.password } as VpnNode;
    case "shadowsocks":
      return { ...base, protocol: "ss", method: ob.method, password: ob.password } as VpnNode;
    default:
      return null;
  }
}

// Clash.Meta proxy → VpnNode
export function clashProxyToNode(px: any): VpnNode | null {
  const type = String(px.type || "").toLowerCase();
  const address = String(px.server || "");
  const port = parseInt(String(px.port || 0), 10);
  if (!address || !port) return null;
  const wsOpts = px["ws-opts"] || {};
  const grpcOpts = px["grpc-opts"] || {};
  const base = {
    id: `${type}-${address}-${port}`,
    name: String(px.name || type),
    address,
    port,
    network: String(px.network || (grpcOpts["grpc-service-name"] ? "grpc" : "tcp")),
    sni: px.servername || px.sni,
    security: px.tls ? "tls" : undefined,
    path: wsOpts?.path,
    host: Array.isArray(wsOpts?.headers?.Host) ? wsOpts.headers.Host[0] : wsOpts?.headers?.Host,
    serviceName: grpcOpts?.["grpc-service-name"],
    supportedByXray: true,
    raw: "",
  };
  switch (type) {
    case "vless":
      return {
        ...base,
        protocol: "vless",
        uuid: px.uuid,
        flow: px.flow,
        publicKey: px["reality-opts"]?.["public-key"],
        shortId: px["reality-opts"]?.["short-id"],
        fingerprint: px["client-fingerprint"],
      } as VpnNode;
    case "vmess":
      return { ...base, protocol: "vmess", uuid: px.uuid, alterId: px.alterId || 0, cipher: px.cipher } as any as VpnNode;
    case "trojan":
      return { ...base, protocol: "trojan", password: px.password } as VpnNode;
    case "ss":
      return { ...base, protocol: "ss", method: px.cipher, password: px.password } as VpnNode;
    case "hysteria2":
    case "hy2":
      return {
        ...base,
        protocol: "hysteria2",
        password: px.password || px.auth,
        sni: px.sni || px.servername,
        security: "tls",
        supportedByXray: false,
      } as VpnNode;
    default:
      return null;
  }
}
