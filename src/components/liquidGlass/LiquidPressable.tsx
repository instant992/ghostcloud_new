import React, { useCallback, useState } from "react";
import { StyleSheet, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  ReduceMotion,
} from "react-native-reanimated";
import { BlurMask, Canvas, Circle, Fill, Group } from "@shopify/react-native-skia";

/**
 * Нажимной слой из каталога Backdrop (Kyant0/AndroidLiquidGlass).
 *
 * 1:1 с InteractiveHighlight + layerBlock из LiquidButton/LiquidBottomTabs:
 *  - scale = 1 + (pressedScale-1) * pressProgress, spring(dampingRatio=0.5,
 *    stiffness=300). В reanimated damping = 2ζ√(k·m) = 2·0.5·√300 ≈ 17.32;
 *  - подсветка: белый overlay 0.08·progress + мягкое пятно под пальцем,
 *    blend Plus. Прозрачность слоя и центр пятна — SharedValue на UI-потоке
 *    (opacity/cx/cy — top-level props узлов Skia, анимируются без JS-рендера).
 *
 * Пятно сделано размытым Circle (а не RadialGradient): у Circle cx/cy —
 * top-level props и корректно «ловятся» аниматором, а центр градиента
 * (вложенный в vec-объект) на UI-потоке не разворачивается.
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
  const press = useSharedValue(0);
  const posX = useSharedValue(0);
  const posY = useSharedValue(0);
  const [box, setBox] = useState({ w: 1, h: 1 });

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (pressedScale - 1) * press.value }],
  }));

  const down = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      posX.value = e.nativeEvent.locationX;
      posY.value = e.nativeEvent.locationY;
      press.value = withSpring(1, LIQUID_SPRING);
    },
    [disabled, posX, posY, press]
  );
  const move = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      posX.value = e.nativeEvent.locationX;
      posY.value = e.nativeEvent.locationY;
    },
    [disabled, posX, posY]
  );
  const up = useCallback(() => {
    if (disabled) return;
    press.value = withSpring(0, LIQUID_SPRING);
  }, [disabled, press]);

  const spotR = Math.max(box.w, box.h) * 0.6;

  return (
    <Animated.View
      style={[scaleStyle, style]}
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
        <Canvas
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, radius ? { borderRadius: radius, overflow: "hidden" } : null]}
        >
          <Group blendMode="plus" opacity={press}>
            <Fill color="rgba(255,255,255,0.08)" />
            <Circle cx={posX} cy={posY} r={spotR} color="rgba(255,255,255,0.15)">
              <BlurMask blur={spotR * 0.5} style="normal" />
            </Circle>
          </Group>
        </Canvas>
      )}
    </Animated.View>
  );
}
