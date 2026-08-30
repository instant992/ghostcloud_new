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
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Контекст: экран находится во вкладках (таб-бар), а не под стековым хедером.
 *  Используется для корректных верхних отступов вместо магических чисел. */
export const TabAreaContext = React.createContext(false);
export function useInTabArea(): boolean {
  return React.useContext(TabAreaContext);
}

/** Верхний отступ экрана: во вкладках отступ добавляет сам <Screen>
 *  (safe-area + 12), а в стеке под плавающей кнопкой «назад» нужен
 *  фиксированный отступ 64, чтобы контент не залезал под неё. */
export function useScreenTopPad(): ViewStyle {
  const inTabs = useInTabArea();
  return inTabs ? {} : { paddingTop: 64 };
}

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
  const inTabs = useInTabArea();
  const insets = useSafeAreaInsets();
  const styles = makeStyles();
  // Во вкладках контент начинается сразу под статус-баром — добавляем
  // безопасный отступ вместо магических чисел (вне вкладок отступ задаёт экран).
  const safeTop = inTabs ? { paddingTop: insets.top + 12 } : null;
  // Во вкладках внизу плавающий таб-бар (~96) — контент не должен под него залезать.
  const safeBottom = inTabs ? { paddingBottom: insets.bottom + 116 } : null;
  if (scroll) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, safeTop, safeBottom, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.screen, styles.content, safeTop, safeBottom, style]}>{children}</View>;
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
        <ActivityIndicator color="#fff" size="small" />
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

export function Input({ label, ...props }: TextInputProps & { label?: string }) {
  useTheme();
  const styles = makeStyles();
  return (
    <View>
      {!!label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        accessibilityLabel={label || (props.placeholder as string | undefined)}
        {...props}
      />
    </View>
  );
}

export function PasswordInput({ label, ...props }: TextInputProps & { label?: string }) {
  useTheme();
  const styles = makeStyles();
  const [show, setShow] = React.useState(false);
  return (
    <View>
      {!!label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={styles.passwordWrap}>
        <TextInput
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { marginBottom: 0, paddingRight: 48 }]}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label || (props.placeholder as string | undefined)}
          {...props}
        />
        <Pressable
          onPress={() => setShow((s) => !s)}
          hitSlop={6}
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
    borderRadius: 24,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  btnSm: {
    borderRadius: 16,
    height: 36,
    paddingHorizontal: 14,
    marginVertical: 4,
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
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnTextSm: { fontSize: 13 },
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
  inputLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  passwordWrap: {
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
    right: 2,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: "center",
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
