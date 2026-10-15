import { BrandName } from "../../components/BrandName";
import React, { useState } from "react";
import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorText, Input, PasswordInput } from "../../components/UI";
import { AuthIcon } from "../../components/AuthIcon";
import { KeyboardScrollView } from "../../components/KeyboardForm";
import { useApp } from "../../context";
import { colors, typo, useTheme } from "../../theme";

export default function LoginScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { signIn, signIn2fa } = useApp();
  const [loginStr, setLoginStr] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** false — обычный вход (логин+пароль), true — вход только по коду 2FA */
  const [twoFaMode, setTwoFaMode] = useState(false);
  const [totp, setTotp] = useState("");

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

  const doLogin2fa = async () => {
    if (!totp.trim()) {
      setError("Введите код из приложения-аутентификатора");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Логин и пароль не нужны — сервер находит аккаунт по коду
      await signIn2fa(totp.trim());
    } catch (e: any) {
      setError(e?.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (to2fa: boolean) => {
    setTwoFaMode(to2fa);
    setError(null);
  };

  return (
    <KeyboardScrollView style={styles.flex} contentContainerStyle={{ flexGrow: 1 }}>
      <ImageBackground source={require("../../../assets/auth-background.jpg")} style={styles.background} resizeMode="cover">
        <View pointerEvents="none" style={styles.backgroundShade} />
        <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.brand}>
          <Image source={{ uri: "app_icon" }} style={styles.logo} resizeMode="cover" />
          <BrandName style={styles.brandName} />
          <Text style={styles.brandSub}>Ваш приватный доступ в интернет</Text>
        </View>

        <View style={styles.form}>
          {!twoFaMode ? (
            <>
              <Text style={styles.formTitle}>Вход</Text>
              <Input
                label="Логин или email"
                icon="mail"
                placeholder="Логин или email"
                autoCapitalize="none"
                autoCorrect={false}
                value={loginStr}
                onChangeText={setLoginStr}
                returnKeyType="next"
              />
              <PasswordInput
                label="Пароль"
                icon="lock"
                placeholder="Ваш пароль"
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
              <Button title="Войти" icon="log-in" onPress={doLogin} loading={loading} />
              <Button
                title="Вход по 2FA"
                icon="shield-check"
                variant="ghost"
                onPress={() => switchMode(true)}
              />
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Вход по 2FA</Text>
              <Input
                label="Код из приложения-аутентификатора"
                icon="shield-check"
                placeholder="000000 или резервный XXXX-XXXX"
                value={totp}
                onChangeText={(t) => setTotp(t.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 9))}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={doLogin2fa}
              />
              <Text style={styles.hint2fa}>Логин и пароль не нужны — введите только код</Text>
              <Pressable
                onPress={() => switchMode(false)}
                accessibilityRole="link"
                style={styles.forgot}
                hitSlop={8}
              >
                <Text style={styles.forgotText}>← Вход по паролю</Text>
              </Pressable>
              <ErrorText>{error}</ErrorText>
              <Button title="Войти по коду" icon="log-in" onPress={doLogin2fa} loading={loading} />
            </>
          )}
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>или</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.secondary}>
          <Button title="Регистрация" icon="user-plus" variant="ghost" onPress={() => nav.navigate("Register")} />
          <View style={styles.secondaryRow}>
            <View style={styles.secondaryHalf}>
              <Button
                title="QR-код"
                icon="qr-code"
                variant="ghost"
                size="sm"
                onPress={() => nav.navigate("QRLogin")}
              />
            </View>
            <View style={styles.secondaryHalf}>
              <Pressable
                onPress={() => nav.navigate("TelegramLogin")}
                accessibilityRole="button"
                accessibilityLabel="Вход через Telegram — только для FoxCloud"
                style={({ pressed }) => ({
                  minHeight: 48, paddingVertical: 10, paddingHorizontal: 8,
                  borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                  alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={styles.telegramButtonContent}>
                  <AuthIcon name="telegram" size={17} color={colors.text} />
                  <View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", textAlign: "center" }}>Telegram</Text>
                    <Text style={{ color: colors.textDim, fontSize: 11, textAlign: "center", marginTop: 2 }}>Только для FoxCloud</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
      </ImageBackground>
    </KeyboardScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  background: { flex: 1, backgroundColor: colors.bg },
  backgroundShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(8, 5, 24, 0.48)" },
  screen: {
    flexGrow: 1,
    backgroundColor: "transparent",
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
  hint2fa: {
    color: colors.textDim,
    ...typo.caption,
    marginTop: 8,
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
  telegramButtonContent: { flexDirection: "row", alignItems: "center", gap: 7 },
});
