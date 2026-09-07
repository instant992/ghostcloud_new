import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme, colors, typo } from "../theme";

export type SecurityAlert = {
  id: number;
  type: string;
  payload?: Record<string, any>;
  created_at?: number;
};

/**
 * Глобальная модалка уведомления безопасности: «Кто-то вошёл по коду 2FA».
 * Кнопки: «Это был я» (прочитать), «Отключить 2FA», «Выкинуть из приложения».
 */
export function SecurityAlertModal({
  alert,
  busy,
  onConfirm,
  onDisable2fa,
  onKick,
  onClose,
}: {
  alert: SecurityAlert | null;
  busy: boolean;
  onConfirm: () => void;
  onDisable2fa: () => void;
  onKick: () => void;
  onClose: () => void;
}) {
  useTheme();
  const styles = makeStyles();
  if (!alert) return null;

  const when = alert.created_at
    ? new Date(alert.created_at * 1000).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={30} color="#A855F7" />
          </View>
          <Text style={styles.title}>Вход по коду 2FA</Text>
          <Text style={styles.text}>
            Кто-то вошёл в ваш аккаунт по двухфакторному коду
            {when ? ` в ${when}` : ""}. Это были вы?
          </Text>
          <Text style={styles.subtext}>
            Если нет — отключите 2FA или выкиньте аккаунт из приложения на всех устройствах.
          </Text>

          <Pressable style={styles.btnPrimary} onPress={onConfirm} disabled={busy}>
            <Text style={styles.btnPrimaryText}>Это был я</Text>
          </Pressable>
          <Pressable style={styles.btnWarn} onPress={onDisable2fa} disabled={busy}>
            <Text style={styles.btnWarnText}>Отключить 2FA</Text>
          </Pressable>
          <Pressable style={styles.btnDanger} onPress={onKick} disabled={busy}>
            <Text style={styles.btnDangerText}>Выкинуть из приложения</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconWrap: {
      alignSelf: "center",
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(168,85,247,0.14)",
      marginBottom: 12,
    },
    title: {
      color: colors.text,
      ...typo.heading,
      fontSize: 17,
      textAlign: "center",
      marginBottom: 8,
    },
    text: {
      color: colors.textDim,
      ...typo.body,
      fontSize: 13.5,
      lineHeight: 19,
      textAlign: "center",
    },
    subtext: {
      color: colors.textFaint,
      ...typo.caption,
      fontSize: 12,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 8,
      marginBottom: 16,
    },
    btnPrimary: {
      backgroundColor: "#A855F7",
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: "center",
      marginBottom: 8,
    },
    btnPrimaryText: { color: "#fff", ...typo.body, fontWeight: "700", fontSize: 14 },
    btnWarn: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: "#F59E0B",
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 8,
    },
    btnWarnText: { color: "#F59E0B", ...typo.body, fontWeight: "700", fontSize: 14 },
    btnDanger: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: colors.red,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    btnDangerText: { color: colors.red, ...typo.body, fontWeight: "700", fontSize: 14 },
  });
