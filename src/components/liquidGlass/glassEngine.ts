import { getSetting, setSetting } from "../../settings";

/**
 * Движок рендера стеклянных поверхностей темы Liquid Glass.
 *
 * - `skia` — текущий порт каталога Backdrop (RN Skia, offscreen-снимки).
 *   Работает везде, статика дешёвая, но пересчёт при движении дорогой.
 * - `agsl` — react-native-liquid-glassmorphism (нативный Fabric-компонент,
 *   AGSL-шейдер на GPU каждый кадр): настоящее преломление/дисперсия/блик,
 *   низкая нагрузка на JS-поток. Android 13+ (API 33) — полная линза,
 *   API 31–32 — blur+tint, ниже — tint. На iOS 26 — нативный UIGlassEffect.
 *
 * Переключается в Glass Playground («Движок стекла»), хранится в
 * gc_settings ключом `glass_engine`. Диспетчеризация — в GlassCard и
 * LiquidBottomTabs: старый путь остаётся полностью рабочим.
 */
export type GlassEngineId = "skia" | "agsl";

const KEY = "***";

function isEngineId(v: unknown): v is GlassEngineId {
  return v === "skia" || v === "agsl";
}

let engineId: GlassEngineId = (() => {
  const raw = getSetting(KEY, "agsl");
  return isEngineId(raw) ? raw : "agsl";
})();

const listeners = new Set<() => void>();

export const glassEngine = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get(): GlassEngineId {
    return engineId;
  },
  set(id: GlassEngineId) {
    if (!isEngineId(id) || id === engineId) return;
    engineId = id;
    try {
      setSetting(KEY, id);
    } catch {}
    for (const l of listeners) l();
  },
};

/** Хук-обёртка для useSyncExternalStore (стабильная ссылка на get). */
export function subscribeGlassEngine(cb: () => void) {
  return glassEngine.subscribe(cb);
}
export function getGlassEngineSnapshot(): GlassEngineId {
  return glassEngine.get();
}
