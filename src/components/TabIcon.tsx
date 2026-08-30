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
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [focused, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
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
          size={23}
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
  wrap: { alignItems: "center", justifyContent: "center", minWidth: 64 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
    height: 16,
  },
});
