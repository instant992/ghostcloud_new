import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle as SvgCircle, Defs, LinearGradient, Mask, Rect, Stop } from "react-native-svg";
import { colors, useTheme } from "../theme";

export type TabChainItem = {
  key: string;
  name: string;
  icon: string;
  outline: string;
  label: string;
};

const R = 23; // радиус неактивного круга
const D = 36; // расстояние между центрами (круги заходят друг на друга на 10 пкс)
const RING = 54; // диаметр активного круга
const PAD = 10;

/** Таб-бар основной темы в стиле референса: неактивные вкладки образуют
 *  ЕДИНУЮ цепочку — круги заходят друг на друга, их заливка сливается с фоном
 *  экрана, а видимый контур — только внешняя граница объединённой фигуры
 *  (пересечения окружностей скрыты маской). Активная вкладка — крупный яркий
 *  круг, лежащий поверх цепочки. Никакой фоновой плашки позади нет. */
export function TabChain({
  items,
  focusedIndex,
  onPress,
}: {
  items: TabChainItem[];
  focusedIndex: number;
  onPress: (index: number) => void;
}) {
  useTheme();
  const styles = makeStyles();
  const n = items.length;
  const W = PAD * 2 + R * 2 + D * (n - 1);
  const H = PAD * 2 + RING;
  const cy = H / 2;
  const centers = items.map((_, i) => PAD + R + i * D);

  const animX = useRef(new Animated.Value((focusedIndex >= 0 ? focusedIndex : 0) * D)).current;
  const animO = useRef(new Animated.Value(focusedIndex >= 0 ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animX, {
        toValue: (focusedIndex >= 0 ? focusedIndex : 0) * D,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(animO, {
        toValue: focusedIndex >= 0 ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focusedIndex, animX, animO]);

  return (
    <View style={{ width: W, height: H }}>
      {/* Цепочка: заливка цветом экрана + контур только по внешней границе
          (маска прячет дуги, проходящие внутри соседних кругов) */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          {items.map((it, i) => (
            <Mask key={`m-${it.key}`} id={`gcTabMask-${i}`}>
              <Rect width={W} height={H} fill="#ffffff" />
              {items.map((_, j) =>
                j !== i ? <SvgCircle key={j} cx={centers[j]} cy={cy} r={R} fill="#000000" /> : null
              )}
            </Mask>
          ))}
        </Defs>
        {/* Заливка кругов цветом фона экрана — «подложки» не видно вообще */}
        {items.map((it, i) => (
          <SvgCircle key={`f-${it.key}`} cx={centers[i]} cy={cy} r={R} fill={colors.bg} />
        ))}
        {/* Контур цепочки — только внешняя граница объединённой фигуры */}
        {items.map((it, i) => (
          <SvgCircle
            key={`s-${it.key}`}
            cx={centers[i]}
            cy={cy}
            r={R}
            fill="none"
            stroke="rgba(190,180,220,0.45)"
            strokeWidth={1.2}
            mask={`url(#gcTabMask-${i})`}
          />
        ))}
      </Svg>

      {/* Иконки неактивных вкладок */}
      {items.map((it, i) => (
        <View
          key={`i-${it.key}`}
          style={[styles.iconBox, { left: centers[i] - R, top: cy - R }]}
          pointerEvents="none"
        >
          <Ionicons name={it.outline as any} size={22} color={colors.textDim} />
        </View>
      ))}

      {/* Активная вкладка — яркий круг поверх цепочки */}
      <Animated.View
        style={[
          styles.activeWrap,
          {
            top: cy - RING / 2,
            left: PAD + R - RING / 2,
            opacity: animO,
            transform: [{ translateX: animX }],
          },
        ]}
        pointerEvents="none"
      >
        <Svg width={RING} height={RING}>
          <Defs>
            <LinearGradient id="gcTabActiveGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#B18CFF" />
              <Stop offset="1" stopColor={colors.accentDeep} />
            </LinearGradient>
          </Defs>
          <SvgCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RING / 2 - 4.5}
            fill="none"
            stroke={colors.accent}
            strokeOpacity={0.4}
            strokeWidth={4}
          />
          <SvgCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RING / 2 - 2.5}
            fill="url(#gcTabActiveGrad)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={1.5}
          />
        </Svg>
        <View style={styles.activeIcon}>
          {focusedIndex >= 0 && (
            <Ionicons name={items[focusedIndex].icon as any} size={25} color="#fff" />
          )}
        </View>
      </Animated.View>

      {/* Зоны нажатия */}
      <View style={styles.hitRow}>
        {items.map((it, i) => (
          <Pressable
            key={it.key}
            style={{ flex: 1 }}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: focusedIndex === i }}
            onPress={() => onPress(i)}
          />
        ))}
      </View>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    iconBox: {
      position: "absolute",
      width: R * 2,
      height: R * 2,
      alignItems: "center",
      justifyContent: "center",
    },
    activeWrap: {
      position: "absolute",
      width: RING,
      height: RING,
    },
    activeIcon: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    hitRow: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
    },
  });
