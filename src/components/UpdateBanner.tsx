import React, { useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as update from "../update";
import { colors, useTheme } from "../theme";

/** Баннер статуса обновления на главном экране (перенесено из старого приложения):
 *  - «Доступно обновление vX.Y.Z» (фиолетовый) — тап скачивает и запускает установку;
 *  - прогресс скачивания с процентами;
 *  - «Актуальная версия» (зелёный) — после проверки без результата;
 *  - ошибка проверки — тап повторяет. */
export function UpdateBanner() {
  useTheme();
  const styles = makeStyles();
  const state = useSyncExternalStore(update.subscribe, update.getSnapshot);

  // Скачивание — прогресс
  if (state.status === "downloading") {
    const pct =
      state.progress >= 0 ? Math.min(100, Math.round(state.progress * 100)) : null;
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return (
      <View style={[styles.banner, styles.bannerUpdate]}>
        <View style={styles.iconBox}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            Скачивание v{state.info.version}
            {pct !== null ? ` · ${pct}%` : ""}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {state.total > 0
              ? `${mb(state.downloaded)} / ${mb(state.total)} МБ`
              : `${mb(state.downloaded)} МБ`}
          </Text>
        </View>
      </View>
    );
  }

  // Доступно обновление
  if (state.status === "available") {
    const firstLine = update.firstChangelogLine(state.info.changelog);
    const sizeMb = update.formatSizeMb(state.info.apkSize);
    return (
      <Pressable
        style={[styles.banner, styles.bannerUpdate]}
        onPress={() => update.downloadAndInstall(state.info)}
      >
        <View style={styles.iconBox}>
          <Ionicons name="cloud-download-outline" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            Доступно обновление v{state.info.version}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {firstLine ? `${firstLine}${sizeMb ? ` • ${sizeMb}` : ""}` : sizeMb}
          </Text>
        </View>
        <View style={styles.updateBtn}>
          <Text style={styles.updateBtnText}>Обновить</Text>
        </View>
      </Pressable>
    );
  }

  // Ошибка проверки — тап повторяет
  if (state.status === "error") {
    return (
      <Pressable
        style={[styles.banner, styles.bannerError]}
        onPress={() => update.checkForUpdate()}
      >
        <Ionicons name="warning-outline" size={18} color={colors.orange} />
        <Text style={styles.sub} numberOfLines={1}>
          {state.message} · проверить снова
        </Text>
      </Pressable>
    );
  }

  // Актуальная версия (после явной проверки)
  if (state.status === "up-to-date") {
    return (
      <Pressable
        style={[styles.banner, styles.bannerOk]}
        onPress={() => update.checkForUpdate()}
      >
        <View style={[styles.iconBox, { backgroundColor: "rgba(76,175,80,0.15)" }]}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            Актуальная версия
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            Проверено — нажмите, чтобы повторить
          </Text>
        </View>
        <Ionicons name="refresh" size={18} color={colors.textFaint} />
      </Pressable>
    );
  }

  // idle / checking — баннер не показываем (проверка молча идёт при старте)
  return null;
}

const makeStyles = () =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginHorizontal: 20,
      marginBottom: 10,
    },
    bannerUpdate: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent + "66",
    },
    bannerOk: {
      backgroundColor: "rgba(76,175,80,0.10)",
      borderColor: "rgba(76,175,80,0.35)",
    },
    bannerError: {
      backgroundColor: "rgba(255,152,0,0.10)",
      borderColor: "rgba(255,152,0,0.30)",
    },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent + "26",
    },
    title: { color: colors.text, fontSize: 13.5, fontWeight: "700" },
    sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    updateBtn: {
      backgroundColor: colors.accent,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    updateBtnText: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
  });
