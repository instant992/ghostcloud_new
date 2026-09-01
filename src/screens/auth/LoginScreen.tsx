import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorText, Input, PasswordInput } from "../../components/UI";
import { useApp } from "../../context";
import { colors, typo, useTheme } from "../../theme";

export default function LoginScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { signIn } = useApp();
  const [loginStr, setLoginStr] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doLogin = async () => {
    if (!loginStr.trim() || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(loginStr.trim(), password);
    } catch (e: any) {
      setError(e?.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.brand}>
          <Image source={{ uri: "app_icon" }} style={styles.logo} resizeMode="cover" />
          <Text style={styles.brandName}>GhostCloud</Text>
          <Text style={styles.brandSub}>Ваш приватный доступ в интернет · OTA-тест 2 ✓✓</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Вход</Text>
          <Input
            label="Логин или email"
            placeholder="Логин или email"
            autoCapitalize="none"
            autoCorrect={false}
            value={loginStr}
            onChangeText={setLoginStr}
            returnKeyType="next"
          />
          <PasswordInput
            label="Пароль"
            placeholder="Пароль"
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={doLogin}
          />
          <Pressable
            onPress={() => nav.navigate("ResetPassword")}
            accessibilityRole="link"
            style={styles.forgot}
            hitSlop={8}
          >
            <Text style={styles.forgotText}>Забыли пароль?</Text>
          </Pressable>
          <ErrorText>{error}</ErrorText>
          <Button title="Войти" onPress={doLogin} loading={loading} />
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>или</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.secondary}>
          <Button title="Регистрация" variant="ghost" onPress={() => nav.navigate("Register")} />
          <View style={styles.secondaryRow}>
            <View style={styles.secondaryHalf}>
              <Button
                title="QR-код"
                variant="ghost"
                size="sm"
                onPress={() => nav.navigate("QRLogin")}
              />
            </View>
            <View style={styles.secondaryHalf}>
              <Button
                title="Telegram"
                variant="ghost"
                size="sm"
                onPress={() => nav.navigate("TelegramLogin")}
              />
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
  },
  brand: { alignItems: "center", marginTop: 12, marginBottom: 26 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 12,
  },
  brandName: {
    color: colors.text,
    ...typo.title,
    fontSize: 24,
  },
  brandSub: {
    color: colors.textDim,
    ...typo.sub,
    marginTop: 4,
  },
  form: {},
  formTitle: {
    color: colors.text,
    ...typo.heading,
    fontSize: 18,
    marginBottom: 14,
  },
  forgot: {
    alignSelf: "flex-end",
    paddingVertical: 6,
    marginBottom: 4,
  },
  forgotText: { color: colors.accent, ...typo.sub, fontWeight: "600" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    color: colors.textFaint,
    ...typo.caption,
    marginHorizontal: 12,
    textTransform: "lowercase",
  },
  secondary: {},
  secondaryRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondaryHalf: { flex: 1 },
});
