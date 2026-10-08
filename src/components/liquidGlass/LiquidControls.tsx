import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  ReduceMotion,
} from "react-native-reanimated";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { LIQUID_SPRING } from "./LiquidPressable";
import { colors, isLightPalette, useTheme } from "../../theme";

/**
 * Каталог Backdrop (Kyant0/AndroidLiquidGlass, Apache-2.0) в RN:
 * LiquidButton — стеклянная капсула 48dp, press scale 1+4dp/height,
 * InteractiveHighlight (белый overlay 0.08 + пятно 0.15);
 * LiquidToggle — дорожка 64×28dp lerp(track→accent), ручка 40×24dp
 * с «дыханием» (scaleX 2/3→0.75→1, scaleY 0→0.75→1).
 *
 * Рендер стекла — AGSL (LiquidGlassSurface); прежние Skia-канвасы удалены
 * вместе с движком.
 */

/** Нажимная подсветка каталога InteractiveHighlight на AGSL не переносится —
 *  её заменяет `interactive` у LiquidGlassView (touch bloom + specular),
 *  который LiquidGlassSurface включает на любой поверхности с onPress. */

export interface LiquidButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Высота (LiquidButton каталога: 48). */
  height?: number;
  variant?: "filled" | "glass";
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function LiquidButton({
  label,
  onPress,
  disabled,
  height = 48,
  variant = "glass",
  style,
  labelStyle,
  accessibilityLabel,
}: LiquidButtonProps) {
  useTheme();
  const light = isLightPalette();
  const radius = height / 2; // Capsule
  // scale = lerp(1, 1 + 4dp/height, progress) — как в LiquidButton.
  const pressedScale = 1 + 4 / height;

  const press = useSharedValue(0);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (pressedScale - 1) * press.value }],
  }));

  return (
    <Animated.View style={[scaleStyle, style]}>
      <LiquidGlassSurface
        radius={radius}
        preset="button"
        // Каталог LiquidButton: tint/surfaceColor по умолчанию НЕ заданы —
        // «Transparent Liquid Button» — чистое стекло без подложки.
        // filled = tint-вариант (акцент поверх стекла).
        surfaceColor={variant === "filled" ? colors.accentDeep : undefined}
        shadow={variant === "filled" ? { radius: 12, alpha: light ? 0.14 : 0.35 } : false}
        highlight={variant === "filled" ? false : undefined}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Pressable
          disabled={disabled}
          onPress={onPress}
          onPressIn={() => {
            press.value = withSpring(1, LIQUID_SPRING);
          }}
          onPressOut={() => {
            press.value = withSpring(0, LIQUID_SPRING);
          }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          style={btnStyles.inner}
        >
          <Text
            style={[
              { color: variant === "filled" ? "#fff" : colors.text, fontWeight: "700", fontSize: 15 },
              labelStyle,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>
      </LiquidGlassSurface>
    </Animated.View>
  );
}

const btnStyles = StyleSheet.create({
  inner: {
    height: "100%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
});

export interface LiquidToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Ширина/высота дорожки (каталог: 64×28, ручка 40×24). */
  width?: number;
  height?: number;
}

/**
 * Тумблер-переключатель — порт LiquidToggle из каталога Backdrop.
 *
 * Точные параметры каталога:
 *  - дорожка 64×28dp, цвет lerp(trackColor, accentColor, fraction):
 *    track = #787878@0.2 (светлая) / #787880@0.36 (тёмная),
 *    accent = #34C759 (светлая) / #30D158 (тёмная);
 *  - ручка 40×24dp, белая капсула, translationX = lerp(2dp, 22dp, fraction)
 *    (dragWidth = 20dp);
 *  - DRAG: fraction += dx/dragWidth, на отпускании ≥0.5 → вкл (аналог
 *    DampedDragAnimation); короткий тап без сдвига = переключение;
 *  - «дыхание» ручки при движении: scale ±8% по синусу пути + пружина нажатия;
 *  - тень ручки 4dp black@0.05 → усилено (0.12/0.3): в RN иначе не читается.
 *
 * Ручка — `standalone`-стекло (белая подложка + ambient-хайлайт): тумблеры
 * живут и в модалках (отдельное окно), где сэмплить фон провайдера нельзя,
 * а белая капсула выглядит одинаково в обоих случаях.
 */
export function LiquidToggle({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  width = 64,
  height = 28,
}: LiquidToggleProps) {
  useTheme();
  const light = isLightPalette();
  // Точные цвета каталога LiquidToggle (colors.green другой — #34D399).
  const accent = light ? "#34C759" : "#30D158";
  const track = light ? "rgba(120,120,120,0.2)" : "rgba(120,120,128,0.36)";

  const knobW = width * 0.625; // 40/64 из каталога
  const knobH = height * (24 / 28);
  const pad = 2;
  const travel = width - knobW - pad * 2; // = dragWidth (20dp)

  const fraction = useSharedValue(value ? 1 : 0);
  const pressProgress = useSharedValue(0);
  const dragStart = useRef(0);
  const didDrag = useRef(false);

  useEffect(() => {
    fraction.value = withTiming(value ? 1 : 0, { duration: 240, reduceMotion: ReduceMotion.System });
  }, [value, fraction]);

  // Дорожка: цвет lerp(track → accent) по fraction — как drawBehind каталога.
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fraction.value, [0, 1], [track, accent]),
  }));

  const knobStyle = useAnimatedStyle(() => {
    const f = fraction.value;
    const p = pressProgress.value;
    // «Дыхание» ручки из каталога: при движении сжимается, к концу расправляется
    // (DampedDragAnimation pressedScale=1.5 → у нас мягче: ±8% по синусу пути).
    const squeeze = Math.sin(Math.PI * Math.min(1, Math.max(0, f)));
    const sc = 1 - 0.08 * squeeze + 0.06 * p;
    return {
      width: knobW,
      height: knobH,
      borderRadius: knobH / 2,
      transform: [{ translateX: pad + travel * f }, { scale: sc }],
    };
  });

  const commit = useCallback(
    (next: boolean) => {
      if (disabled) return;
      fraction.value = withSpring(next ? 1 : 0, LIQUID_SPRING);
      onValueChange(next);
    },
    [disabled, fraction, onValueChange]
  );

  // Жесты: тап ловит внутренний Pressable (он корректно отдаёт responder
  // ScrollView при вертикальном скролле), горизонтальный drag — PanResponder
  // на контейнере (DampedDragAnimation из каталога: fraction += dx/dragWidth).
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // CAPTURE: тап-Pressable внутри уже держит responder — перехватываем
        // жест в фазе capture, когда он явно горизонтальный (drag ручки).
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !disabled && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_, g) => {
          dragStart.current = fraction.value;
          // Capture срабатывает уже при dx>6 — помечаем drag сразу, иначе
          // терминация Pressable (onPressOut) сбросит pressProgress и
          // «дыхание» ручки мигнёт во время перетаскивания.
          didDrag.current = Math.abs(g.dx) > 6;
          pressProgress.value = withSpring(1, LIQUID_SPRING);
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) <= 4 && !didDrag.current) return;
          didDrag.current = true;
          fraction.value = Math.min(1, Math.max(0, dragStart.current + g.dx / travel));
        },
        onPanResponderRelease: () => {
          pressProgress.value = withSpring(0, LIQUID_SPRING);
          if (didDrag.current) commit(fraction.value >= 0.5);
          else fraction.value = withSpring(value ? 1 : 0, LIQUID_SPRING);
        },
        onPanResponderTerminate: () => {
          pressProgress.value = withSpring(0, LIQUID_SPRING);
          fraction.value = withSpring(value ? 1 : 0, LIQUID_SPRING);
        },
      }),
    [disabled, fraction, pressProgress, travel, commit, value]
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={6}
      style={{ width, height, opacity: disabled ? 0.5 : 1 }}
    >
      {/* Дорожка: capsule с lerp-цветом. */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            borderRadius: height / 2,
          },
          trackStyle,
        ]}
      />
      {/* Ручка — белая стеклянная капсула с ambient-хайлайтом и тенью 4dp. */}
      <Animated.View style={[{ position: "absolute", top: (height - knobH) / 2, left: 0 }, knobStyle]}>
        <LiquidGlassSurface
          radius={knobH / 2}
          preset="knob"
          standalone
          surfaceColor="#FFFFFF"
          shadow={{ radius: 4, dy: 1, color: "#000000", alpha: light ? 0.12 : 0.3 }}
          highlight={{ ambient: true, width: 0.5, blur: 0.3, alpha: 0.6 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
      {/* Прозрачная зона тапа поверх всего. */}
      <Pressable
        disabled={disabled}
        onPress={() => commit(!value)}
        onPressIn={() => {
          pressProgress.value = withSpring(1, LIQUID_SPRING);
        }}
        onPressOut={() => {
          pressProgress.value = withSpring(0, LIQUID_SPRING);
        }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

export interface LiquidSliderProps {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Высота дорожки (каталог: 6dp) и ручки (24dp). */
  trackHeight?: number;
  knobWidth?: number;
  knobHeight?: number;
}

/**
 * Слайдер — порт LiquidSlider из каталога Backdrop.
 *
 * Точные параметры каталога:
 *  - дорожка 6dp, capsule, trackColor = #787878@0.2 (светлая) / #787880@0.36 (тёмная);
 *  - заполнение accentColor = #0088FF (светлая) / #0091FF (тёмная),
 *    ширина = trackWidth · progress;
 *  - ручка 40×24dp capsule: `translationX = (−w/2 + trackWidth·progress)`
 *    с ограничением `[−w/4, trackWidth − 3w/4]`; в покое — белая поверхность
 *    + тень 4dp black@0.05, при нажатии `pressedScale = 1.5`;
 *  - drag: `value += (max−min) · dx/trackWidth` (DampedDragAnimation);
 *    тап по дорожке переставляет значение в точку касания.
 */
export function LiquidSlider({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0,
  disabled,
  accessibilityLabel,
  trackHeight = 6,
  knobWidth = 40,
  knobHeight = 24,
}: LiquidSliderProps) {
  useTheme();
  const light = isLightPalette();
  // Точные цвета каталога LiquidSlider (colors.accent другой — фиолетовый).
  const accent = light ? "#0088FF" : "#0091FF";
  const track = light ? "rgba(120,120,120,0.2)" : "rgba(120,120,128,0.36)";

  const [trackW, setTrackW] = useState(0);
  const span = Math.max(1e-6, max - min);
  const clamp = useCallback(
    (v: number) => {
      let next = Math.min(max, Math.max(min, v));
      if (step > 0) next = min + Math.round((next - min) / step) * step;
      // Защита от накопления плавающей точки (0.30000000000000004).
      next = Math.round(next * 1000) / 1000;
      return Math.min(max, Math.max(min, next));
    },
    [min, max, step]
  );

  const fraction = useSharedValue((value - min) / span);
  const press = useSharedValue(0);
  const dragStart = useRef(0);

  useEffect(() => {
    // Во время перетаскивания ручка идёт за пальцем напрямую (move) —
    // withTiming извне только мешал бы (конкуренция двух анимаций = «вязкость»).
    if (dragging.current) return;
    fraction.value = withTiming((clamp(value) - min) / span, { duration: 180, reduceMotion: ReduceMotion.System });
  }, [value, min, span, fraction, clamp]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(1, Math.max(0, fraction.value)) * 100}%`,
  }));

  // translationX каталога: −knobWidth/2 + trackWidth·progress, с ограничением.
  const knobStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, fraction.value));
    const raw = -knobWidth / 2 + trackW * p;
    const x = Math.min(trackW - knobWidth * 0.75, Math.max(-knobWidth / 4, raw));
    const sc = 1 + 0.5 * press.value; // pressedScale = 1.5 из каталога
    return { transform: [{ translateX: x }, { scaleX: sc }, { scaleY: sc }] };
  });

  const emitValue = useCallback(
    (f: number) => onValueChange(clamp(min + f * span)),
    [onValueChange, clamp, min, span]
  );

  // Жесты: классический паттерн слайдера внутри ScrollView.
  //  - grant: запоминаем точку касания, значение НЕ меняем (иначе скролл
  //    страницы случайно двигал бы ползунок);
  //  - move: первое значимое движение решает направление — вертикаль отдаём
  //    ScrollView (terminationRequest=true, пока не.dragging), горизонталь
  //    начинаем тащить от точки касания;
  //  - release без движения = тап → переставляем значение в точку касания;
  //  - когда тащим горизонтально — отказываем termination, ScrollView не ворует.
  const grantF = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && trackW > 0,
        onMoveShouldSetPanResponder: () => false,
        onPanResponderTerminationRequest: () => !dragging.current,
        onPanResponderGrant: (e) => {
          if (trackW <= 0) return;
          grantF.current = Math.min(1, Math.max(0, e.nativeEvent.locationX / trackW));
          dragging.current = false;
          moved.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (trackW <= 0) return;
          if (!dragging.current) {
            // Порог направления: меньше 8dp игнорируем (дрожание пальца).
            if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) return;
            // Вертикаль — отдаём ScrollView (он запросит termination).
            if (Math.abs(g.dy) > Math.abs(g.dx)) return;
            dragging.current = true;
            press.value = withSpring(1, LIQUID_SPRING);
            dragStart.current = grantF.current;
            fraction.value = grantF.current;
            emitValue(grantF.current);
          }
          moved.current = true;
          const f = Math.min(1, Math.max(0, dragStart.current + g.dx / trackW));
          fraction.value = f;
          emitValue(f);
        },
        onPanResponderRelease: () => {
          if (!dragging.current && !moved.current) {
            // Тап по дорожке — переставляем значение в точку касания.
            fraction.value = withSpring(grantF.current, LIQUID_SPRING);
            emitValue(grantF.current);
          }
          if (dragging.current) press.value = withSpring(0, LIQUID_SPRING);
          dragging.current = false;
        },
        onPanResponderTerminate: () => {
          if (dragging.current) press.value = withSpring(0, LIQUID_SPRING);
          dragging.current = false;
        },
      }),
    [disabled, trackW, fraction, press, emitValue]
  );

  const hit = Math.max(28, knobHeight + 12);

  return (
    <View
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: clamp(value) }}
      style={{ height: hit, justifyContent: "center", opacity: disabled ? 0.5 : 1 }}
      onLayout={(e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setTrackW((p) => (Math.abs(p - w) > 0.5 ? w : p));
      }}
    >
      {/* Дорожка + заполнение. */}
      <View
        style={{
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: track,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[{ height: "100%", backgroundColor: accent, borderRadius: trackHeight / 2 }, fillStyle]}
        />
      </View>
      {/* Ручка — белая стеклянная капсула (как в LiquidToggle). */}
      <Animated.View
        style={[
          { position: "absolute", left: 0, top: (hit - knobHeight) / 2, width: knobWidth, height: knobHeight },
          knobStyle,
        ]}
      >
        <LiquidGlassSurface
          radius={knobHeight / 2}
          preset="knob"
          standalone
          surfaceColor="#FFFFFF"
          shadow={{ radius: 4, dy: 1, color: "#000000", alpha: light ? 0.05 : 0.12 }}
          highlight={{ ambient: true, width: 0.33, blur: 0.2, alpha: 0.6 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}
