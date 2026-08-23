import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Ionicons
      name={name as any}
      size={23}
      color={focused ? colors.accent : colors.textFaint}
    />
  );
}
