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
 *
 * Движок один — AGSL (react-native-liquid-glassmorphism): LiquidGlassSurface
 * рисует нативное стекло с преломлением, а контент блока лежит ВНУТРИ стекла
 * (legibilityFloor даёт вуаль читабельности под текстом — жалоба «текст внутри
 * стекла тонет» исправлена именно этим).
 */

export interface GlassCardProps {
  /** Радиус скругления (dp). Каталог ScrollContainer: 32. */
  radius?: number;
  /** 0..100 → сила блюра (дефолт блока ScrollContainer = 0: чистая линза). */
  intensity?: number;
  /** Полупрозрачная подложка поверх стекла (tint). По умолчанию НЕТ:
   *  блок ScrollContainer — прозрачное стекло без подложки. */
  overlay?: string;
  /** Обводка; по умолчанию НЕТ — край блока читается бликом и преломлением. */
  borderColor?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Стеклянный блок — чистое преломляющее стекло без blur/подложки/бордюра. */
export function GlassCard({
  radius = 32,
  intensity = 0,
  overlay,
  borderColor,
  style,
  children,
  onPress,
  accessibilityLabel,
}: GlassCardProps) {
  // intensity 0..100 → blur dp 0..12 (дефолт ScrollContainer = 0).
  const blur = Math.max(0, Math.min(12, (intensity / 100) * 12));
  return (
    <LiquidGlassSurface
      radius={radius}
      preset="scroll"
      blur={blur}
      surfaceColor={overlay ?? null}
      borderColor={borderColor ?? null}
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
  /** transparent — прозрачное стекло как «Transparent Liquid Button» каталога;
   *  primary — tint-вариант (акцентный оттенок через подложку); ghost — нейтральное;
   *  danger — красный tint. */
  variant?: "primary" | "ghost" | "danger" | "transparent";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Стеклянная кнопка-капсула — порт LiquidButton из каталога Backdrop.
 *
 * По умолчанию tint/surfaceColor НЕ заданы → кнопка полностью прозрачная
 * («Transparent Liquid Button»). Tint-варианты получают насыщенный оттенок
 * через tintColor стекла.
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

  const isTransparent = variant === "transparent" || variant === "ghost";

  // Tint-кнопки: оттенок стекла (аналог drawRect(tint) из каталога).
  const tint =
    variant === "danger"
      ? light ? "rgba(220,38,38,0.62)" : "rgba(220,60,60,0.60)"
      : variant === "primary"
      ? colors.accentDeep
      : undefined;

  const textColor = isTransparent ? colors.text : "#FFFFFF";

  const height = size === "sm" ? 40 : 48;
  const fontSize = size === "sm" ? 13 : 15;

  return (
    <LiquidGlassSurface
      radius={height / 2}
      preset="button"
      surfaceColor={tint ?? null}
      borderWidth={0}
      shadow={false}
      onPress={disabled ? undefined : onPress}
      accessibilityLabel={accessibilityLabel ?? title}
      style={[
        {
          height,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
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
