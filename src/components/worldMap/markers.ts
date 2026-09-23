import { splitNameFlag, countryFromFlag, countryFromName } from "../../theme";
import { COUNTRY_GEO } from "./geo";
import type { MapMarker } from "./WorldMap";
import type { VpnNode } from "../../vpn/parse";

/** Маркеры стран на карте по списку узлов: страна берётся из ФЛАГА — первого
 *  символа имени сервера (🇸🇪 Швеция | HY2). Фолбэк — поиск по тексту имени
 *  (для имён без флага). «Лучший сервер» (⚡, флаг отсутствует) исключается из
 *  текстового цикла — иначе «сервер» матчится по «се» и узел приписывается
 *  Швеции; его страна резолвится по IP отдельно (resolveNodeCountry).
 *  Общий код основной темы (HomeScreen) и Android TV (TvHomeScreen). */
export function buildMapMarkers(nodes: VpnNode[]): MapMarker[] {
  const byCountry = new Map<string, MapMarker>();
  for (const n of nodes) {
    if (/лучш/i.test(n.name)) continue;
    // LTE-узлы тоже участвуют: «🇷🇺 Белый интернет» — единственные
    // российские серверы в подписке, без них Россия не появляется на карте
    // и у выбранного LTE-сервера нет флага/подписи страны.
    const info = splitNameFlag(n.name);
    const c = countryFromFlag(info.flag) || countryFromName(info.name);
    if (!c) continue;
    const geo = COUNTRY_GEO[c.name];
    if (!geo) continue;
    const existing = byCountry.get(c.name);
    if (existing) {
      if (!existing.nodeIds.includes(n.id)) existing.nodeIds.push(n.id);
    } else {
      byCountry.set(c.name, {
        country: c.name,
        flag: c.flag,
        city: geo.city,
        x: geo.x,
        y: geo.y,
        lm: geo.lm,
        nodeIds: [n.id],
      });
    }
  }
  // Обычные серверы — первыми: тап по маркеру страны выбирает обычный узел,
  // LTE — только если обычных узлов страны нет (Россия).
  for (const m of byCountry.values()) {
    m.nodeIds.sort((a, b) => Number(a.startsWith("lte-")) - Number(b.startsWith("lte-")));
  }
  return [...byCountry.values()];
}
