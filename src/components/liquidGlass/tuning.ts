import { getSetting, setSetting } from "../../settings";

/**
 * Настройка стеклянных эффектов темы Liquid Glass — ТРИ ГОТОВЫХ ПРЕСЕТА.
 *
 * Значения — множители/замены к пресетам GLASS_PRESETS; применяются внутри
 * LiquidGlassSurface ко ВСЕМ стеклянным поверхностям темы glass.
 * Хранится имя пресета в gc_settings ключом `glass_preset`, живёт между
 * перезаходами. Дефолт `catalog` = точные параметры каталога Backdrop.
 */
export interface GlassTuning {
  /** Множитель радиуса скругления. */
  radius: number;
  /** Множитель blur: 0 = чистая линза без матовости. */
  blur: number;
  /** Насыщенность vibrancy (каталог = 1.5). */
  saturation: number;
  /** Множитель высоты преломления lens. */
  refractionHeight: number;
  /** Множитель силы преломления lens. */
  refractionAmount: number;
  /** Хроматическая аберрация 0..1 (вкл при >0.5). */
  aberration: number;
  /** Множитель альфы блика по краю. */
  highlight: number;
  /** Множитель альфы тени. */
  shadow: number;
  /** Подложка-вуаль 0..0.5 (белая в светлой / чёрная в тёмной теме). */
  veil: number;
}

export type GlassPresetId = "catalog" | "frosted" | "crystal";

export interface GlassPresetDef {
  id: GlassPresetId;
  /** Название в настройках. */
  label: string;
  /** Короткое описание под названием. */
  sub: string;
  /** Иконка Ionicons для плитки выбора. */
  icon: string;
  tuning: GlassTuning;
}

/** 1. «Каталог» — точные параметры Backdrop (Kyant0/AndroidLiquidGlass):
 *   vibrancy 1.5, lens как в ScrollContainer/LiquidButton, без вуали. */
const CATALOG: GlassTuning = {
  radius: 1,
  blur: 1,
  saturation: 1.5,
  refractionHeight: 1,
  refractionAmount: 1,
  aberration: 0,
  highlight: 1,
  shadow: 1,
  veil: 0,
};

/** 2. «Матовое» — плотное размытие, мягкое преломление, лёгкая вуаль:
 *   контент за блоком читается силуэтом, стекло спокойнее и мягче. */
const FROSTED: GlassTuning = {
  radius: 0.9,
  blur: 2.4,
  saturation: 1.25,
  refractionHeight: 0.6,
  refractionAmount: 0.7,
  aberration: 0,
  highlight: 0.9,
  shadow: 1.2,
  veil: 0.1,
};

/** 3. «Кристалл» — чистая линза БЕЗ blur: сильное преломление с радужной
 *   дисперсией по краю и ярким бликом, блоки выглядят как толстое стекло. */
const CRYSTAL: GlassTuning = {
  radius: 1.15,
  blur: 0,
  saturation: 1.75,
  refractionHeight: 1.6,
  refractionAmount: 1.8,
  aberration: 1,
  highlight: 1.4,
  shadow: 0.8,
  veil: 0,
};

export const GLASS_PRESET_LIST: GlassPresetDef[] = [
  {
    id: "catalog",
    label: "Каталог",
    sub: "Как в референсе: чистое стекло с мягким преломлением",
    icon: "sparkles",
    tuning: CATALOG,
  },
  {
    id: "frosted",
    label: "Матовое",
    sub: "Плотное размытие, фон читается силуэтом",
    icon: "cloud-outline",
    tuning: FROSTED,
  },
  {
    id: "crystal",
    label: "Кристалл",
    sub: "Без размытия: сильная линза и радужные края",
    icon: "diamond-outline",
    tuning: CRYSTAL,
  },
];

export const GLASS_TUNING_DEFAULTS: GlassTuning = CATALOG;

const KEY = "glass_preset";
/** Ключ JSON-переопределений (индивидуальный тюнинг ползунками). */
const TUNE_KEY = "glass_tuning";

export function isGlassPresetId(v: unknown): v is GlassPresetId {
  return v === "catalog" || v === "frosted" || v === "crystal";
}

export function tuningFor(id: GlassPresetId): GlassTuning {
  return GLASS_PRESET_LIST.find((p) => p.id === id)?.tuning ?? CATALOG;
}

/** Нормализация сохранённого JSON: берём только числовые поля, остальные —
 *  из базы пресета (защита от битых/устаревших данных). */
function sanitize(base: GlassTuning, raw: string | null): GlassTuning {
  if (!raw) return { ...base };
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return { ...base };
    const out: GlassTuning = { ...base };
    (Object.keys(out) as Array<keyof GlassTuning>).forEach((k) => {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        out[k] = Math.max(0, Math.min(k === "saturation" ? 3 : 4, v));
      }
    });
    return out;
  } catch {
    return { ...base };
  }
}

let presetId: GlassPresetId = (() => {
  const raw = getSetting(KEY, "catalog");
  return isGlassPresetId(raw) ? raw : "catalog";
})();
let snapshot: GlassTuning = sanitize(tuningFor(presetId), getSetting(TUNE_KEY, ""));
const listeners = new Set<() => void>();

function emit() {
  snapshot = { ...snapshot };
  for (const l of listeners) l();
}

function persist() {
  try {
    setSetting(KEY, presetId);
    setSetting(TUNE_KEY, JSON.stringify(snapshot));
  } catch {}
}

export const glassTuning = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): GlassTuning {
    return snapshot;
  },
  /** Идентификатор активного пресета (для выделения в UI). */
  getPreset(): GlassPresetId {
    return presetId;
  },
  /** Переключение пресета + сохранение. */
  setPreset(id: GlassPresetId) {
    if (!isGlassPresetId(id)) return;
    presetId = id;
    snapshot = { ...tuningFor(id) };
    persist();
    emit();
  },
  /** Индивидуальная правка параметров (ползунки Glass Playground). */
  set(next: GlassTuning) {
    snapshot = { ...CATALOG, ...next };
    persist();
    emit();
  },
  reset() {
    this.setPreset("catalog");
  },
};
