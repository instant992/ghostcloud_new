import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";
import { Canvas, Circle, Fill, Group, BlurMask } from "@shopify/react-native-skia";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { LIQUID_SPRING } from "./LiquidPressable";
import { colors, isLightPalette, useTheme } from "../../theme";

/**
 * Каталог Backdrop (Kyant0/AndroidLiquidGlass, Apache-2.0) в RN:
 * LiquidButton — стеклянная капсула 48dp, press scale 1+4dp/height,
 * InteractiveHighlight (белый overlay 0.08 + пятно 0.15, blend Plus);
 * LiquidToggle — дорожка 64×28dp lerp(track→accent), ручка 40×24dp
 * с «дыханием» (scaleX 2/3→0.75→1, scaleY 0→0.75→1, blur 8→0, дисперсия).
 */

/** Нажимная подсветка: белый overlay + пятно под пальцем, blend Plus. */
function PressHighlight({
  press,
  posX,
  posY,
  box,
  radius,
}: {
  press: { value: number };
  posX: { value: number };
  posY: { value: number };
  box: { w: number; h: number };
  radius: number;
}) {
  const spotR = Math.max(box.w, box.h) * 0.6;
  return (
    <Canvas
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}
    >
      <Group blendMode="plus" opacity={press}>
        <Fill color="rgba(255,255,255,0.08)" />
        <Circle cx={posX} cy={posY} r={spotR} color="rgba(255,255,255,0.15)">
          <BlurMask blur={spotR * 0.5} style="normal" />
        </Circle>
      </Group>
    </Canvas>
  );
}

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
  const posX = useSharedValue(0);
  const posY = useSharedValue(0);
  const [box, setBox] = useState({ w: 1, h: height });

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (pressedScale - 1) * press.value }],
  }));

  return (
    <Animated.View style={[scaleStyle, style]}>
      <LiquidGlassSurface
        radius={radius}
        preset="button"
        surfaceColor={
          variant === "filled" ? colors.accentDeep : light ? "rgba(250,250,250,0.4)" : "rgba(18,18,18,0.4)"
        }
        shadow={variant === "filled" ? { radius: 12, alpha: light ? 0.14 : 0.35 } : false}
        highlight={variant === "filled" ? false : undefined}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Pressable
          disabled={disabled}
          onPress={onPress}
          onPressIn={(e) => {
            posX.value = e.nativeEvent.locationX;
            posY.value = e.nativeEvent.locationY;
            press.value = withSpring(1, LIQUID_SPRING);
          }}
          onPressOut={() => {
            press.value = withSpring(0, LIQUID_SPRING);
          }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          style={btnStyles.inner}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            const h = e.nativeEvent.layout.height;
            if (w > 0 && h > 0) setBox({ w, h });
          }}
        >
          {variant === "glass" && <PressHighlight press={press} posX={posX} posY={posY} box={box} radius={radius} />}
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
 * Тумблер-переключатель (порт LiquidToggle).
 *
 * Поведение из каталога: дорожка lerp(trackColor, accentColor, fraction);
 * ручка едет translationX = lerp(pad, pad+dragWidth, fraction) и «дышит» при
 * движении: blur 8dp→0 и scale (2/3,0)→(0.75,0.75)→(1,1). Упрощение:
 * combinedBackdrop дорожки (ручка семплит её) не переносим — ручка стеклянная
 * по фону темы; дыхание передано пружиной scale+opacity.
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
  const accent = colors.green || (light ? "#34C759" : "#30D158");
  const track = light ? "rgba(120,120,120,0.2)" : "rgba(120,120,128,0.36)";

  const knobW = width * 0.625; // 40/64 из каталога
  const knobH = height * (24 / 28);
  const pad = 2;
  const travel = width - knobW - pad * 2;

  const fraction = useSharedValue(value ? 1 : 0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    fraction.value = withTiming(value ? 1 : 0, { duration: 240, reduceMotion: ReduceMotion.System });
  }, [value, fraction]);

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

  const onPress = useCallback(() => {
    if (disabled) return;
    onValueChange(!value);
  }, [disabled, onValueChange, value]);

  const trackBg = value ? accent : track;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressProgress.value = withSpring(1, LIQUID_SPRING);
      }}
      onPressOut={() => {
        pressProgress.value = withSpring(0, LIQUID_SPRING);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={6}
      style={{ width, height, opacity: disabled ? 0.5 : 1 }}
    >
      {/* Дорожка: capsule с плавным цветом. */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: trackBg,
        }}
      />
      {/* Ручка — стеклянная капсула с ambient-хайлайтом и тенью 4dp. */}
      <Animated.View style={[{ position: "absolute", top: (height - knobH) / 2, left: 0 }, knobStyle]}>
        <LiquidGlassSurface
          radius={knobH / 2}
          preset="knob"
          surfaceColor="#FFFFFF"
          shadow={{ radius: 4, dy: 1, color: "#000000", alpha: 0.12 }}
          highlight={{ ambient: true, width: 0.5, blur: 0.3, alpha: 0.6 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </Pressable>
  );
}
