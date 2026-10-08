import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { colors, useTheme, BRAND_PURPLE } from "../theme";

/** Кадры лисы с вырезанным фоном (drawable-nodpi/fox_frame_*.png, прозрачные).
 *  Сделаны из анимации пользователя minecraft-fox.gif.mp4: воксельная лиса,
 *  чёрный фон убран flood-fill от границ (чёрные детали — нос/уши/лапы —
 *  сохранены), кадры обрезаны по общему bbox 150×99. 14 кадров из 33 после
 *  дедупликации — полный цикл ~0.7 с, как в исходнике.
 *  PNG-путь вместо GIF: кастомный uri-резолвер ассетов регистрирует только
 *  png/jpg (embeddedAssetFileMap), GIF по uri: не отдаётся. */
const FOX_FRAMES = [
  "fox_frame_0",
  "fox_frame_1",
  "fox_frame_2",
  "fox_frame_3",
  "fox_frame_4",
  "fox_frame_5",
  "fox_frame_6",
  "fox_frame_7",
  "fox_frame_8",
  "fox_frame_9",
  "fox_frame_10",
  "fox_frame_11",
  "fox_frame_12",
  "fox_frame_13",
];
/** ~0.66 с / 14 кадров ≈ 47 мс; округляем до 50 — JS-таймер тянет спокойно. */
const FOX_FRAME_MS = 50;

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

  // Покадровая анимация: 14 кадров по 50 мс, зацикленно (splash живёт 2.6 с ≈ 4 цикла).
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
      {/* Анимированная лиса вместо статичного логотипа: все кадры лежат
          стопкой и переключаются по opacity — RN не передекодирует кадр и
          нет фликера. Прозрачный фон (кеинг из minecraft-fox.gif.mp4). */}
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
    // Лиса крупнее логотипа; пропорции кадра 150×99 (≈1.52). Контейнер под стопку кадров.
    logo: { width: 136, height: 90, marginBottom: 14 },
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
