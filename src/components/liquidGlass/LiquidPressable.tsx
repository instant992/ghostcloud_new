import React, { useCallback, useState } from "react";
import { Animated, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { ReduceMotion } from "react-native-reanimated";

/**
 * Нажимной слой темы Liquid Glass.
 *
 * Прежняя версия рисовала блик под пальцем Skia-канвасом (Circle + BlurMask,
 * blend Plus). Вместе со всем Skia-движком темы канвас удалён; нажимная
 * подсветка теперь — обычный RN-слой (белый overlay + мягкое радиальное пятно
 * через два вложенных View с opacity), анимируется Reanimated-совместимой
 * пружиной LIQUID_SPRING (та же, что у LiquidToggle/LiquidSlider/док-меню).
 *
 * LIQUID_SPRING экспортируется как общая константа пружины темы (порт
 * DampedDragAnimation каталога Backdrop: dampingRatio 0.5, stiffness 300 →
 * reanimated damping = 2ζ√(k·m) ≈ 17.32). Используется Reanimated-контролами
 * (LiquidToggle/LiquidSlider/док); внутри LiquidPressable — эквивалентная
 * пружина RN Animated (speed/bounciness), т.к. конфиг Reanimated ей не подходит.
 */
export const LIQUID_SPRING = {
  damping: 17.32,
  stiffness: 300,
  mass: 1,
  reduceMotion: ReduceMotion.System,
} as const;

export function LiquidPressable({
  children,
  pressedScale = 1.08,
  highlight = true,
  style,
  radius,
  disabled,
}: {
  children: React.ReactNode;
  /** Масштаб при нажатии (LiquidButton: 1 + 4dp/height). */
  pressedScale?: number;
  /** Мягкая подсветка под пальцем. */
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Радиус скругления для клипа подсветки (по контейнеру). */
  radius?: number;
  disabled?: boolean;
}) {
  const press = useState(() => new Animated.Value(0))[0];
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState({ w: 1, h: 1 });

  const down = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      setPos({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
      Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 8 }).start();
    },
    [disabled, press]
  );
  const move = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      setPos({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
    },
    [disabled]
  );
  const up = useCallback(() => {
    if (disabled) return;
    Animated.spring(press, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 8 }).start();
  }, [disabled, press]);

  const spotR = Math.max(box.w, box.h) * 0.6;
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, pressedScale] });

  return (
    <Animated.View
      style={[{ transform: [{ scale }] }, style]}
      onTouchStart={down}
      onTouchMove={move}
      onTouchEnd={up}
      onTouchCancel={up}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        const h = e.nativeEvent.layout.height;
        if (w > 0 && h > 0) setBox((p) => (Math.abs(p.w - w) > 0.5 || Math.abs(p.h - h) > 0.5 ? { w, h } : p));
      }}
    >
      {children}
      {highlight && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            radius ? { borderRadius: radius, overflow: "hidden" } : null,
            { opacity: press },
          ]}
        >
          {/* Белый overlay + мягкое пятно под пальцем (упрощённый InteractiveHighlight). */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.08)" }]} />
          <View
            style={{
              position: "absolute",
              left: pos.x - spotR,
              top: pos.y - spotR,
              width: spotR * 2,
              height: spotR * 2,
              borderRadius: spotR,
              backgroundColor: "rgba(255,255,255,0.12)",
            }}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}
