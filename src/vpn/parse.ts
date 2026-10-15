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
  alpn?: string[];
  extra?: string;
  source?: "sub" | "wifi" | "lte";
  // hysteria2 (ссылки hy2://): obfs=salamander + пароль, pin сертификата
  obfs?: string;
  obfsPassword?: string;
  pinSha256?: string;
  // xhttp/splithttp: опции транспорта в JSON-форме Xray (SplitHTTPConfig).
  // Заполняется из Clash «xhttp-opts» и query-параметров vless-ссылок;
  // без них теряется path сервера (например /stream/v2/frames/) и ядро
  // стучится на «/» → туннель поднимается, но интернет не работает.
  xhttpOpts?: Record<string, any>;
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
      alpn: p.alpn ? p.alpn.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      extra: p.extra,
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
      // REALITY у trojan: без pbk/sid ядро падает с empty "password"
      publicKey: p.pbk,
      shortId: p.sid,
      spiderX: p.spx,
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
      // Xray-core v26.9.9 поддерживает hysteria2 нативно (протокол «hysteria»,
      // version 2) — см. buildOutbound в xrayConfig.ts. sing-box тоже умеет.
      supportedByXray: true,
      obfs: p.obfs,
      obfsPassword: p["obfs-password"] || p.obfspassword,
      pinSha256: p.pinsha256,
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
  // Отступ, на котором начинаются ЭЛЕМЕНТЫ списка proxies. Определяется по
  // первой seq-строке и дальше служит единственным признаком «новая нода».
  // Без этого вложенные списки ломают разбор (см. комментарий у isSeqEntry).
  let entryIndent = -1;

  /** Дописывает значение в массив по пути (создаёт массив при необходимости).
   *  Возвращает индекс добавленного элемента. */
  const appendToList = (path: string[], value: any): number => {
    let cur = current;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof cur[path[i]] !== "object" || cur[path[i]] === null) cur[path[i]] = {};
      cur = cur[path[i]];
    }
    const last = path[path.length - 1];
    if (!Array.isArray(cur[last])) cur[last] = [];
    cur[last].push(value);
    return cur[last].length - 1;
  };

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
    const leftTrim = line.slice(indent);
    // seq-строка: «- value» или «-» (элемент списка YAML)
    const dashMatch = /^-(?:\s+(.*))?$/.exec(leftTrim);
    const isSeqEntry = dashMatch !== null;

    // Remnawave v3 (и re-dump бэкенда через yaml.dump) отдаёт элементы списка
    // proxies БЕЗ отступа: «- name:» стоит в колонке 0, на одном уровне с самим
    // `proxies:`. Прерываемся только на реальном деденте (< baseIndent) или на
    // соседнем ключе того же уровня (=== baseIndent, не элемент списка).
    if (indent < baseIndent) break;
    if (indent === baseIndent && !isSeqEntry) break;

    if (isSeqEntry) {
      // Отступ элементов списка proxies фиксируется по ПЕРВОЙ seq-строке.
      // PyYAML печатает ВЛОЖЕННЫЕ списки (alpn, заголовки) на том же уровне,
      // что и их ключ: «  alpn:\n  - h2». Такие строки имеют indent > entryIndent
      // и НЕ должны открывать новую ноду — иначе разбор обрывается на alpn и
      // все поля после него (xhttp-opts.path и т.п.) теряются.
      if (entryIndent === -1) entryIndent = indent;

      if (indent === entryIndent) {
        // Новая нода списка proxies.
        current = {};
        result.push(current);
        stack.length = 0;
        const rest = (dashMatch![1] || "").trim();
        if (rest) {
          // «- name: X» — поле ноды; отступ subsequent-полей = dashIdx + 2
          const dashIdx = line.indexOf("- ");
          applyField(rest, dashIdx + 2);
        }
      } else if (current) {
        // Элемент вложенного списка: дописываем в массив текущего ключа.
        // ВЛОЖЕННЫЕ элементы в формате PyYAML стоят на ТОМ ЖЕ отступе, что и
        // их ключ («  alpn:\n  - h2»), поэтому выбрасываем из стека только
        // ключи с отступом БОЛЬШЕ текущего — родительский ключ остаётся.
        while (stack.length > 0 && stack[stack.length - 1].indent > indent) stack.pop();
        const parentPath = stack.length > 0 ? stack[stack.length - 1].path : [];
        const content = (dashMatch![1] || "").trim();
        const kv = /^([^:]+):\s?(.*)$/.exec(content);
        if (kv && /^[\w.-]+:/.test(content)) {
          // элемент-объект «key: value» (редко в proxies) — кладём как {key: value}
          const obj: Record<string, any> = {};
          obj[kv[1].trim()] = yamlValue(kv[2].trim());
          appendToList(parentPath, obj);
        } else {
          appendToList(parentPath, yamlValue(content));
        }
      }
    } else if (current) {
      applyField(leftTrim, indent);
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
  const realityPk = ob.tls?.reality?.public_key;
  const tls = ob.tls?.enabled ? (realityPk ? "reality" : "tls") : "reality_enabled" in ob ? "tls" : "";
  const base = {
    id: `${type}-${address}-${port}`,
    name: String(ob.tag || type),
    address,
    port,
    security: tls || undefined,
    sni: ob.tls?.server_name,
    network: String(ob.transport?.type || "tcp"),
    path: ob.transport?.path,
    host: ob.transport?.headers?.Host?.[0],
    supportedByXray: true,
    raw: "",
  };
  switch (type) {
    case "vless":
      return { ...base, protocol: "vless", uuid: ob.uuid, flow: ob.flow, publicKey: realityPk, shortId: ob.tls?.reality?.short_id } as VpnNode;
    case "vmess":
      return { ...base, protocol: "vmess", uuid: ob.uuid, alterId: ob.alter_id || 0 } as VpnNode;
    case "trojan":
      // REALITY у trojan: без publicKey ядро падает с empty "password"
      return { ...base, protocol: "trojan", password: ob.password, publicKey: realityPk, shortId: ob.tls?.reality?.short_id } as VpnNode;
    case "shadowsocks":
      return { ...base, protocol: "ss", method: ob.method, password: ob.password } as VpnNode;
    default:
      return null;
  }
}

