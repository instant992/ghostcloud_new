import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={[styles.badge, focused && styles.badgeOn]}>
      <Ionicons
        name={name as any}
        size={19}
        color={focused ? "#fff" : colors.textFaint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOn: {
    backgroundColor: colors.accentDeep,
  },
});
