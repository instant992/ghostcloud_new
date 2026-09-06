import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle as SvgCircle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors, isLightPalette, useTheme } from "../theme";

export type TabChainItem = {
  key: string;
  name: string;
  icon: string;
  outline: string;
  label: string;
};

const R = 26; // радиус круга вкладки
const D = 70; // расстояние между центрами (зазор между кругами)
const RING = 64; // диаметр активного круга
const PAD = 12;

/** Таб-бар основной темы: увеличенные круги с серой обводкой, соединённые
 *  прямыми серыми перемычками с фоном внутри («бусины на дорожке»).
 *  Позади меню нет никакой плашки — только сами круги и перемычки.
 *  Активная вкладка — крупный яркий круг, скользящий вдоль цепочки. */
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
  const light = isLightPalette();
  // Перемычки и обводки: на светлой теме светло-серые (не бросаются в глаза),
  // на тёмной — как раньше (тёмный фон + серая рамка)
  const connFill = light ? "#E4E1EE" : "#2E2E36";
  const connStroke = light ? "rgba(160,158,175,0.45)" : "rgba(165,165,175,0.55)";
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
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="gcTabActiveGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#B18CFF" />
            <Stop offset="1" stopColor={colors.accentDeep} />
          </LinearGradient>
        </Defs>
        {/* Перемычки между кругами: прямые, серые — серый фон внутри и серая
            рамка; круги «нанизаны» сверху */}
        {items.slice(0, -1).map((it, i) => {
          const x1 = centers[i] + R - 8; // небольшой заход под края кругов
          const x2 = centers[i + 1] - R + 8;
          const h = 40;
          return (
            <Rect
              key={`b-${it.key}`}
              x={x1}
              y={cy - h / 2}
              width={x2 - x1}
              height={h}
              fill={connFill}
              stroke={connStroke}
              strokeWidth={1.2}
            />
          );
        })}
        {/* Круги: заливка цветом экрана + серая обводка */}
        {items.map((it, i) => (
          <SvgCircle
            key={`c-${it.key}`}
            cx={centers[i]}
            cy={cy}
            r={R}
            fill={colors.bg}
            stroke={connStroke}
            strokeWidth={2}
          />
        ))}
        {/* Активный круг */}
        <SvgCircle
          cx={PAD + R + D * (focusedIndex >= 0 ? focusedIndex : 0)}
          cy={cy}
          r={RING / 2 - 2.5}
          fill="url(#gcTabActiveGrad)"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={1.5}
          opacity={focusedIndex >= 0 ? 1 : 0}
        />
      </Svg>

      {/* Свечение активного круга — анимированное, скользит вместе с ним */}
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
          <SvgCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RING / 2 - 4.5}
            fill="none"
            stroke={colors.accent}
            strokeOpacity={0.4}
            strokeWidth={4}
          />
        </Svg>
      </Animated.View>

      {/* Иконки неактивных вкладок */}
      {items.map((it, i) => (
        <View
          key={`i-${it.key}`}
          style={[styles.iconBox, { left: centers[i] - R, top: cy - R }]}
          pointerEvents="none"
        >
          <Ionicons name={it.outline as any} size={24} color={colors.textDim} />
        </View>
      ))}

      {/* Иконка активной вкладки */}
      <View
        style={[styles.iconBox, styles.activeIconBox, { left: PAD + R - RING / 2 + (RING / 2 - 15), top: cy - 15 }]}
        pointerEvents="none"
      >
        <Animated.View style={{ opacity: animO, transform: [{ translateX: animX }] }}>
          {focusedIndex >= 0 && (
            <Ionicons name={items[focusedIndex].icon as any} size={28} color="#fff" />
          )}
        </Animated.View>
      </View>

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
    activeIconBox: {
      width: 28,
      height: 28,
    },
    activeWrap: {
      position: "absolute",
      width: RING,
      height: RING,
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
