import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function TabIcon({
  name,
  focused,
  label,
}: {
  name: string;
  focused: boolean;
  label?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.badge, focused ? styles.badgeOn : styles.badgeOff]}>
        <Ionicons
          name={name as any}
          size={20}
          color={focused ? "#fff" : colors.textDim}
        />
      </View>
      {!!label && focused && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
  label: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },
});
