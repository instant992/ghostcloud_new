import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, useTheme } from "../theme";

export function TabIcon({
  name,
  focused,
  label,
}: {
  name: string;
  focused: boolean;
  label?: string;
}) {
  useTheme();
  const styles = makeStyles();
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [focused, anim]);

  // Активная вкладка заметно крупнее и подсвечена — как на референсе
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.24] });
  const labelOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.badge,
          focused ? styles.badgeOn : styles.badgeOff,
          { transform: [{ scale }] },
        ]}
      >
        <Ionicons
          name={name as any}
          size={focused ? 24 : 21}
          color={focused ? "#fff" : colors.textDim}
        />
      </Animated.View>
      {!!label && (
        <Animated.Text
          style={[styles.label, { opacity: labelOpacity }]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      )}
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", minWidth: 56 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOff: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeOn: {
    backgroundColor: colors.accentDeep,
    borderWidth: 1.5,
    borderColor: colors.accent,
    elevation: 8,
    shadowColor: colors.accent,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
    height: 16,
  },
});
