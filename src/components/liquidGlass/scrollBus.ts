/**
 * Шина «скролл остановился» для стеклянных поверхностей темы Liquid Glass.
 *
 * LiquidGlassSurface семплирует срез фона по своей ОКОННОЙ позиции, которую
 * измеряет при layout. При скролле карточки уезжают, а снимок стекла остаётся
 * со старым срезом — фон «за стеклом» расходится с реальным. Полноценный
 * backdrop-трекинг (пересчёт PNG на каждый кадр скролла) на offscreen-рендере
 * не вытягивается по производительности, поэтому используем стандартный для
 * псевдо-backdrop приём: пересчёт при ОСТАНОВКЕ скролла (onMomentumScrollEnd /
 * onScrollEndDrag без инерции). Во время движения стекло держит прежний срез —
 * фон темы гладкий, расхождение в движении незаметно.
 *
 * Внешний стор (subscribe/getSnapshot) — поверхности подписываются через
 * useSyncExternalStore и перезамеряются при смене версии.
 */
let version = 0;
const listeners = new Set<() => void>();

export const scrollBus = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): number {
    return version;
  },
  /** Скролл остановился — surfaces перезамеряют оконную позицию. */
  bump() {
    version++;
    for (const l of listeners) l();
  },
};

/** Готовые обработчики для ScrollView/FlatList со стеклянными поверхностями.
 *  Двойной bump (конец драга + конец инерции) безопасен: перезамер при
 *  неизменной позиции не меняет state и не пересчитывает снимки стекла. */
export const GLASS_SCROLL_HANDLERS = {
  onMomentumScrollEnd: () => scrollBus.bump(),
  onScrollEndDrag: () => scrollBus.bump(),
};
