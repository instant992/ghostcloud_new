import React from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../context";
import { colors, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";
import { GlassCard } from "./liquidGlass/GlassCard";

/** Secondary home entry; stays in the content flow, away from VPN controls. */
export function BugReportsButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const { session, isFoxcloud } = useApp();
  const nav = useNavigation<any>();

  if (!session || isFoxcloud) return null;

  const onPress = () => nav.navigate("Bugs");
  const content = (
    <>
      <Ionicons name="bug-outline" size={17} color={colors.textDim} />
      <Text style={[styles.label, { color: colors.textDim }]}>Ошибки приложения</Text>
      <Ionicons name="chevron-forward" size={13} color={colors.textFaint} />
    </>
  );

  if (theme.style === "glass") {
    return (
      <GlassCard
        radius={22}
        intensity={35}
        style={[styles.button, style]}
        onPress={onPress}
        accessibilityLabel="Ошибки приложения"
      >
        {content}
      </GlassCard>
    );
  }

  return (
    <PressableScale
      style={[
        styles.button,
        { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ошибки приложения"
      accessibilityHint="Открывает список ошибок и отправку отчёта"
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: "center",
    maxWidth: "100%",
    minHeight: 44,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: { fontSize: 13, fontWeight: "500", flexShrink: 1 },
});
