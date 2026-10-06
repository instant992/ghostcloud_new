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
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { colors, isLightPalette, useTheme } from "../../theme";

/**
 * Порт `LiquidBottomTabs` + `LiquidBottomTab` из каталога Backdrop
 * (Kyant0/AndroidLiquidGlass, Apache-2.0).
 *
 * Точные параметры каталога:
 *  - ПАНЕЛЬ: `Capsule()`, высота 64dp, padding 4dp, эффекты
 *    `vibrancy() + blur(8dp) + lens(24dp, 24dp)`, подложка containerColor =
 *    `#FAFAFA@0.4` (светлая) / `#121212@0.4` (тёмная); при нажатии
 *    `scale = 1 + 16dp/width`.
 *  - ИНДИКАТОР: высота 56dp, ширина = (W − 8dp)/tabsCount,
 *    `translationX = index·tabWidth`. В ПОКОЕ у него НЕТ стеклянных эффектов:
 *    `lens(10dp·progress, 14dp·progress, chromaticAberration)` при progress=0
 *    вырождается в ноль, `highlight`/`shadow`/`innerShadow` тоже умножаются на
 *    progress. Видна только подложка `White@0.1` (тёмная тема) /
 *    `Black@0.1` (светлая) — поэтому индикатор реализован обычными View,
 *    а не Skia-снимком: это и точнее, и не требует перерендера при скольжении.
 *  - АКЦЕНТНЫЙ КОНТЕНТ: в каталоге индикатор сэмплирует «тонированный» слой
 *    (`ColorFilter.tint(accentColor)`), поэтому внутри него иконки и подписи
 *    акцентные, а снаружи — обычные. Здесь то же самое сделано скользящим окном:
 *    под индикатором лежит слой акцентных вкладок, который контр-сдвигается на
 *    −translationX, чтобы оставаться выровненным по базовому ряду.
 *  - ВКЛАДКА (`LiquidBottomTab`): колонка иконка 28dp + подпись 12sp,
 *    шаг 2dp, `scale = lerp(1, 1.2, pressProgress)`.
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

  // containerColor панели (точные значения каталога).
  const containerColor = light ? "rgba(250,250,250,0.4)" : "rgba(18,18,18,0.4)";
  // Подложка индикатора в покое: White@0.1 (тёмная) / Black@0.1 (светлая).
  const veil = light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)";

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
    <LiquidGlassSurface
      radius={height / 2}
      preset="tabBar"
      surfaceColor={containerColor}
      borderWidth={0}
      style={[{ height }, style]}
    >
      <View
        style={{ flex: 1, padding: pad }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) setBox((p) => (Math.abs(p.w - w) > 0.5 ? { w } : p));
        }}
      >
        {/* Базовый ряд: все вкладки в обычном цвете (как content панели). */}
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

        {/* Скользящий индикатор: окно шириной tabWidth, внутри — акцентный ряд. */}
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
                borderRadius: indicatorH / 2,
                overflow: "hidden",
                backgroundColor: veil,
              },
              indicatorStyle,
            ]}
          >
            {/* ВАЖНО: translateX и scale — в РАЗНЫХ Animated.View. Два
                useAnimatedStyle с `transform` в одном массиве стилей не
                складываются: второй затирает первый. */}
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
    </LiquidGlassSurface>
  );
}

const tabStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flex: 1 },
  slot: { alignItems: "center", justifyContent: "center", height: "100%" },
  tab: { alignItems: "center", justifyContent: "center", gap: 2 },
  label: { fontSize: 12, fontWeight: "600" },
});
