import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { colors, useTheme, BRAND_PURPLE } from "../theme";

/** Кадры лисы с вырезанным фоном (drawable-nodpi/fox_frame_*.png, прозрачные).
 *  Сделаны из анимации пользователя: воксельная лиса, чёрный фон убран
 *  flood-fill от границ (чёрные детали лисы — нос/уши/лапы — сохранены). */
const FOX_FRAMES = ["fox_frame_0", "fox_frame_1", "fox_frame_2"];
/** Длительность кадра из исходника: 2.4 с / 3 кадра = 800 мс. */
const FOX_FRAME_MS = 800;

const FOX_FACTS = [
  "Лиса слышит мышь под слоем снега глубиной до метра — и прыгает точно в точку.",
  "Лисы используют магниторецепцию: перед прыжком они ловят магнитное поле Земли, чтобы прицелиться.",
  "Пёсий лай лисы почти неотличим от собачьего — их легко спутать в лесу ночью.",
  "Лиса — единственный представитель псовых, который регулярно взбирается на деревья.",
  "Усатая морда лисы — не для красоты: вибриссы помогают ориентироваться в темноте.",
  "Лисы запасают еду впрок и помнят десятки своих тайников.",
  "Белый кончик хвоста есть у большинства лис, даже у тёмных морф.",
  "Лисы играют с добычей не из жестокости, а оттачивая охотничьи навыки — как кошки.",
  "Скорость лисы на короткой дистанции достигает 50 км/ч.",
  "Лисы живут на всех континентах, кроме Антарктиды.",
  "В Японии лиса кицунэ считается волшебным существом, способным менять облик.",
  "Зрачки лисы, как у кошек, сужаются в вертикальные щёлки при ярком свете.",
  "Нора лисьего семейства может иметь более десяти выходов и передаваться поколениями.",
  "Лисы умеют мурлыкать — совсем как кошки.",
  "Острота слуха лисы позволяет ей ловить насекомых в полной темноте на звук.",
];

export default function FoxSplash({ onDone }: { onDone: () => void }) {
  useTheme();
  const styles = makeStyles();
  const fact = useMemo(() => FOX_FACTS[Math.floor(Math.random() * FOX_FACTS.length)], []);

  // Покадровая анимация лисы: 3 кадра по 800 мс, зацикленно (splash живёт 2.6 с).
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % FOX_FRAMES.length;
      setFrame(frameRef.current);
    }, FOX_FRAME_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.backdrop}>
      {/* Анимированная лиса вместо статичного логотипа. Все три кадра
          отрисованы стопкой и переключаются по opacity — так RN не ждёт
          decode каждого кадра заново (иначе был бы фликер). */}
      <View style={styles.logo}>
        {FOX_FRAMES.map((uri, i) => (
          <Image
            key={uri}
            source={{ uri }}
            style={[styles.logoFrame, { opacity: i === frame ? 1 : 0 }]}
            resizeMode="contain"
          />
        ))}
      </View>
      <Text style={styles.appName}>GhostCloud</Text>
      <Text style={styles.factLabel}>А вы знали?</Text>
      <Text style={styles.fact}>{fact}</Text>
      <ActivityIndicator color={BRAND_PURPLE} style={{ marginTop: 28 }} />
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    backdrop: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.bg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      padding: 36,
      zIndex: 999,
    },
    // Лиса крупнее логотипа (пропорции кадра ~1.37), контейнер под стопку кадров.
    logo: { width: 132, height: 96, marginBottom: 12, alignItems: "center", justifyContent: "center" },
    logoFrame: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
    appName: {
      color: BRAND_PURPLE,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 26,
    },
    factLabel: {
      color: BRAND_PURPLE,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    fact: {
      color: colors.textDim,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
  });
