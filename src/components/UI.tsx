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
import { colors, useTheme } from "../theme";
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
};

export function Button({ title, onPress, loading, disabled, variant = "primary" }: BtnProps) {
  useTheme();
  const styles = makeStyles();
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.btn,
        variant === "primary" && styles.btnPrimary,
        variant === "ghost" && styles.btnGhost,
        variant === "danger" && styles.btnDanger,
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.btnText, variant !== "primary" && { color: variant === "danger" ? colors.red : colors.text }]}>
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

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 6 },
  subtitle: { color: colors.textDim, fontSize: 14, marginBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  btn: {
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  btnPrimary: {
    backgroundColor: colors.accentDeep,
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDanger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.red + "55",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  input: {
    backgroundColor: colors.bgSoft,
    borderRadius: 14,
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
