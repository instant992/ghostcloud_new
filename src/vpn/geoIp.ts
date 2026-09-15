/** Определение страны сервера по его IP-адресу.
 *
 *  Нужно для узлов без флага в имени — прежде всего «🚀 Лучший сервер»
 *  (агрегатор): его фактический адрес в подписке есть, а страны в имени нет.
 *
 *  Цепочка: адрес (домен или IP) → DNS-over-HTTPS (dns.google / cloudflare)
 *  → geo-IP API (ipwho.is, без ключа) → ISO-код страны → русское имя + флаг.
 *  Результат кэшируется в памяти процесса (адреса серверов стабильны).
 *
 *  Все внешние вызовы с таймаутом и глотают ошибки: определение страны —
 *  косметика, оно не должно ни ломать UI, ни вешать загрузку. */

/** ISO 3166-1 alpha-2 → каноническое русское имя (совпадает с ключами
 *  COUNTRY_GEO на карте, чтобы маркер находился). Покрыты все страны карты. */
const ISO_TO_RU: Record<string, string> = {
  NL: "Нидерланды", DE: "Германия", FI: "Финляндия", SE: "Швеция",
  FR: "Франция", US: "США", GB: "Великобритания", TR: "Турция",
  JP: "Япония", KZ: "Казахстан", RU: "Россия", PL: "Польша",
  AT: "Австрия", CH: "Швейцария", NO: "Норвегия", HK: "Гонконг",
  SG: "Сингапур", EE: "Эстония", IT: "Италия", BR: "Бразилия",
  ES: "Испания", CA: "Канада",
};

/** Эмодзи-флаг из ISO-кода: каждый символ → regional indicator (🇪 + 🇪 = 🇪🇪). */
function flagFromIso(iso: string): string {
  const up = (iso || "").toUpperCase();
  if (up.length !== 2 || !/^[A-Z]{2}$/.test(up)) return "🌍";
  return (
    String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65) +
    String.fromCodePoint(0x1f1e6 + up.charCodeAt(1) - 65)
  );
}

const cache = new Map<string, { name: string; flag: string } | null>();

function withTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal as any }).finally(() => clearTimeout(t));
}

/** Домен → IPv4 через DoH. Если передан уже IP — возвращает его. */
async function resolveIp(host: string): Promise<string | null> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  const providers = [
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,
  ];
  for (const url of providers) {
    try {
      const r = await withTimeout(url, 6000);
      if (!r.ok) continue;
      const d: any = await r.json();
      const answers = Array.isArray(d?.Answer) ? d.Answer : [];
      const a = answers.find((x: any) => x?.type === 1 && typeof x?.data === "string");
      if (a) return String(a.data);
    } catch {}
  }
  return null;
}

/** Страна узла по его адресу (домен или IP). null — если определить не удалось. */
export async function resolveNodeCountry(address: string): Promise<{ name: string; flag: string } | null> {
  const key = (address || "").trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) || null;

  let result: { name: string; flag: string } | null = null;
  try {
    const ip = await resolveIp(key);
    if (ip) {
      const r = await withTimeout(`https://ipwho.is/${ip}`, 6000);
      if (r.ok) {
        const d: any = await r.json();
        if (d?.success !== false) {
          const iso = String(d.country_code || "").toUpperCase();
          const ru = ISO_TO_RU[iso];
          if (ru) result = { name: ru, flag: flagFromIso(iso) };
        }
      }
    }
  } catch {}

  cache.set(key, result);
  return result;
}
