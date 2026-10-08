import React, { createContext, useContext, useMemo } from "react";
import { View as RNView, useWindowDimensions, StyleSheet } from "react-native";
import { colors, isLightPalette, useTheme } from "../../theme";

/**
 * Контекст фона темы Liquid Glass.
 *
 * Фон ПЛОСКИЙ — как в стандартной теме: заливка colors.bg (тёмная или светлая
 * вариация палитры glass). Прежняя Skia-реализация (рендер градиента+блобов)
 * удалена вместе со Skia-движком; фотообои `liquid_bg` тоже убраны по запросу
 * пользователя — на их светящихся блобах терялись фиолетовый акцент и серый
 * текст, поэтому вернулись к плоскому фону и исходным цветам шрифтов.
 *
 * Стеклянные поверхности (LiquidGlassView, AGSL) преломляют то, что РЕАЛЬНО
 * нарисовано позади них: фон темы и контент при скролле. Снимок-посредник и
 * координатная привязка (measureInWindow) не нужны — захват бэкдропа нативный,
 * каждый кадр.
 *
 * Контекст оставлен как маркер «мы внутри темы glass»: useScreenBgColor и
 * ThemedCard проверяют его, чтобы делать экраны/карточки прозрачными (иначе
 * непрозрачный colors.bg экрана перекрыл бы фон провайдера и стеклу было бы
 * нечего преломлять).
 */
export interface GlassBackdropValue {
  /** Ширина/высота окна в dp. */
  width: number;
  height: number;
  /** Светлая ли вариация палитры (для стеклянных эффектов). */
  light: boolean;
}

const GlassBackdropContext = createContext<GlassBackdropValue | null>(null);

export function useGlassBackdrop(): GlassBackdropValue | null {
  return useContext(GlassBackdropContext);
}

/** Провайдер фона Liquid Glass: плоская заливка colors.bg + маркер контекста. */
export function GlassBackdropProvider({ children }: { children: React.ReactNode }) {
  useTheme();
  const dims = useWindowDimensions();
  const light = isLightPalette();

  const value = useMemo<GlassBackdropValue>(
    () => ({ width: dims.width, height: dims.height, light }),
    [dims.width, dims.height, light]
  );

  return (
    <GlassBackdropContext.Provider value={value}>
      <RNView
        pointerEvents="none"
        style={[styles.backdropHost, { backgroundColor: colors.bg }]}
      />
      {children}
    </GlassBackdropContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdropHost: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
});
