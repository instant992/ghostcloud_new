import React, { useSyncExternalStore } from "react";
import { ActivityIndicator, Text, type StyleProp, type ViewStyle } from "react-native";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { AgslGlassCard } from "./AgslGlassCard";
import { subscribeGlassEngine, getGlassEngineSnapshot } from "./glassEngine";
import { useTheme, isLightPalette, colors } from "../../theme";

/**
 * Канонические стеклянные блоки темы Liquid Glass.
 *
 * Вынесены из GlassScreen в общий модуль, чтобы разделы «Подписка» и
 * «Профиль» (и любые будущие glass-экраны) использовали ТОТ ЖЕ блок и кнопку,
 * что главная и меню — единый дизайн, а не отдельные копии стилей.
 *
 * Рендерится одним из двух движков (переключатель «Движок стекла» в Glass
 * Playground, хранение gc_settings `glass_engine`):
 * - `skia` (по умолчанию) — RN Skia, offscreen-снимки;
 * - `agsl` — react-native-liquid-glassmorphism, нативный GPU-шейдер.
 * Оба пути остаются полностью рабочими; выбор делается ЗДЕСЬ, экраны
 * не трогаем.
 */

export interface GlassCardProps {
  /** Радиус скругления (dp). Каталог ScrollContainer: 32. */
  radius?: number;
  /** 0..100 → сила блюра (дефолт блока ScrollContainer = 0: чистая линза). */
  intensity?: number;
  /** Полупрозрачная подложка поверх стекла (containerColor). По умолчанию НЕТ:
   *  блок ScrollContainer — прозрачное стекло без подложки. */
  overlay?: string;
  /** Обводка; по умолчанию НЕТ — край блока читается бликом и преломлением,
   *  как в ScrollContainerContent (drawBackdrop без бордюра). */
  borderColor?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Стеклянный блок. Движок выбирается по glassEngine (переключается в Glass
 *  Playground; useSyncExternalStore — перерисовка всех карточек при смене):
 *  skia — порт каталога Backdrop (RoundedRectangle 32dp + vibrancy + lens),
 *  agsl — LiquidGlassView (настоящая линза на GPU). */
export function GlassCard(props: GlassCardProps) {
  const engine = useSyncExternalStore(
    subscribeGlassEngine,
    getGlassEngineSnapshot
  );
  if (engine === "agsl") return <AgslGlassCard {...props} />;
  return <SkiaGlassCard {...props} />;
}

/** Skia-путь (исходный): чистое преломляющее стекло без blur/подложки/бордюра. */
function SkiaGlassCard({
  radius = 32,
  intensity = 0,
  overlay,
  borderColor,
  style,
  children,
  onPress,
  accessibilityLabel,
}: GlassCardProps) {
  const blur = Math.max(0, Math.min(12, intensity / 12));
  const surfaceColor = overlay ?? undefined;
  const effBorder = borderColor ?? null;
  return (
    <LiquidGlassSurface
      radius={radius}
      preset="scroll"
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
 * Каталог: `Capsule()` + `vibrancy()` + `blur(2dp)` + `lens(12dp, 24dp)`,
 * по умолчанию tint/surfaceColor НЕ заданы → кнопка полностью прозрачная
 * («Transparent Liquid Button»). Tint-вариант в каталоге делается как
 * `drawRect(tint, BlendMode.Hue)` + `drawRect(tint@0.75)`; в RN Skia мы
 * достигаем того же подложкой с насыщенным оттенком.
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

  // Tint-кнопки: оттенок поверх стекла (аналог drawRect(tint) из каталога).
  const tint =
    variant === "danger"
      ? light ? "rgba(220,38,38,0.62)" : "rgba(220,60,60,0.60)"
      : variant === "primary"
      ? colors.accentDeep
      : undefined;

  const textColor = isTransparent
    ? colors.text
    : variant === "danger"
    ? "#FFFFFF"
    : "#FFFFFF";

  const height = size === "sm" ? 40 : 48;
  const fontSize = size === "sm" ? 13 : 15;

  return (
    <LiquidGlassSurface
      radius={height / 2}
      preset="button"
      surfaceColor={tint}
      borderWidth={0}
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
