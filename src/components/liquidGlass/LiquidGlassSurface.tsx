import React, { useSyncExternalStore } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LiquidGlassView } from "react-native-liquid-glassmorphism";
import { glassTuning } from "./tuning";
import { isLightPalette } from "../../theme";

/**
 * Стеклянная поверхность Liquid Glass на движке AGSL
 * (react-native-liquid-glassmorphism).
 *
 * Прежняя Skia-реализация (offscreen-снимки фона → PNG data-URI) полностью
 * удалена: теперь стекло преломляет ТО, что реально нарисовано позади него
 * (обои темы, контент при скролле) — AGSL-шейдер на GPU каждый кадр.
 * Android 13+ — полная линза, API 31–32 — blur+tint, ниже — tint;
 * iOS 26 — нативный UIGlassEffect.
 *
 * Публичный API сохранён со старой Skia-поверхности, чтобы вызывающие экраны
 * не менялись: radius/preset/blur/saturation/surfaceColor/borderColor/
 * borderWidth/shadow/highlight/standalone/onPress/style/children.
 *
 * КЛЮЧЕВОЕ ПРАВИЛО: контент — РЕБЁНОК LiquidGlassView, а не sibling-слой
 * поверх absoluteFill-стекла. Только внутри нативного стекла работает
 * legibilityFloor (вуаль читабельности рисуется ПОД детьми), поэтому текст
 * внутри стекла читается на любом фоне.
 */

/** Пресеты эффектов (наследие каталога Backdrop): параметры материала AGSL. */
export type GlassPresetName =
  | "scroll"
  | "card"
  | "button"
  | "tabBar"
  | "icon"
  | "tabIndicator"
  | "knob"
  | "sliderKnob";

interface PresetCfg {
  /** Сила блюра, dp (0 = чистая линза). */
  blur: number;
  /** Глубина линзы (thickness AGSL: 0 — плоское стекло, 1 — норма, ~2 — глубокая). */
  thickness: number;
  /** Радужность кромки (iridescence 0..1). */
  iridescence: number;
  /** Базовая вуаль читабельности под детьми (legibilityFloor 0..1). */
  legibility: number;
}

export const GLASS_PRESETS: Record<GlassPresetName, PresetCfg> = {
  /** Блок списка ScrollContainer: чистое стекло без блюра, край читается линзой.
   *  legibility 0.14 — вуаль под текстом: фон темы снова неоднородный
   *  (градиент+блобы), без вуали текст внутри стекла тонет в преломлениях. */
  scroll: { blur: 0, thickness: 1, iridescence: 0, legibility: 0.14 },
  /** Крупная карточка: мягкий блюр, чуть более глубокая линза. */
  card: { blur: 4, thickness: 1.1, iridescence: 0, legibility: 0.16 },
  /** Кнопка-капсула (LiquidButton: blur 2). */
  button: { blur: 2, thickness: 1, iridescence: 0, legibility: 0.12 },
  /** Панель таб-бара (floatingTabBar каталога). */
  tabBar: { blur: 8, thickness: 1, iridescence: 0, legibility: 0.14 },
  /** Мелкий значок. */
  icon: { blur: 4, thickness: 0.9, iridescence: 0, legibility: 0.12 },
  /** Индикатор вкладки: стекло с дисперсией (lens каталога). */
  tabIndicator: { blur: 0, thickness: 1, iridescence: 0.35, legibility: 0 },
  /** Ручка тумблера/слайдера: белая капсула с дисперсией при движении. */
  knob: { blur: 8, thickness: 0.9, iridescence: 0.2, legibility: 0 },
  sliderKnob: { blur: 8, thickness: 0.9, iridescence: 0.2, legibility: 0 },
};

/** Дефолтная тонировка стекла темы.
 *  Без явного tintColor натив рисует белую вуаль ~18% (DEFAULT_REGULAR_TINT_ALPHA)
 *  — стекло выглядело белёсым. Пользователь хочет ТЁМНОЕ стекло «как меню»
 *  (док: rgba(18,18,18,0.32)) с фиолетовым подтоном: тёмный баклажан ~34%
 *  в тёмной теме; в светлой — мягкий фиолетовый, чтобы блоки не чернели. */
export const GLASS_TINT_DEFAULT_DARK = "rgba(26,18,46,0.34)";
export const GLASS_TINT_DEFAULT_LIGHT = "rgba(124,58,237,0.09)";

