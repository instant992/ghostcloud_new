import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { colors, useTheme } from "../theme";

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

  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.backdrop}>
      <Image source={{ uri: "app_icon" }} style={styles.logo} resizeMode="cover" />
      <Text style={styles.appName}>GhostCloud</Text>
      <Text style={styles.factLabel}>А вы знали?</Text>
      <Text style={styles.fact}>{fact}</Text>
      <ActivityIndicator color={colors.accent} style={{ marginTop: 28 }} />
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
    logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 12 },
    appName: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      marginBottom: 26,
    },
    factLabel: {
      color: colors.accent,
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
