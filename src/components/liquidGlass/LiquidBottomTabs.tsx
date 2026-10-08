import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  ReduceMotion,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LiquidGlassView } from "react-native-liquid-glassmorphism";
import { colors, isLightPalette, useTheme } from "../../theme";

/**
 * Нижнее меню темы Liquid Glass на движке AGSL
 * (react-native-liquid-glassmorphism).
 *
 * Прежний Skia-порт каталога Backdrop удалён вместе с движком; визуальная
 * схема каталога сохранена: стеклянная капсула 64dp (пресет floatingTabBar —
 * полная толщина линзы, живая кромка) и скользящий индикатор-«капля» —
 * ОТДЕЛЬНАЯ стеклянная поверхность, которая преломляет капсулу под собой.
 * Две стеклянные поверхности на весь док: каждая захватывает свой бэкдроп,
 * плодить их на вкладку нельзя.
 *
 * Контент вкладок дублирован акцентным слоем под каплей с контр-сдвигом
 * (приём каталога ColorFilter.tint): внутри индикатора иконки/подписи
 * акцентные, снаружи — обычные.
 */

export type LiquidTabItem = {
  key: string;
  label: string;
  icon: string;
  iconActive: string;
};

export interface LiquidBottomTabsProps {
  items: LiquidTabItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Высота панели (каталог: 64). */
  height?: number;
  style?: any;
}

export function LiquidBottomTabs({
  items,
  selectedIndex,
  onSelect,
  height = 64,
  style,
}: LiquidBottomTabsProps) {
  useTheme();
  const light = isLightPalette();
  const count = Math.max(1, items.length);
  const pad = 4; // padding панели из каталога
  const indicatorH = height - pad * 2; // 56dp при height=64

  // Вуаль капли в покое (как White@0.1 / Black@0.1 каталога) — лёгкая,
  // чтобы акцентный контент читался, но стекло оставалось стеклом.
  const dropTint = light ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)";

  const [box, setBox] = React.useState({ w: 0 });
  const tabWidth = box.w > 0 ? (box.w - pad * 2) / count : 0;

  // Плавное скольжение индикатора (spring из DampedDragAnimation).
  const indexAnim = useSharedValue(selectedIndex);
  const press = useSharedValue(0);

  useEffect(() => {
    indexAnim.value = withSpring(selectedIndex, {
      damping: 17.32,
      stiffness: 300,
      mass: 1,
      reduceMotion: ReduceMotion.System,
    });
  }, [selectedIndex, indexAnim]);

  // ВАЖНО: translateX и scale — в РАЗНЫХ Animated.View. Два useAnimatedStyle
  // с `transform` в одном массиве стилей не складываются: второй затирает первый.
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indexAnim.value * tabWidth }],
  }));

  // Контр-сдвиг акцентного слоя: контент остаётся выровненным по базовому ряду.
  const accentLayerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -indexAnim.value * tabWidth }],
  }));

  // Масштаб вкладки: lerp(1, 1.2, pressProgress) — из LocalLiquidBottomTabScale.
  const activeScale = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.2 * press.value }],
  }));

  const tabContent = (it: LiquidTabItem, accent: boolean, active: boolean) => (
    <View style={tabStyles.tab} pointerEvents="none">
      <Ionicons
        name={((active ? it.iconActive : it.icon) as any)}
        size={24}
        color={accent ? colors.accent : colors.text}
      />
      <Text
        style={[tabStyles.label, { color: accent ? colors.accent : colors.text }]}
        numberOfLines={1}
      >
        {it.label}
      </Text>
    </View>
  );

  const pressIn = () => {
    press.value = withSpring(1, { damping: 15, stiffness: 300, mass: 1, reduceMotion: ReduceMotion.System });
  };
  const pressOut = () => {
    press.value = withSpring(0, { damping: 15, stiffness: 300, mass: 1, reduceMotion: ReduceMotion.System });
  };

  return (
    <View style={[{ height }, style]}>
      {/* Капсула панели: пресет floatingTabBar библиотеки (полная линза,
          живая кромка) — стекло НА ВСЮ ширину дока, контент вкладок — дети. */}
      <LiquidGlassView
        preset="floatingTabBar"
        borderRadius={height / 2}
        tintColor={light ? "rgba(250,250,250,0.28)" : "rgba(18,18,18,0.32)"}
        legibilityFloor={light ? 0.18 : 0.12}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={{ flex: 1, padding: pad }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) setBox((p) => (Math.abs(p.w - w) > 0.5 ? { w } : p));
        }}
      >
        {/* Базовый ряд: все вкладки обычным цветом (как content панели). */}
        <View style={tabStyles.row} pointerEvents="box-none">
          {items.map((it, i) => (
            <Pressable
              key={it.key}
              style={[tabStyles.slot, { width: tabWidth || undefined, flex: tabWidth ? undefined : 1 }]}
              onPress={() => {
                if (i === selectedIndex) return;
                Haptics.selectionAsync().catch(() => {});
                onSelect(i);
              }}
              onPressIn={pressIn}
              onPressOut={pressOut}
              accessibilityRole="tab"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: i === selectedIndex }}
            >
              <Animated.View style={activeScale}>{tabContent(it, false, i === selectedIndex)}</Animated.View>
            </Pressable>
          ))}
        </View>

        {/* Скользящая капля-индикатор: отдельная стеклянная поверхность —
            преломляет капсулу/фон под собой, как «glass drop» в демо. */}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: pad,
                top: pad,
                width: tabWidth,
                height: indicatorH,
              },
              indicatorStyle,
            ]}
          >
            <LiquidGlassView
              variant="regular"
              borderRadius={indicatorH / 2}
              tintColor={dropTint}
              blurRadius={2}
              thickness={1.2}
              style={StyleSheet.absoluteFill}
            />
            {/* Акцентный ряд внутри капли, контр-сдвинутый. */}
            <Animated.View style={[{ width: box.w - pad * 2, height: indicatorH }, accentLayerStyle]}>
              <View style={tabStyles.row}>
                {items.map((it) => (
                  <Animated.View key={it.key} style={[tabStyles.slot, { width: tabWidth }, activeScale]}>
                    {tabContent(it, true, true)}
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flex: 1 },
  slot: { alignItems: "center", justifyContent: "center", height: "100%" },
  tab: { alignItems: "center", justifyContent: "center", gap: 2 },
  label: { fontSize: 12, fontWeight: "600" },
});
