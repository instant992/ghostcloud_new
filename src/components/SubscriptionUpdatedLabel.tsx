import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { useApp } from "../context";
import { colors, useTheme } from "../theme";

/** Last successful subscription download; offline cache reads do not advance it. */
export function SubscriptionUpdatedLabel({ style }: { style?: StyleProp<TextStyle> }) {
  useTheme();
  const { subscriptionUpdatedAt } = useApp();
  const date = subscriptionUpdatedAt ? new Date(subscriptionUpdatedAt) : null;
  const label = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "ещё не обновлялась";
  return <Text style={[{ color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: "center" }, style]}>Подписка обновлена: {label}</Text>;
}
