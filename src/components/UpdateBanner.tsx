import React, { useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, useTheme } from "../theme";
import { IS_TV } from "../tv";
import { TvFocusable } from "../tv/TvFocusable";
import * as update from "../update";

/** Reserved root band: never covers login controls, stack headers or theme docks. */
export function UpdateLayout({ children }: { children: React.ReactNode }) {
  useTheme();
  const insets = useSafeAreaInsets();
  const state = useSyncExternalStore(update.subscribe, update.getSnapshot);
  const visible = state.status === "available" || state.status === "downloading";
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {visible && <View style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}><UpdateBanner /></View>}
      <SafeAreaInsetsContext.Provider value={visible ? { ...insets, top: 0 } : insets}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

/** No dismiss button or persisted dismissal: visible until the installed version is current. */
export function UpdateBanner() {
  const state = useSyncExternalStore(update.subscribe, update.getSnapshot);
  const { mode } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  if (state.status !== "available" && state.status !== "downloading") return null;
  const { info } = state;
  const busy = state.status === "downloading";
  const compact = width < 380 || fontScale > 1.3;
  const detail = [update.firstChangelogLine(info.changelog), update.formatSizeMb(info.apkSize)].filter(Boolean).join(" • ");
  const progress = state.status === "downloading"
    ? state.progress >= 0 ? `${Math.round(Math.min(1, state.progress) * 100)}%` : "Скачивание…"
    : "Обновить";
  const action = () => { if (!busy) void update.downloadAndInstall(info); };
  const buttonContent = <Text style={styles.buttonText}>{busy ? progress : "Обновить"}</Text>;
  const dark = mode === "dark";
  return (
    <View testID="app-update-banner" style={[styles.banner, { backgroundColor: colors.bg }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs><LinearGradient id="update-purple" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#7C4DFF" stopOpacity={dark ? 0.22 : 0.14} />
          <Stop offset="1" stopColor="#651FFF" stopOpacity={dark ? 0.14 : 0.08} />
        </LinearGradient></Defs>
        <Rect width="100%" height="100%" rx="16" fill="url(#update-purple)" />
      </Svg>
      <View style={styles.row}>
        <View style={styles.icon}><MaterialIcons name="system-update" size={24} color={dark ? "#B79AFF" : "#651FFF"} /></View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>Доступно обновление v{info.version}</Text>
          {!!detail && <Text numberOfLines={2} style={[styles.detail, { color: colors.textDim }]}>{detail}</Text>}
          {state.status === "available" && !!state.message && <Text style={[styles.detail, { color: colors.text }]} accessibilityLiveRegion="polite">{state.message}</Text>}
          {busy && <View style={styles.progressRow}><ActivityIndicator size="small" color="#B79AFF" /><Text style={[styles.detail, { color: colors.text }]} accessibilityLiveRegion="polite">Скачивание {progress}</Text></View>}
        </View>
        {!compact && !IS_TV && <Pressable accessibilityRole="button" accessibilityLabel={`Обновить до версии ${info.version}`} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={action} style={styles.button}>{buttonContent}</Pressable>}
        {IS_TV && <TvFocusable disabled={busy} onPress={action} accessibilityLabel={`Обновить до версии ${info.version}`} borderRadius={24} contentStyle={styles.button}>{buttonContent}</TvFocusable>}
      </View>
      {compact && !IS_TV && <Pressable accessibilityRole="button" accessibilityLabel={`Обновить до версии ${info.version}`} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={action} style={[styles.button, styles.compactButton]}>{buttonContent}</Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: IS_TV ? 28 : 12, marginVertical: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(124,77,255,0.4)", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(124,77,255,0.15)", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: IS_TV ? 18 : 14, fontWeight: "700" },
  detail: { fontSize: IS_TV ? 15 : 12, marginTop: 3 },
  button: { backgroundColor: "#651FFF", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: "center", alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: IS_TV ? 17 : 14 },
  compactButton: { alignSelf: "flex-end", marginTop: 8 },
  progressRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
});
