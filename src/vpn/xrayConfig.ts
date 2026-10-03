import { VpnNode } from "./parse";
import { getDnsProvider, type DnsProvider } from "./dns";
import { getAntiDpi } from "../settings";
import { xrayRoscomRules, type RoscomMode } from "./roscomRouting";
import { accessLogPath, errorLogPath } from "./native";

/** Маскировка трафика (анти-DPI) средствами finalmask ядра Xray.
 *  Fragment «tlshello» режет TLS ClientHello на несколько TCP-пакетов со
 *  случайными размерами/задержками — DPI-системы (ТСПУ), блокирующие по
 *  целостному ClientHello с запрещённым SNI, перестают его распознавать.
 *  Это ЧИСТО КЛИЕНТСКАЯ маскировка: содержимое TCP-потока не меняется,
 *  сервер собирает его обратно — правки серверных конфигов не нужны.
 *  Применяется только к TLS/REALITY-транспортам (без TLS маскировать нечего). */
function antiDpiFinalMask(): Record<string, any> | null {
  if (!getAntiDpi()) return null;
  return {
    tcp: [
      {
        type: "fragment",
        settings: {
          // ФОРМАТ под встроенный libXray 26.3.27: сингулярные length/delay
          // строкой-диапазоном. Новая форма массивами (lengths/delays) в этой
          // версии падает с «LengthMin can't be 0» — проверено бинарником 26.3.27.
          packets: "tlshello",
          length: "64-256",
          delay: "1-8",
          maxSplit: "4",
        },
      },
    ],
  };
}

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
    // Маскировка трафика (анти-DPI) — только поверх TLS/REALITY и TCP-транспортов
    // (для kcp/UDP фрагментация TCP-рукопожатия неприменима)
    const fm = network === "kcp" ? null : antiDpiFinalMask();
    if (fm) stream.finalmask = fm;
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
      // xhttp-ноды из Clash несут настройки в xhttp-opts (path, host, mode,
      // uplink-*, x-padding-*, xmux...). Потерянный path — главная причина
      // «подключается, но интернет не работает»: ядро стучится на «/».
      // node.xhttpOpts уже приведён к JSON-форме Xray (clashXhttpOptsToXray).
      const settings: Record<string, any> = { ...(node.xhttpOpts || {}) };
      // host/path/mode: поля ноды приоритетны (могли прийти из vless-ссылок),
      // иначе значения из xhttpOpts, иначе дефолты.
      settings.host = node.host || node.sni || settings.host || "";
      settings.path = node.path || settings.path || "/";
      settings.mode = node.mode || settings.mode || (node.typeParam === "splithttp" ? "packet-up" : "auto");
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
    case "hysteria2": {
      // Xray-core v26.9.9 поддерживает hysteria2 нативно — протокол/транспорт
      // «hysteria» с обязательным version:2 (QUIC). Форма подтверждена по
      // upstream infra/conf/hysteria.go (HysteriaClientConfig{version,address,port})
      // и transport_method.go (HysteriaConfig{version,auth,...}).
      // Generic buildStreamSettings не годится (hysteria2 — QUIC, не tcp),
      // поэтому собираем streamSettings отдельно.
      const hyStream: Record<string, any> = {
        network: "hysteria",
        security: "tls",
        tlsSettings: {
          serverName: node.sni || node.address,
          // allowInsecure в этой версии Xray удалён (бросает RemovedFeatureError) —
          // наши серверы имеют валидные сертификаты на реальные SNI.
          fingerprint: node.fingerprint || "chrome",
          alpn: node.alpn,
        },
        hysteriaSettings: {
          version: 2,
          auth: node.password || node.uuid || "",
        },
      };
      // Salamander-obfs (если задан в ссылке) — через udpmask finalmask.
      if (node.obfs && node.obfsPassword) {
        hyStream.finalmask = {
          udp: [{ type: "salamander", settings: { password: node.obfsPassword } }],
        };
      }
      return {
        tag: "proxy",
        protocol: "hysteria",
        settings: {
          version: 2,
          address: node.address,
          port: node.port,
        },
        streamSettings: hyStream,
      };
    }
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
  bypassDomains: string[] = [],
  roscomMode?: RoscomMode | null
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
    // Журнал запросов (экран «Запросы»): access-лог ядра в filesDir.
    // loglevel error — в access попадают соединения, а не отладка ядра.
    log: (() => {
      const access = accessLogPath();
      const error = errorLogPath();
      return {
        loglevel: "error",
        ...(access ? { access } : {}),
        ...(error ? { error } : {}),
      };
    })(),
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
        // RoscomVPN-роутинг (гео-категории из geoip.dat/geosite.dat в APK)
        ...(roscomMode ? xrayRoscomRules(roscomMode) : []),
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
