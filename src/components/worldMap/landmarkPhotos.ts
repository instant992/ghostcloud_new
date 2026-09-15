/** Живые фото достопримечательностей (заменяют векторные LANDMARKS).
 *  Источник: Wikimedia Commons. ВСЕ снимки под CC0 / Public Domain —
 *  атрибуция не обязательна, но авторы зафиксированы в LANDMARK_CREDITS.
 *  Формат: JPEG 360×240, cover-crop, ~15 КБ/шт, суммарно ~181 КБ.
 *
 *  Хранятся в android/app/src/main/res/drawable-nodpi/lm_<key>.jpg и
 *  подключаются через source={{ uri: "lm_<key>" }} — тот же механизм, что
 *  у app_icon (require()-ассеты в этом проекте отдают 1×1 заглушку). */

export type LandmarkSource = { uri: string };

export const LANDMARK_PHOTOS: Record<string, LandmarkSource> = {
  eiffel: { uri: "lm_eiffel" },
  brandenburg: { uri: "lm_brandenburg" },
  windmill: { uri: "lm_windmill" },
  bigben: { uri: "lm_bigben" },
  colosseum: { uri: "lm_colosseum" },
  liberty: { uri: "lm_liberty" },
  crowns: { uri: "lm_crowns" },
  tallinn: { uri: "lm_tallinn" },
  mosque: { uri: "lm_mosque" },
  torii: { uri: "lm_torii" },
  christ: { uri: "lm_christ" },
  basil: { uri: "lm_basil" },
};

/** Авторство/лицензии (для внутренней отчётности и возможного экрана атрибуции).
 *  CC0/PD юридически не требуют указания автора, но мы его сохраняем. */
export const LANDMARK_CREDITS: Record<string, { license: string; source: string }> = {
  eiffel: { license: "CC0", source: "commons.wikimedia.org — Sous la Tour Eiffel 1" },
  brandenburg: { license: "CC0", source: "commons.wikimedia.org — Brandenburger Tor 2019" },
  windmill: { license: "CC0", source: "commons.wikimedia.org — Dutch windmill at Kinderdijk" },
  bigben: { license: "CC0", source: "commons.wikimedia.org — Big Ben from the London Eye 2" },
  colosseum: { license: "CC0", source: "commons.wikimedia.org — Colosseum Cross Rome Italy" },
  liberty: { license: "Public Domain", source: "commons.wikimedia.org — Statue of Liberty frontal 2" },
  crowns: { license: "Public Domain", source: "commons.wikimedia.org — Stockholm City Hall by sunset" },
  tallinn: { license: "CC0", source: "commons.wikimedia.org — Alexander Nevsky Cathedral, Tallinn" },
  mosque: { license: "CC0", source: "commons.wikimedia.org — Firuz Ağa Cami ve Sultanahmet Cami 2015" },
  torii: { license: "CC0", source: "commons.wikimedia.org — Fushimi Inari Torii" },
  christ: { license: "Public Domain", source: "commons.wikimedia.org — Corcovado, Rio de Janeiro" },
  basil: { license: "CC0", source: "commons.wikimedia.org — Saint Basil's Cathedral, Moscow" },
};
