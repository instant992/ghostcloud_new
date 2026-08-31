import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

/** Сердечко спонсора: оригинальная картинка из ресурсов (sponsor_heart)
 *  + переливание цветов внутри неё: поверх лежат две такие же картинки,
 *  подкрашенные по форме сердца (tintColor), которые по очереди проявляются.
 *  Тап — уведомление сверху о том, за что оно выдано. */
export function SponsorHeart({ size = 20 }: { size?: number }) {
  const fadeA = useRef(new Animated.Value(0)).current;
  const fadeB = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Общий период 5.6 с: цвет А проявляется и гаснет, затем цвет Б — и так по кругу
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(fadeA, { toValue: 0.55, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(fadeA, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(fadeA, { toValue: 0, duration: 2800, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(fadeB, { toValue: 0, duration: 2800, useNativeDriver: true }),
          Animated.timing(fadeB, { toValue: 0.55, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(fadeB, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 2800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [fadeA, fadeB, scale]);

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
          {/* Оригинальная картинка спонсорского сердечка */}
          <Image
            source={{ uri: "sponsor_heart" }}
            style={{ width: size, height: size }}
            resizeMode="contain"
          />
          {/* Переливание: две подкрашенные по форме копии, проявляющиеся по очереди */}
          <Animated.Image
            source={{ uri: "sponsor_heart" }}
            resizeMode="contain"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size,
              height: size,
              opacity: fadeA,
              tintColor: "#7C3AED",
            }}
          />
          <Animated.Image
            source={{ uri: "sponsor_heart" }}
            resizeMode="contain"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size,
              height: size,
              opacity: fadeB,
              tintColor: "#38BDF8",
            }}
          />
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
