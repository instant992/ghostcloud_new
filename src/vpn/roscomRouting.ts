/** Роутинг RoscomVPN (перенос правил из github.com/hydraponique/roscomvpn-routing,
 *  профили HAPP DEFAULT / WHITELIST).
 *
 *  DEFAULT  — для обычных серверов: RU/BY-сервисы и игры напрямую,
 *             YouTube/Telegram/GitHub/Google Play через VPN,
 *             реклама, торренты и слежка Windows блокируются.
 *  WHITELIST — для LTE Open: напрямую только белые списки РФ,
 *             всё остальное через VPN.
 *
 *  geo-данные (geoip.dat/geosite.dat для Xray, rule-set .srs для sing-box,
 *  .mrs для mihomo) вшиты в APK и распаковываются нативно (GeoAssets.kt). */

export type RoscomMode = "default" | "whitelist";

/** Напрямую (DEFAULT): приватные сети, RU-сервисы, белые списки РФ, игры */
const DIRECT_SITES_DEFAULT = [
  "private",
  "category-ru",
  "whitelist",
  "microsoft",
  "apple",
  "epicgames",
  "riot",
  "escapefromtarkov",
  "steam",
  "twitch",
  "pinterest",
  "faceit",
];

/** Напрямую (WHITELIST): только приватные сети и белые списки РФ */
const DIRECT_SITES_WHITELIST = ["private", "whitelist"];

/** IP-диапазоны напрямую (категории geoip RoscomVPN) */
const DIRECT_IP_DEFAULT = ["private", "direct"];
const DIRECT_IP_WHITELIST = ["private", "whitelist"];

/** Через VPN (DEFAULT): разблокировка */
const PROXY_SITES = ["google-play", "github", "twitch-ads", "youtube", "telegram"];

/** Блокировать: слежка Windows, торренты, реклама */
const BLOCK_SITES = ["win-spy", "torrent", "category-ads"];

function directSites(mode: RoscomMode): string[] {
  return mode === "default" ? DIRECT_SITES_DEFAULT : DIRECT_SITES_WHITELIST;
}

function directIp(mode: RoscomMode): string[] {
  return mode === "default" ? DIRECT_IP_DEFAULT : DIRECT_IP_WHITELIST;
}

/** Правила для Xray (geosite:/geoip: резолвятся из xray-geo каталога).
 *  Порядок как RouteOrder=block-proxy-direct в HAPP-конфиге. */
export function xrayRoscomRules(mode: RoscomMode): Record<string, any>[] {
  const rules: Record<string, any>[] = [
    {
      type: "field",
      domain: BLOCK_SITES.map((c) => `geosite:${c}`),
      outboundTag: "block",
    },
  ];
  if (mode === "default") {
    rules.push({
      type: "field",
      domain: PROXY_SITES.map((c) => `geosite:${c}`),
      outboundTag: "proxy",
    });
  }
  rules.push(
    {
      type: "field",
      domain: directSites(mode).map((c) => `geosite:${c}`),
      outboundTag: "direct",
    },
    {
      type: "field",
      ip: directIp(mode).map((c) => `geoip:${c}`),
      outboundTag: "direct",
    }
  );
  return rules;
}

/** Rule-set'ы и правила для sing-box (.srs лежат в rule-set/ домашней папки ядра).
 *  Формат binary определяется автоматически по расширению .srs. */
export function singboxRoscom(mode: RoscomMode): {
  ruleSets: Record<string, any>[];
  rules: Record<string, any>[];
} {
  const ruleSets: Record<string, any>[] = [];
  const addGeosite = (c: string) =>
    ruleSets.push({
      type: "local",
      tag: `geosite-${c}`,
      path: `rule-set/geosite-${c}.srs`,
    });
  const addGeoip = (c: string) =>
    ruleSets.push({
      type: "local",
      tag: `ip-${c}`,
      path: `rule-set/ip-${c}.srs`,
    });

  BLOCK_SITES.forEach(addGeosite);
  const proxySites = mode === "default" ? PROXY_SITES : [];
  proxySites.forEach(addGeosite);
  directSites(mode).forEach(addGeosite);
  directIp(mode).forEach(addGeoip);

  const rules: Record<string, any>[] = [
    { rule_set: BLOCK_SITES.map((c) => `geosite-${c}`), outbound: "block" },
  ];
  if (proxySites.length) {
    rules.push({ rule_set: proxySites.map((c) => `geosite-${c}`), outbound: "proxy" });
  }
  rules.push(
    { rule_set: directSites(mode).map((c) => `geosite-${c}`), outbound: "direct" },
    { rule_set: directIp(mode).map((c) => `ip-${c}`), outbound: "direct" }
  );
  return { ruleSets, rules };
}

/** Rule-providers и правила для mihomo (.mrs лежат в rule-set/ домашней папки ядра) */
export function mihomoRoscom(mode: RoscomMode): {
  providers: Record<string, any>;
  rules: string[];
} {
  const providers: Record<string, any> = {};
  const rules: string[] = [];
  const addDomain = (c: string) => {
    providers[`geosite-${c}`] = {
      type: "file",
      behavior: "domain",
      format: "mrs",
      path: `rule-set/geosite-${c}.mrs`,
    };
  };
  const addIp = (c: string) => {
    providers[`ip-${c}`] = {
      type: "file",
      behavior: "ipcidr",
      format: "mrs",
      path: `rule-set/ip-${c}.mrs`,
    };
  };

  BLOCK_SITES.forEach(addDomain);
  rules.push(...BLOCK_SITES.map((c) => `RULE-SET,geosite-${c},REJECT`));
  if (mode === "default") {
    PROXY_SITES.forEach(addDomain);
    rules.push(...PROXY_SITES.map((c) => `RULE-SET,geosite-${c},PROXY`));
  }
  directSites(mode).forEach(addDomain);
  rules.push(...directSites(mode).map((c) => `RULE-SET,geosite-${c},DIRECT`));
  directIp(mode).forEach(addIp);
  rules.push(...directIp(mode).map((c) => `RULE-SET,ip-${c},DIRECT`));

  return { providers, rules };
}