/** Clash «xhttp-opts»/«splithttp-opts» (kebab-case, формат mihomo) → поля
 *  Xray SplitHTTPConfig (camelCase). Таблица явная: авто-camelCase ломает
 *  имена с аббревиатурами (sessionIDPlacement, uplinkHTTPMethod, noGRPCHeader).
 *  «reuse-settings» в Clash = «xmux» в Xray. */
const XHTTP_FIELD_MAP: Record<string, string> = {
  path: "path",
  host: "host",
  mode: "mode",
  headers: "headers",
  "x-padding-bytes": "xPaddingBytes",
  "x-padding-obfs-mode": "xPaddingObfsMode",
  "x-padding-key": "xPaddingKey",
  "x-padding-header": "xPaddingHeader",
  "x-padding-placement": "xPaddingPlacement",
  "x-padding-method": "xPaddingMethod",
  "uplink-http-method": "uplinkHTTPMethod",
  "session-id-placement": "sessionIDPlacement",
  "session-id-key": "sessionIDKey",
  "session-id-table": "sessionIDTable",
  "session-id-length": "sessionIDLength",
  "seq-placement": "seqPlacement",
  "seq-key": "seqKey",
  "uplink-data-placement": "uplinkDataPlacement",
  "uplink-data-key": "uplinkDataKey",
  "uplink-chunk-size": "uplinkChunkSize",
  "no-grpc-header": "noGRPCHeader",
  "no-sse-header": "noSSEHeader",
  "sc-max-each-post-bytes": "scMaxEachPostBytes",
  "sc-min-posts-interval-ms": "scMinPostsIntervalMs",
  "sc-max-buffered-posts": "scMaxBufferedPosts",
  "sc-stream-up-server-secs": "scStreamUpServerSecs",
  "server-max-header-bytes": "serverMaxHeaderBytes",
  extra: "extra",
};

const XMUX_FIELD_MAP: Record<string, string> = {
  "max-concurrency": "maxConcurrency",
  "max-connections": "maxConnections",
  "c-max-reuse-times": "cMaxReuseTimes",
  "h-max-request-times": "hMaxRequestTimes",
  "h-max-reusable-secs": "hMaxReusableSecs",
  "h-keep-alive-period": "hKeepAlivePeriod",
};

/** Приводит Clash-опции xhttp к JSON-форме Xray. Пустые значения не
 *  переносятся — ядро подставит свои дефолты (например X-Data для header). */
