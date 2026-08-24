import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, ErrorText, Input, PasswordInput, Screen, Subtitle, Title } from "../../components/UI";
import { useApp } from "../../context";
import { colors } from "../../theme";

export default function LoginScreen() {
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
    <Screen>
      <View style={styles.brand}>
        <Image
          source={{ uri: "app_icon" }}
          style={styles.logo}
          resizeMode="cover"
        />
        <Text style={styles.brandName}>GhostCloud</Text>
      </View>
      <Title>Вход</Title>
      <Subtitle>Введите логин и пароль от вашего аккаунта</Subtitle>
      <Input
        placeholder="Логин или email"
        autoCapitalize="none"
        autoCorrect={false}
        value={loginStr}
        onChangeText={setLoginStr}
      />
      <PasswordInput placeholder="Пароль" value={password} onChangeText={setPassword} />
      <ErrorText>{error}</ErrorText>
      <Button title="Войти" onPress={doLogin} loading={loading} />
      <Pressable onPress={() => nav.navigate("ResetPassword")}>
        <Text style={styles.link}>Забыли пароль?</Text>
      </Pressable>

      <View style={styles.divider} />
      <Button title="Регистрация" variant="ghost" onPress={() => nav.navigate("Register")} />
      <Button title="Войти по QR-коду" variant="ghost" onPress={() => nav.navigate("QRLogin")} />
      <Button title="Войти через Telegram" variant="ghost" onPress={() => nav.navigate("TelegramLogin")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", marginTop: 30, marginBottom: 30 },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 22,
    marginBottom: 12,
  },
  brandName: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },
  link: { color: colors.accent, textAlign: "center", paddingVertical: 10 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
});
