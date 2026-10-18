/** Популярные публичные DNS-серверы — выбор в настройках (преимущество спонсоров).
 *  Для Xray используем DoH-адреса (шифрование запросов), для sing-box — обычные UDP-адреса. */

export type DnsProvider = {
  id: string;
  name: string;
  /** Короткое описание преимуществ */
  benefit: string;
  /** DoH-адрес для Xray (или обычный адрес) */
  xray: string[];
  /** DNS values used by sing-box; Xray uses the xray list. */
  singbox: string[];
};

export const DNS_PROVIDERS: DnsProvider[] = [
  {
    id: "auto",
    name: "Автоматически",
    benefit: "Google + Cloudflare одновременно — максимальная надёжность",
    xray: ["https://dns.google/dns-query", "https://cloudflare-dns.com/dns-query", "8.8.8.8"],
    singbox: ["8.8.8.8", "1.1.1.1"],
  },
  {
    id: "google",
    name: "Google DNS",
    benefit: "Самый доступный в мире: максимальная скорость и совместимость",
    xray: ["https://dns.google/dns-query", "8.8.4.4"],
    singbox: ["8.8.8.8", "8.8.4.4"],
  },
  {
    id: "cloudflare",
    name: "Cloudflare 1.1.1.1",
    benefit: "Один из самых быстрых резолверов; не сохраняет ваш IP-адрес",
    xray: ["https://cloudflare-dns.com/dns-query", "1.0.0.1"],
    singbox: ["1.1.1.1", "1.0.0.1"],
  },
  {
    id: "adguard",
    name: "AdGuard DNS",
    benefit: "Блокирует рекламу и трекеры прямо на уровне DNS — без приложений",
    xray: ["https://dns.adguard-dns.com/dns-query", "94.140.14.14"],
    singbox: ["94.140.14.14", "94.140.15.15"],
  },
  {
    id: "quad9",
    name: "Quad9",
    benefit: "Блокирует вредоносные и фишинговые сайты; некоммерческий, защита приватности",
    xray: ["https://dns.quad9.net/dns-query", "9.9.9.9"],
    singbox: ["9.9.9.9", "149.112.112.112"],
  },
  {
    id: "opendns",
    name: "OpenDNS (Cisco)",
    benefit: "Фильтрация контента и защита от фишинга от Cisco; проверен временем",
    xray: ["208.67.222.222", "208.67.220.220"],
    singbox: ["208.67.222.222", "208.67.220.220"],
  },
  {
    id: "cleanbrowsing",
    name: "CleanBrowsing Family",
    benefit: "Семейный фильтр: блокирует контент для взрослых и вредоносные сайты",
    xray: ["https://doh.cleanbrowsing.org/doh/family-filter", "185.228.168.168"],
    singbox: ["185.228.168.168", "185.228.169.168"],
  },
  {
    id: "yandex",
    name: "Яндекс (Безопасный)",
    benefit: "Российский резолвер: низкая задержка в РФ, блокировка вредоносных сайтов",
    xray: ["77.88.8.7", "77.88.8.3"],
    singbox: ["77.88.8.7", "77.88.8.3"],
  },
];

export function getDnsProvider(id: string | null | undefined): DnsProvider {
  const found = DNS_PROVIDERS.find((p) => p.id === id);
  return found || DNS_PROVIDERS[0];
}
