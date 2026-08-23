import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={[styles.badge, focused ? styles.badgeOn : styles.badgeOff]}>
      <Ionicons
        name={name as any}
        size={20}
        color={focused ? "#fff" : colors.textDim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOff: {
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeOn: {
    backgroundColor: colors.accentDeep,
    borderWidth: 1,
    borderColor: colors.accent,
  },
});
