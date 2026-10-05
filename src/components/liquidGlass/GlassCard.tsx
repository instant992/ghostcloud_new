import React from "react";
import { ActivityIndicator, Text, type StyleProp, type ViewStyle } from "react-native";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { useTheme, isLightPalette, colors } from "../../theme";

/**
 * Канонические стеклянные блоки темы Liquid Glass.
 *
 * Вынесены из GlassScreen в общий модуль, чтобы разделы «Подписка» и
 * «Профиль» (и любые будущие glass-экраны) использовали ТОТ ЖЕ блок и кнопку,
 * что главная и меню — единый дизайн, а не отдельные копии стилей.
 */

export interface GlassCardProps {
  /** Радиус скругления (dp). */
  radius?: number;
  /** 0..100 → сила блюра (дефолт Backdrop-карточки ≈ 4). */
  intensity?: number;
  /** Полупрозрачная подложка поверх стекла (containerColor). */
  overlay?: string;
  /** Обводка; по умолчанию — лавандовая в светлой / белая в тёмной. */
  borderColor?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Стеклянная карточка: vibrancy ⇒ blur ⇒ lens + блик + тень (порт Backdrop). */
export function GlassCard({
  radius = 20,
  intensity = 50,
  overlay,
  borderColor,
  style,
  children,
  onPress,
  accessibilityLabel,
}: GlassCardProps) {
  useTheme();
  const light = isLightPalette();
  const blur = Math.max(0, Math.min(12, intensity / 12));
  const surfaceColor = overlay ?? (light ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.05)");
  // Светлая тема: белая обводка по светлому фону невидима — вместо неё тонкий
  // тёмно-лавандовый край (стекло читается границей + тенью + бликом).
  const effBorder =
    borderColor ?? (light ? "rgba(120,105,160,0.20)" : "rgba(255,255,255,0.22)");
  return (
    <LiquidGlassSurface
      radius={radius}
      preset="card"
      blur={blur}
      surfaceColor={surfaceColor}
      borderColor={effBorder}
      borderWidth={1}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {children}
    </LiquidGlassSurface>
  );
}

export interface GlassButtonProps {
  title: string;
  onPress?: () => void;
  /** primary — акцентная фиолетовая; ghost — нейтральное стекло; danger — красная. */
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Стеклянная кнопка в стиле главной/меню: translucent-подложка с акцентным
 * оттенком, обводка и блик — вместо глухого solid-fill других тем.
 */
export function GlassButton({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  style,
  accessibilityLabel,
}: GlassButtonProps) {
  useTheme();
  const light = isLightPalette();

  const tint =
    variant === "danger"
      ? light ? "rgba(220,38,38,0.16)" : "rgba(248,113,113,0.18)"
      : variant === "ghost"
      ? light ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.06)"
      : light ? "rgba(124,58,237,0.16)" : "rgba(139,92,246,0.20)";

  const border =
    variant === "danger"
      ? light ? "rgba(220,38,38,0.45)" : "rgba(248,113,113,0.45)"
      : variant === "ghost"
      ? light ? "rgba(120,105,160,0.22)" : "rgba(255,255,255,0.24)"
      : light ? "rgba(124,58,237,0.45)" : "rgba(167,139,250,0.45)";

  const textColor =
    variant === "danger"
      ? light ? "#DC2626" : "#FCA5A5"
      : variant === "ghost"
      ? colors.text
      : light ? "#6D28D9" : "#DDD6FE";

  const padV = size === "sm" ? 10 : 14;
  const fontSize = size === "sm" ? 13 : 15;

  return (
    <LiquidGlassSurface
      radius={size === "sm" ? 12 : 14}
      preset="button"
      surfaceColor={tint}
      borderColor={border}
      borderWidth={1}
      onPress={disabled ? undefined : onPress}
      accessibilityLabel={accessibilityLabel ?? title}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          paddingVertical: padV,
          paddingHorizontal: 16,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={textColor} /> : icon}
      <Text style={{ color: textColor, fontSize, fontWeight: "600" }}>{title}</Text>
    </LiquidGlassSurface>
  );
}
