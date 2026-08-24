import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Card, ErrorText, Screen, Subtitle, Title } from "../../components/UI";
import { BASE_URL, BOT_USERNAME } from "../../api";
import { useApp } from "../../context";
import { colors, useTheme } from "../../theme";

function randomToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 40; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function TelegramLoginScreen() {
  const nav = useNavigation<any>();
  const { signInViaToken } = useApp();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const start = async () => {
    setError(null);
    const t = randomToken();
    setToken(t);
    try {
      // Первый запрос регистрирует токен как pending на сервере
      await fetch(`${BASE_URL}/api/auth/check?token=${t}`);
      Linking.openURL(`https://t.me/${BOT_USERNAME}?start=auth_${t}`).catch(() => {});
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const res = await fetch(`${BASE_URL}/api/auth/check?token=${t}`);
          const data = await res.json();
          if (data?.success && data.subscription_url) {
            if (timer.current) clearInterval(timer.current);
            await signInViaToken(data.subscription_url, data.user);
          }
        } catch {}
      }, 2500);
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    }
  };

  return (
    <Screen>
      <Title>Вход через Telegram</Title>
      <Subtitle>
        Нажмите кнопку — откроется бот GhostCloud. Отправьте команду в чате, и вы
        автоматически войдёте в приложение.
      </Subtitle>

      {token && (
        <Card style={{ alignItems: "center", paddingVertical: 24 }}>
          <Text style={{ color: colors.textFaint, fontSize: 13 }}>Ожидание подтверждения в боте…</Text>
          <Button
            title="Скопировать ссылку бота"
            variant="ghost"
            onPress={() => Clipboard.setStringAsync(`https://t.me/${BOT_USERNAME}?start=auth_${token}`)}
          />
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
      <Button title="Открыть бота в Telegram" onPress={start} loading={loading} />
      <Button title="Назад" variant="ghost" onPress={() => nav.goBack()} />
    </Screen>
  );
}
