import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LiquidGlassView } from "react-native-liquid-glassmorphism";
import { useTheme, isLightPalette } from "../../theme";

/**
 * Стеклянный блок на движке AGSL (react-native-liquid-glassmorphism).
 *
 * В отличие от Skia-пути (offscreen-снимок фона темы → PNG), этот компонент
 * преломляет ТО, что реально нарисовано позади него в дереве: фон темы
 * (GlassBackdropProvider рисует его RN <Image> на весь экран), контент при
 * скролле. Рендер — AGSL-шейдер на GPU каждый кадр (Android 13+), на iOS 26 —
 * нативный UIGlassEffect; ниже — blur/tint-фолбэки самой библиотеки.
 *
 * Пропсы совместимы с GlassCard, чтобы диспетчеризация по движку не требовала
 * правок в экранах: radius/intensity/overlay/borderColor/onPress/style.
 *
 * Маппинг:
 * - `overlay` → `tintColor` (полупрозрачный оттенок стекла);
 * - `intensity` (0..100, как в GlassCard) → `blurRadius` dp;
 * - `borderColor` → обычный View-слой обводки поверх стекла (у
 *   LiquidGlassView своей обводки нет).
 *
 * СТРУКТУРА: контейнер (style вызывающего: padding/flex/margin) → стекло
 * absoluteFill ЗА контентом → дети обычным потоком. Каждая стеклянная
 * поверхность захватывает свой бэкдроп, поэтому LiquidGlassView здесь РОВНО
 * ОДИН; нажатие — Pressable-контейнер (opacity-отклик), дети-кнопки внутри
 * карточек без onPress остаются кликабельными.
 */
export interface AgslGlassCardProps {
  radius?: number;
  /** 0..100 → сила блюра (как в GlassCard). */
  intensity?: number;
  /** Полупрозрачная подложка/оттенок поверх стекла. */
  overlay?: string;
  borderColor?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function AgslGlassCard({
  radius = 32,
  intensity = 0,
  overlay,
  borderColor,
  style,
  children,
  onPress,
  accessibilityLabel,
}: AgslGlassCardProps) {
  useTheme();
  const light = isLightPalette();

  // intensity 0..100 → blur dp 0..12.
  const blurRadius = Math.max(0, Math.min(12, (intensity / 100) * 12));

  const glass = (
    <LiquidGlassView
      variant="regular"
      blurRadius={blurRadius}
      borderRadius={radius}
      tintColor={overlay ?? undefined}
      // «Жидкость»: глубина линзы + отражение кромки — фирменный вид пакета.
      thickness={1}
      edgeReflectionStrength={0.9}
      // Вуаль под контентом, чтобы текст/иконки читались в обеих темах.
      legibilityFloor={light ? 0.16 : 0.08}
      style={StyleSheet.absoluteFill}
    />
  );

  const border = borderColor ? (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: radius, borderWidth: 1, borderColor },
      ]}
    />
  ) : null;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [style as ViewStyle, { opacity: pressed ? 0.85 : 1 }]}
      >
        {glass}
        {children}
        {border}
      </Pressable>
    );
  }

  return (
    <View style={style}>
      {glass}
      {children}
      {border}
    </View>
  );
}
