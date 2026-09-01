import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors, useTheme } from "../theme";

const BASE = 46;
const RING = 54;

/** Вкладка основной темы в стиле референса: круги соединяются в цепочку
 *  (соседние касаются друг друга). Неактивные — тёмные круги с тонким
 *  контуром, активный — яркий круг крупнее, перекрывает соседние. */
export function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  useTheme();
  const styles = makeStyles();
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [focused, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const activeOpacity = anim;
  const inactiveOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.scaler, { transform: [{ scale }] }]}>
        {/* Основа — тёмный круг неактивной вкладки */}
        <View style={styles.baseCircle} />
        {/* Яркий круг активной вкладки поверх */}
        <Animated.View style={[styles.activeCircle, { opacity: activeOpacity }]} pointerEvents="none">
          <Svg width={RING} height={RING}>
            <Defs>
              <LinearGradient id="gcTabActive" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#B18CFF" />
                <Stop offset="1" stopColor={colors.accentDeep} />
              </LinearGradient>
            </Defs>
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RING / 2 - 4.5}
              fill="none"
              stroke={colors.accent}
              strokeOpacity={0.4}
              strokeWidth={4}
            />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RING / 2 - 2.5}
              fill="url(#gcTabActive)"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={1.5}
            />
          </Svg>
        </Animated.View>
        {/* Иконка неактивной вкладки */}
        <Animated.View style={[styles.iconLayer, { opacity: inactiveOpacity }]} pointerEvents="none">
          <Ionicons name={name as any} size={22} color={colors.textDim} />
        </Animated.View>
        {/* Иконка активной вкладки */}
        <Animated.View style={[styles.iconLayer, { opacity: activeOpacity }]} pointerEvents="none">
          <Ionicons name={name as any} size={25} color="#fff" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    wrap: { width: BASE, height: BASE, alignItems: "center", justifyContent: "center" },
    scaler: { width: BASE, height: BASE, alignItems: "center", justifyContent: "center" },
    baseCircle: {
      position: "absolute",
      width: BASE,
      height: BASE,
      borderRadius: BASE / 2,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: "rgba(190,180,220,0.4)",
    },
    activeCircle: {
      position: "absolute",
      width: RING,
      height: RING,
      left: (BASE - RING) / 2,
      top: (BASE - RING) / 2,
    },
    iconLayer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
  });
