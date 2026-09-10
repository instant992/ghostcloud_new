import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, ErrorText, Screen, Subtitle, Title } from "../../components/UI";
import { IconButton } from "../../components/Foundations";
import { useApp } from "../../context";
import { colors, typo, useTheme } from "../../theme";

/** Страница Telegram Login Widget на нашем бэкенде: авторизация идёт через
 *  @foxicloudbot (bot_id зашит в страницу), подпись валидирует foxcloud_web,
 *  подписку тянет из Bedolaga API и возвращает deep link в приложение.
 *  ВАЖНО: домен vpnghost.space — именно он зарегистрирован в BotFather
 *  (/setdomain) для @foxicloudbot; с другого домена OAuth-виджет не отдаст
 *  auth_result. Не менять на ghostcloud.space без смены домена в BotFather. */
const AUTH_PAGE = "https://vpnghost.space/foxclash-auth";
const MAX_WAIT_MS = 5 * 60 * 1000;

type TgAuthParams = {
  subscription_url?: string;
  tg_id?: string;
  source?: string;
  error?: string;
};

/** Разбор deep link ghostcloud://tg-auth?... / foxcloud://tg-auth?... */
function parseTgAuthUrl(url: string): TgAuthParams | null {
  try {
    const u = new URL(url);
    if (u.host !== "tg-auth" && !url.includes("://tg-auth")) return null;
    const params: TgAuthParams = {};
    u.searchParams.forEach((v, k) => {
      (params as any)[k] = v;
    });
    return params;
  } catch {
    return null;
  }
}

/**
 * Вход через Telegram — авторизация в @foxicloudbot (FoxCloud / Bedolaga).
 *
 * 1. Открываем системный браузер на foxcloud_web/foxclash-auth.
 * 2. На странице — Telegram Login Widget: пользователь входит как @foxicloudbot.
 * 3. Сервер валидирует подпись и берёт подписку из Bedolaga Web API.
 * 4. Редирект ghostcloud://tg-auth?subscription_url=...&tg_id=...&source=foxicloud
 *    → приложение ловит deep link и входит в FoxCloud-режим.
 */
export default function TelegramLoginScreen() {
  useTheme();
  const styles = makeStyles();
  const nav = useNavigation<any>();
  const { signInViaToken } = useApp();

  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const doneRef = useRef(false);
  const deadlineRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateSub = useRef<any>(null);
  const urlSub = useRef<{ remove: () => void } | null>(null);

  const finish = async (params: TgAuthParams) => {
    if (doneRef.current) return;
    doneRef.current = true;
    cleanup();
    if (params.error) {
      setWaiting(false);
      setError(params.error);
      return;
    }
    const subUrl = params.subscription_url;
    if (!subUrl) {
      setWaiting(false);
      setError("Подписка не получена от FoxCloud");
      return;
    }
    setWaiting(false);
    try {
      // source=foxicloud → FoxCloud-режим (тема FoxCloud, урезанные фичи)
      await signInViaToken(
        subUrl,
        { login: params.tg_id ? `tg_${params.tg_id}` : undefined },
        params.tg_id,
        params.source === "foxicloud" || !!params.tg_id
      );
    } catch (e: any) {
      setError(e?.message || "Не удалось войти");
    }
  };

  const onUrl = (event: { url: string }) => {
    const params = parseTgAuthUrl(event.url);
    if (params) void finish(params);
  };

  const cleanup = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (urlSub.current) {
      try {
        urlSub.current.remove();
      } catch {}
      urlSub.current = null;
    }
    if (appStateSub.current) {
      try {
        appStateSub.current.remove();
      } catch {}
      appStateSub.current = null;
    }
  };

  useEffect(() => {
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    doneRef.current = false;

    // Cold-start deep link: если приложение открылось сразу по ссылке
    try {
      const initial = await Linking.getInitialURL();
      if (initial) {
        const p = parseTgAuthUrl(initial);
        if (p) {
          setBusy(false);
          await finish(p);
          return;
        }
      }
    } catch {}

    urlSub.current = Linking.addEventListener("url", onUrl);
    deadlineRef.current = Date.now() + MAX_WAIT_MS;
    timeoutRef.current = setTimeout(() => {
      if (!doneRef.current) {
        cleanup();
        doneRef.current = true;
        setWaiting(false);
        setError("Время ожидания истекло. Попробуйте снова.");
      }
    }, MAX_WAIT_MS);

    // При возврате из браузера — проверим, не пришли ли данные через getInitialURL
    appStateSub.current = AppState.addEventListener("change", async (st) => {
      if (st !== "active" || doneRef.current) return;
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          const p = parseTgAuthUrl(url);
          if (p) await finish(p);
        }
      } catch {}
    });

    setWaiting(true);
    try {
      // Системный браузер: там уже есть сессия Telegram — виджет сработает
      await Linking.openURL(AUTH_PAGE).catch(async () => {
        await WebBrowser.openBrowserAsync(AUTH_PAGE);
      });
    } catch (e: any) {
      cleanup();
      doneRef.current = true;
      setWaiting(false);
      setError(e?.message || "Не удалось открыть браузер");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    cleanup();
    setWaiting(false);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" label="Назад" onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }} />
      </View>
      <Title>Вход через Telegram</Title>
      <Subtitle>
        Авторизация через бот FoxCloud (@foxicloudbot). Откроется браузер —
        нажмите «Войти через Telegram», и после подтверждения вы автоматически
        войдёте в приложение.
      </Subtitle>

      {waiting ? (
        <Card style={{ alignItems: "center", paddingVertical: 24 }}>
          <Ionicons name="paper-plane" size={40} color="#2AABEE" />
          <Text style={styles.waiting}>
            Ожидание авторизации в Telegram…{"\n"}
            Подтвердите вход в открывшемся браузере
          </Text>
          <Button title="Отмена" variant="ghost" onPress={cancel} />
        </Card>
      ) : (
        <>
          <ErrorText>{error}</ErrorText>
          <Button title="Открыть страницу входа" onPress={start} loading={busy} />
          <Card style={{ marginTop: 12 }}>
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
              <Text style={styles.note}>
                Это вход в сервис FoxCloud — отдельную VPN-систему. Подписка,
                баланс и сервера подтягиваются из вашего аккаунта @foxicloudbot.
              </Text>
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    waiting: {
      color: colors.textFaint,
      ...typo.sub,
      marginTop: 12,
      marginBottom: 16,
      textAlign: "center",
    },
    noteRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    note: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17 },
  });
