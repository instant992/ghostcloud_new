import React, { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, useTheme } from "../theme";
import * as update from "../update";

export function UpdateLayout({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1 }}>{children}<UpdateBanner /></View>;
}

export function UpdateBanner() {
  const state = useSyncExternalStore(update.subscribe, update.getSnapshot);
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active" && previous !== "active") setDismissed(false);
      previous = next;
    });
    return () => subscription.remove();
  }, []);
  if (state.status !== "available" && state.status !== "downloading") return null;
  const busy = state.status === "downloading";
  if (dismissed && !busy) return null;
  const { info } = state;
  const dismiss = () => { if (!busy) setDismissed(true); };
  const action = () => { if (!busy) void update.downloadAndInstall(info); };
  const progress = busy && state.progress >= 0 ? `${Math.round(Math.min(1, state.progress) * 100)}%` : "…";
  return (
    <Modal transparent animationType="slide" visible onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} disabled={busy} accessibilityLabel="Закрыть окно обновления" />
        <View testID="app-update-sheet" accessibilityViewIsModal style={[styles.sheet, { backgroundColor: mode === "dark" ? "#141020" : "#F5F3FA", maxHeight: height * 0.75, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.icon}><MaterialIcons name="system-update" size={36} color="#7C4DFF" /></View>
          <Text style={[styles.title, { color: colors.text }]}>Доступно обновление!</Text>
          <Text style={[styles.version, { color: colors.textDim }]}>Версия {info.version}{info.apkSize > 0 ? `  •  ${update.formatSizeMb(info.apkSize)}` : ""}</Text>
          <ScrollView style={styles.changes}>
            {info.changelog.split("\n").map(line => line.trim()).filter(Boolean).map((line, index) => <Text key={index} style={[styles.change, { color: colors.text }]}>{line.startsWith("-") ? line : `– ${line}`}</Text>)}
            {state.status === "available" && !!state.message && <Text accessibilityLiveRegion="polite" style={[styles.change, { color: colors.text }]}>{state.message}</Text>}
          </ScrollView>
          <Pressable onPress={action} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} style={styles.button}><Text style={styles.buttonText}>{busy ? `Скачивание ${progress}` : state.status === "available" && state.downloaded ? "Установить" : "Загрузить сейчас"}</Text></Pressable>
          <Pressable onPress={dismiss} disabled={busy} accessibilityRole="button" style={styles.later}><Text style={{ color: colors.textDim, fontSize: 14 }}>Напомнить позже</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#888", opacity: 0.3, alignSelf: "center", marginBottom: 24 },
  icon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(124,77,255,0.12)", alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  version: { fontSize: 14, textAlign: "center", marginTop: 6 },
  changes: { flexShrink: 1, marginTop: 20, marginBottom: 20 },
  change: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  button: { backgroundColor: "#7C4DFF", borderRadius: 14, minHeight: 50, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  later: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 10 },
});
