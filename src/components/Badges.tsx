import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { BASE_URL } from "../api";
import type { UserBadge } from "../context";
import { showToast } from "./Toast";

/** Цвета значков по типу — как в эталонном приложении. */
const BADGE_COLORS: Record<string, string> = {
  developer: "#9C27B0",
  tester: "#4CAF50",
  sponsor: "#FF9800",
  donor: "#E53935",
};

/** Описания значков — показываются сверху при тапе. */
const BADGE_DESCRIPTIONS: Record<string, string> = {
  developer: "Владелец FoxCloud и GhostCloud",
  tester: "За помощь в тестировании приложения",
  sponsor: "За пополнение от 444 ₽ за 24 часа",
  donor: "Поддержал разработку на 500+ рублей",
};

/** Пульсирующая анимация переливания (как у эталона: 3 с туда-обратно). */
function useShimmer(): Animated.Value {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [anim]);
  return anim;
}

/** Форма сердца (viewBox 24×24) */
const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

let heartIdSeq = 0;

/** Сердечко спонсора: переливание цветов внутри самого сердца
 *  (два голографических градиента плавно перетекают друг в друга).
 *  Тап — уведомление сверху о том, за что оно выдано. */
export function SponsorHeart({ size = 20 }: { size?: number }) {
  const ids = useRef(`hgrad${++heartIdSeq}`).current;
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        // переливание: второй градиент проявляется и гаснет
        Animated.sequence([
          Animated.timing(fade, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        // лёгкая пульсация сердца
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.09, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [fade, scale]);

  const box = Math.round(size * 1.4);

  return (
    <Pressable
      onPress={() => showToast("Спонсор — пополнение от 444 ₽ за 24 часа", "top")}
      accessibilityRole="button"
      accessibilityLabel="Спонсор — пополнение от 444 рублей за 24 часа"
      hitSlop={6}
    >
      <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
          {/* Базовый градиент: фиолетовый → розовый → оранжевый */}
          <Svg viewBox="0 0 24 24" width={size} height={size}>
            <Defs>
              <LinearGradient id={`${ids}a`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#7C3AED" />
                <Stop offset="0.5" stopColor="#FF5F93" />
                <Stop offset="1" stopColor="#FF9800" />
              </LinearGradient>
            </Defs>
            <Path d={HEART_PATH} fill={`url(#${ids}a)`} />
          </Svg>
          {/* Второй градиент (голубой → малиновый → янтарный) — переливание внутри сердца */}
          <Animated.View style={{ position: "absolute", top: 0, left: 0, width: size, height: size, opacity: fade }}>
            <Svg viewBox="0 0 24 24" width={size} height={size}>
              <Defs>
                <LinearGradient id={`${ids}b`} x1="1" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#38BDF8" />
                  <Stop offset="0.5" stopColor="#E879F9" />
                  <Stop offset="1" stopColor="#FBBF24" />
                </LinearGradient>
              </Defs>
              <Path d={HEART_PATH} fill={`url(#${ids}b)`} />
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** Верифицированный значок (галочка в круге) для типов
 *  developer / tester / sponsor / donor. Тап — описание сверху.
 *  Значок донора, как в эталоне, не отображается. */
export function VerifiedBadge({ type, size = 18 }: { type: string; size?: number }) {
  if (type === "donor") return null;
  const color = BADGE_COLORS[type] || "#4CAF50";
  const desc = BADGE_DESCRIPTIONS[type] || "";
  const anim = useShimmer();
  const glowOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });

  return (
    <Pressable
      onPress={() => desc && showToast(desc, "top")}
      accessibilityRole="button"
      accessibilityLabel={desc || type}
      hitSlop={6}
    >
      <View style={{ width: size + 6, height: size + 6, alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: glowOpacity,
          }}
        />
        <Ionicons name="checkmark-circle" size={size} color={color} />
      </View>
    </Pressable>
  );
}

/** Кастомный бейдж с изображением (выдаётся админом).
 *  Тап — название/описание бейджа сверху. */
export function CustomBadge({ badge, size = 20 }: { badge: UserBadge; size?: number }) {
  const imageUrl = badge.image_url.startsWith("/")
    ? `${BASE_URL}${badge.image_url}`
    : badge.image_url;

  return (
    <Pressable
      onPress={() => showToast(badge.description || badge.name, "top")}
      accessibilityRole="button"
      accessibilityLabel={`Бейдж: ${badge.name}. ${badge.description || ""}`}
      hitSlop={6}
      style={{ width: size, height: size, borderRadius: size * 0.2, overflow: "hidden" }}
    >
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        defaultSource={undefined}
      />
    </Pressable>
  );
}
