import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useTheme } from "../theme";

type ToastMsg = { id: number; text: string };

let pushFn: ((text: string) => void) | null = null;

/** Глобальный тост в духе GhostToast из Flutter-версии */
export function showToast(text: string) {
  pushFn?.(text);
}

export function ToastHost() {
  useTheme();
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  useEffect(() => {
    pushFn = (text: string) => {
      setToast({ id: Date.now(), text });
    };
    return () => {
      pushFn = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(() =>
        setToast(null)
      );
    }, 2200);
    return () => clearTimeout(timer.current);
  }, [toast, opacity]);

  if (!toast) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <Text style={styles.text}>{toast.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 96,
    backgroundColor: "rgba(20,16,36,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    zIndex: 1000,
  },
  text: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center" },
});