export interface LiquidGlassSurfaceProps {
  /** Радиус скругления (dp), все 4 угла. */
  radius?: number;
  /** Пресет эффектов (scroll/card/button/tabBar/icon/knob). */
  preset?: GlassPresetName;
  /** Переопределение blur, dp. */
  blur?: number;
  /** Насыщенность в каталожной шкале vibrancy (1.5 = дефолт каталога). */
  saturation?: number;
  /** Подложка/оттенок поверх стекла (tintColor). null = без подложки. */
  surfaceColor?: string | null;
  /** Обводка поверх стекла (у LiquidGlassView своей обводки нет — View-слой). */
  borderColor?: string | null;
  borderWidth?: number;
  /** Внешняя тень. false = без тени (на AGSL — elevation хоста). */
  shadow?: boolean | { radius?: number; dy?: number; color?: string; alpha?: number };
  /** Хайлайт по контуру; false = без хайлайта (на AGSL — edgeReflectionStrength). */
  highlight?:
    | false
    | {
        width?: number;
        blur?: number;
        alpha?: number;
        color?: string;
        angle?: number;
        falloff?: number;
        ambient?: boolean;
      };
  /** Запас вокруг поверхности — на AGSL не нужен (стекло рисуется в границах view). */
  padding?: number;
  /** Автономный режим (шторки/модалки): без тюнинга Glass Playground. */
  standalone?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Если задан — поверхность кликабельна (Pressable-обёртка). */
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Layout-ключи, которые должны остаться на ВНЕШНЕМ контейнере (Pressable),
 *  когда поверхность кликабельна: flex/размеры/позиционирование управляют
 *  местом блока в ряду родителя. Остальное (padding/flexDirection/align…)
 *  уходит на стекло — оно и laid out контейнер детей. */
const OUTER_LAYOUT_KEYS: ReadonlySet<string> = new Set([
  "flex", "flexGrow", "flexShrink", "flexBasis",
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  "alignSelf", "position", "left", "right", "top", "bottom",
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight",
  "marginHorizontal", "marginVertical", "zIndex",
]);

function splitLayout(flat: ViewStyle | undefined): { outer: ViewStyle; inner: ViewStyle } {
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(flat ?? {})) {
    if (OUTER_LAYOUT_KEYS.has(k)) outer[k] = (flat as Record<string, unknown>)[k];
    else inner[k] = (flat as Record<string, unknown>)[k];
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

export function LiquidGlassSurface({
  radius = 20,
  preset = "card",
  blur: blurOverride,
  saturation: saturationOverride,
  surfaceColor,
  borderColor,
  borderWidth = 1,
  shadow = true,
  highlight,
  standalone = false,
  children,
  style,
  onPress,
  accessibilityLabel,
}: LiquidGlassSurfaceProps) {
  const light = isLightPalette();
  // Глобальная настройка стекла (Glass Playground): множители к пресету.
  const tuning = useSyncExternalStore(glassTuning.subscribe, glassTuning.getSnapshot);
  const presetCfg = GLASS_PRESETS[preset] ?? GLASS_PRESETS.card;
  const applyTuning = !standalone;

  // radius: множитель тюнинга (скругление всех блоков — дизайн-параметр).
  const radiusEff = Math.max(0, radius * (applyTuning ? tuning.radius : 1));
  // blur: множитель тюнинга.
  const blur = (blurOverride ?? presetCfg.blur) * (applyTuning ? tuning.blur : 1);
  // saturation: каталожная шкала vibrancy (1.5) → шкала AGSL (1.0).
  const saturationBase = saturationOverride ?? (applyTuning ? tuning.saturation : 1.5);
  const saturation = Math.max(0, Math.min(2, saturationBase / 1.5));
  // Линза: среднее от множителей высоты/силы преломления (дефолт 1/1 → толщина пресета).
  const thickness = applyTuning
    ? Math.max(0, Math.min(2, (presetCfg.thickness * (tuning.refractionHeight + tuning.refractionAmount)) / 2))
    : presetCfg.thickness;
  // Дисперсия кромки: непрерывный ползунок Playground (>0) или пресет.
  const iridescence = Math.max(
    0,
    Math.min(1, applyTuning && tuning.aberration > 0 ? tuning.aberration : presetCfg.iridescence)
  );
  // Хайлайт → сила отражения кромки (0..1).
  const edgeReflection =
    highlight === false ? 0 : Math.max(0, Math.min(1, 0.9 * (applyTuning ? tuning.highlight : 1)));
  // Вуаль читабельности: базовая пресетная + ползунок Playground. Светлая
  // палитра требует больше (фон ярче, текст светлый).
  const legibilityFloor = Math.max(
    0,
    Math.min(0.6, presetCfg.legibility + (light ? 0.08 : 0) + (applyTuning ? tuning.veil : 0))
  );
  // Тень → elevation хоста (нативная тень Android; своего shadow у AGSL нет).
  const elevation =
    shadow === false || (applyTuning && tuning.shadow <= 0)
      ? 0
      : Math.round(2 * (applyTuning ? tuning.shadow : 1));

  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const borderFromStyle = borderColor == null && flat?.borderColor != null;
  const effBorderColor = borderColor ?? (borderFromStyle ? (flat!.borderColor as string) : null);
  const effBorderWidth = borderFromStyle ? Number(flat!.borderWidth ?? 1) : borderWidth;

  const glassProps = {
    variant: "regular" as const,
    borderRadius: radiusEff,
    blurRadius: blur,
    thickness,
    iridescence,
    saturation,
    edgeReflectionStrength: edgeReflection,
    legibilityFloor,
    // surfaceColor === null/undefined → фиолетовый дефолт темы (см. GLASS_TINT_DEFAULT_*);
    // явный цвет вызывающей стороны (кнопки primary/danger, белые ручки) — без изменений.
    tintColor: surfaceColor ?? (light ? GLASS_TINT_DEFAULT_LIGHT : GLASS_TINT_DEFAULT_DARK),
  };

  const borderLayer =
    effBorderColor && effBorderWidth > 0 ? (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radiusEff, borderWidth: effBorderWidth, borderColor: effBorderColor },
        ]}
      />
    ) : null;

  const { outer, inner } = splitLayout(flat);

  if (onPress) {
    // Layout (flex/размеры/margin) несёт Pressable — иначе flex:1 в ряду
    // родителя не сработает; padding/направление — стекло (оно контейнер
    // детей). flex:1 растягивает стекло на Pressable и при фиксированной
    // высоте, и при авто-высоте (тогда высоту задаёт контент внутри стекла).
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [outer, { opacity: pressed ? 0.85 : 1 }]}
      >
        <LiquidGlassView
          {...glassProps}
          interactive
          style={[inner, { flex: 1, borderRadius: radiusEff, elevation }]}
        >
          {children}
          {borderLayer}
        </LiquidGlassView>
      </Pressable>
    );
  }

  return (
    <LiquidGlassView
      {...glassProps}
      style={[outer, inner, { borderRadius: radiusEff, elevation, overflow: "hidden" }]}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
      {borderLayer}
    </LiquidGlassView>
  );
}
