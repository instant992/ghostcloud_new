import React, { createContext, useContext, useMemo } from "react";
import { Image as RNImage, View as RNView, useWindowDimensions, StyleSheet } from "react-native";
import { useTheme } from "../../theme";

/**
 * Контекст фона темы Liquid Glass.
 *
 * Прежняя Skia-реализация (императивный рендер градиента+блобов в offscreen
 * SkSurface → PNG data-URI) удалена вместе со всем Skia-движком темы. Теперь:
 *
 *  - фон темы — фотообои `drawable-nodpi/liquid_bg.jpg` (пользовательский
 *    ассет), обычный RN <Image> на весь экран (resizeMode cover);
 *  - стеклянные поверхности (LiquidGlassView, AGSL) преломляют то, что РЕАЛЬНО
 *    нарисовано позади них: обои и контент при скролле. Снимок-посредник и
 *    координатная привязка (measureInWindow) больше не нужны — захват бэкдропа
 *    нативный, каждый кадр;
 *  - контекст оставлен как маркер «мы внутри темы glass»: useScreenBgColor и
 *    ThemedCard проверяют его, чтобы делать экраны/карточки прозрачными
 *    (иначе непрозрачный colors.bg перекрыл бы обои).
 */
export interface GlassBackdropValue {
  /** Ширина/высота окна в dp. */
  width: number;
  height: number;
  /** Тема закреплена на тёмной палитре (обои тёмные), всегда false. */
  light: boolean;
}

const GlassBackdropContext = createContext<GlassBackdropValue | null>(null);

export function useGlassBackdrop(): GlassBackdropValue | null {
  return useContext(GlassBackdropContext);
}

/** Провайдер фона Liquid Glass: рисует обои и раздаёт маркер контекста. */
export function GlassBackdropProvider({ children }: { children: React.ReactNode }) {
  useTheme();
  const dims = useWindowDimensions();

  const value = useMemo<GlassBackdropValue>(
    () => ({ width: dims.width, height: dims.height, light: false }),
    [dims.width, dims.height]
  );

  return (
    <GlassBackdropContext.Provider value={value}>
      <RNView pointerEvents="none" style={styles.backdropHost}>
        <RNImage
          source={{ uri: "liquid_bg" }}
          style={styles.backdropImage}
          resizeMode="cover"
          fadeDuration={0}
        />
      </RNView>
      {children}
    </GlassBackdropContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdropHost: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, overflow: "hidden" },
  backdropImage: { flex: 1, width: "100%", height: "100%" },
});