export function clashXhttpOptsToXray(opts: any): Record<string, any> | null {
  if (!opts || typeof opts !== "object") return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "reuse-settings" || k === "xmux") {
      const xmux: Record<string, any> = {};
      for (const [mk, mv] of Object.entries((v || {}) as Record<string, any>)) {
        const mapped = XMUX_FIELD_MAP[mk] || mk;
        if (mv === undefined || mv === null || mv === "") continue;
        xmux[mapped] = mv;
      }
      if (Object.keys(xmux).length) out.xmux = xmux;
      continue;
    }
    if (k === "download-settings" || k === "downloadSettings") {
      out.downloadSettings = v;
      continue;
    }
    const mapped = XHTTP_FIELD_MAP[k];
    if (mapped) out[mapped] = v;
    else if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k)) {
      // неизвестное kebab-поле — переводим в camelCase (best effort)
      const camel = k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      out[camel] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

// Clash.Meta proxy → VpnNode
export function clashProxyToNode(px: any): VpnNode | null {
  const type = String(px.type || "").toLowerCase();
  const address = String(px.server || "");
  const port = parseInt(String(px.port || 0), 10);
  if (!address || !port) return null;
  const wsOpts = px["ws-opts"] || {};
  const httpOpts = px["http-opts"] || {};
  const h2Opts = px["h2-opts"] || {};
  const first = (v: any) => Array.isArray(v) ? v[0] : v;
  const grpcOpts = px["grpc-opts"] || {};
  const realityOpts = px["reality-opts"] || {};
  const hasReality = Boolean(realityOpts["public-key"]);
  const network = String(px.network || (grpcOpts["grpc-service-name"] ? "grpc" : "tcp")).toLowerCase();
  // xhttp (mihomo: xhttp-opts) / splithttp (splithttp-opts): path/host/mode
  // лежат в СВОЁМ блоке — без них Xray стучится на «/» вместо реального
  // пути сервера: TLS поднимается («подключено»), но интернет не работает.
  const xhttpOpts =
    network === "xhttp" || network === "splithttp"
      ? clashXhttpOptsToXray(px["xhttp-opts"] || px["splithttp-opts"] || null)
      : null;
  const base = {
    id: `${type}-${address}-${port}`,
    name: String(px.name || type),
    address,
    port,
    network: network === "ws" && wsOpts["v2ray-http-upgrade"] ? "httpupgrade" : network,
    alpn: Array.isArray(px.alpn) ? px.alpn.map(String) : undefined,
    sni: px.servername || px.sni,
    security: hasReality ? "reality" : px.tls ? "tls" : undefined,
    path: xhttpOpts?.path || (network === "h2" ? h2Opts.path : network === "http" ? first(httpOpts.path) : wsOpts.path),
    host: xhttpOpts?.host || (network === "h2" ? first(h2Opts.host) : network === "http" ? first(httpOpts.headers?.Host) : first(wsOpts.headers?.Host)),
    mode: xhttpOpts?.mode ? String(xhttpOpts.mode) : undefined,
    fingerprint: px["client-fingerprint"],
    xhttpOpts: xhttpOpts || undefined,
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
        publicKey: realityOpts["public-key"],
        shortId: realityOpts["short-id"],
        fingerprint: px["client-fingerprint"],
      } as VpnNode;
    case "vmess":
      return { ...base, protocol: "vmess", uuid: px.uuid, alterId: px.alterId || 0, encryption: px.cipher } as any as VpnNode;
    case "trojan":
      // REALITY у trojan: без publicKey ядро падает с empty "password"
      return {
        ...base,
        protocol: "trojan",
        password: px.password,
        publicKey: realityOpts["public-key"],
        shortId: realityOpts["short-id"],
        fingerprint: px["client-fingerprint"],
      } as VpnNode;
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
        // Xray v26.9.9 поддерживает hysteria2 нативно (протокол «hysteria»,
        // version 2) — см. buildOutbound в xrayConfig.ts.
        supportedByXray: true,
        // Salamander-obfs: mihomo отдаёт строкой + obfs-password, sing-box — объектом
        obfs: typeof px.obfs === "string" ? px.obfs : px.obfs?.type,
        obfsPassword:
          px["obfs-password"] || (typeof px.obfs === "object" ? px.obfs?.password : undefined),
      } as VpnNode;
    default:
      return null;
  }
}
