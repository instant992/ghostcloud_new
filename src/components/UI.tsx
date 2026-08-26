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
import { colors, isFlutterStyleTheme, isHappTheme, isV2rayTheme, withAlpha, useTheme } from "../theme";
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
  const happ = isHappTheme();
  const v2r = isV2rayTheme();
  const dark = colors.text === "#FFFFFF";
  const cardStyle: ViewStyle = happ
    ? {
        // Happ: неоморфная карточка — фон surface, двойная тень, тонкая рамка
        backgroundColor: colors.bg,
        borderRadius: 18,
        borderWidth: 1.15,
        borderColor: dark ? withAlpha("#FFFFFF", 0.08) : withAlpha("#BEB7D8", 0.72),
        boxShadow: dark
          ? `5px 5px 18px rgba(0,0,0,0.45), -5px -5px 18px rgba(255,255,255,0.05)`
          : `5px 5px 18px rgba(144,144,184,0.55), -5px -5px 18px rgba(255,255,255,1)`,
      } as any
    : v2r
      ? {
          // v2ray: стеклянная карточка (glass-ветка Flutter)
          backgroundColor: dark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.4)",
          borderRadius: 16,
          borderWidth: dark ? 1 : 0.5,
          borderColor: dark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.55)",
        }
      : {
          backgroundColor: fl ? withAlpha(colors.card, dark ? 0.72 : 1) : colors.card,
          borderRadius: fl ? 18 : 22,
          borderWidth: 1,
          borderColor: fl ? withAlpha(colors.border, dark ? 0.35 : 0.8) : colors.border,
        };
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 20, paddingBottom: 40 },
    // Flutter: app-bar title 20 w700
    title: { color: colors.text, fontSize: fl ? 22 : 26, fontWeight: "700", marginBottom: 6, letterSpacing: fl ? -0.3 : 0 },
    subtitle: { color: colors.textDim, fontSize: 13, marginBottom: 20 },
    card: {
      ...cardStyle,
      padding: 14,
      marginBottom: 12,
    } as ViewStyle,
    btn: {
      borderRadius: fl || happ || v2r ? (happ ? 12 : 14) : 28,
      paddingVertical: fl || happ || v2r ? 13 : 15,
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 6,
    },
    btnSm: {
      borderRadius: 12,
      paddingVertical: 9,
      paddingHorizontal: 14,
      marginVertical: 4,
    },
    btnPrimary: {
      backgroundColor: colors.accentDeep,
    },
    btnGhost: {
      backgroundColor: fl || happ || v2r ? colors.accentSoft : "transparent",
      borderWidth: fl || happ || v2r ? 0 : 1,
      borderColor: colors.border,
    },
    btnDanger: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.red + "55",
    },
    btnText: { color: "#fff", fontWeight: fl || happ || v2r ? "600" : "700", fontSize: fl ? 15 : 16 },
    btnTextSm: { fontSize: 13 },
    input: {
      backgroundColor: happ ? colors.bg : colors.bgSoft,
      borderRadius: fl || happ || v2r ? 12 : 14,
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
