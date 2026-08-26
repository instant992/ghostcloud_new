import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, isFlutterStyleTheme, withAlpha, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children?: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  useTheme();
  const styles = makeStyles();
  if (scroll) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.screen, styles.content, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  useTheme();
  const styles = makeStyles();
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  useTheme();
  const styles = makeStyles();
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  useTheme();
  const styles = makeStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

type BtnProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ title, onPress, loading, disabled, variant = "primary", size = "md" }: BtnProps) {
  useTheme();
  const styles = makeStyles();
  const isDisabled = disabled || loading;
  const compact = size === "sm";
  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.btn,
        compact && styles.btnSm,
        variant === "primary" && styles.btnPrimary,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size={compact ? "small" : "large"} />
      ) : (
        <Text
          style={[
            styles.btnText,
            compact && styles.btnTextSm,
            variant !== "primary" && { color: variant === "danger" ? colors.red : colors.text },
          ]}
        >
          {title}
        </Text>
      )}
    </PressableScale>
  );
}

export function Input(props: TextInputProps) {
  useTheme();
  const styles = makeStyles();
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      style={styles.input}
      {...props}
    />
  );
}

export function PasswordInput(props: TextInputProps) {
  useTheme();
  const styles = makeStyles();
  const [show, setShow] = React.useState(false);
  return (
    <View>
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      <Pressable
        onPress={() => setShow((s) => !s)}
        hitSlop={12}
        style={styles.eyeBtn}
        accessibilityRole="button"
        accessibilityLabel={show ? "Скрыть пароль" : "Показать пароль"}
      >
        <Ionicons
          name={show ? "eye-off-outline" : "eye-outline"}
          size={22}
          color={colors.textDim}
        />
      </Pressable>
    </View>
  );
}

export function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  useTheme();
  const styles = makeStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor || colors.text }]}>{value}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  useTheme();
  const styles = makeStyles();
  if (!children) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

const makeStyles = () => {
  const fl = isFlutterStyleTheme();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 20, paddingBottom: 40 },
    // Flutter: app-bar title 20 w700
    title: { color: colors.text, fontSize: fl ? 22 : 26, fontWeight: "700", marginBottom: 6, letterSpacing: fl ? -0.3 : 0 },
    subtitle: { color: colors.textDim, fontSize: 13, marginBottom: 20 },
    // Flutter CommonCard: radius 18 для секций, фон surfaceContainer@0.85, обводка outlineVariant
    card: {
      backgroundColor: fl ? withAlpha(colors.card, colors.text === "#FFFFFF" ? 0.72 : 1) : colors.card,
      borderRadius: fl ? 18 : 22,
      borderWidth: 1,
      borderColor: fl ? withAlpha(colors.border, colors.text === "#FFFFFF" ? 0.35 : 0.8) : colors.border,
      padding: 14,
      marginBottom: 12,
    },
    btn: {
      borderRadius: fl ? 14 : 28,
      paddingVertical: fl ? 13 : 15,
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 6,
    },
    btnSm: {
      borderRadius: fl ? 12 : 18,
      paddingVertical: 9,
      paddingHorizontal: 14,
      marginVertical: 4,
    },
    btnPrimary: {
      backgroundColor: colors.accentDeep,
    },
    btnGhost: {
      backgroundColor: fl ? colors.accentSoft : "transparent",
      borderWidth: fl ? 0 : 1,
      borderColor: colors.border,
    },
    btnDanger: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.red + "55",
    },
    btnText: { color: "#fff", fontWeight: fl ? "600" : "700", fontSize: fl ? 15 : 16 },
    btnTextSm: { fontSize: 13 },
    input: {
      backgroundColor: colors.bgSoft,
      borderRadius: fl ? 12 : 14,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 9,
    },
    rowLabel: { color: colors.textDim, fontSize: 14 },
    rowValue: { fontSize: 14, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
    eyeBtn: {
      position: "absolute",
      right: 14,
      top: 0,
      bottom: 10,
      justifyContent: "center",
    },
    errorBox: {
      backgroundColor: colors.red + "18",
      borderColor: colors.red + "44",
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
      marginTop: 4,
      marginBottom: 8,
    },
    errorText: { color: colors.red, fontSize: 13 },
  });
};
