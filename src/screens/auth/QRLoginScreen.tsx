import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, ErrorText, Screen, Subtitle, Title } from "../../components/UI";
import { IconButton } from "../../components/Foundations";
import { saveSession } from "../../storage";
import { qrCreateSession, qrStatus } from "../../api";
import { useApp } from "../../context";
import { colors, useTheme } from "../../theme";

/** Экран входа по QR: это устройство показывает QR-код, другое (авторизованное)
 *  сканирует его и подтверждает вход. */
export default function QRLoginScreen() {
  useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { refreshMe, reloadNodes } = useApp();
  const [sessionId, setSessionId] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [creating, setCreating] = useState(true);
  const [confirmedUrl, setConfirmedUrl] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);

  const createSession = useCallback(async () => {
    setCreating(true);
    setError(null);
    setExpired(false);
    setSessionId("");
    try {
      const r = await qrCreateSession();
      if (!r?.success) throw new Error(r?.error || "Не удалось создать QR-код");
      setSessionId(r.session_id);
      setExpiresIn(typeof r.expires_in === "number" ? r.expires_in : 300);
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => {
    createSession();
  }, [createSession]);

  // Таймер обратного отсчёта срока жизни кода
  useEffect(() => {
    if (!sessionId || confirmedUrl) return;
    countdown.current = setInterval(() => {
      setExpiresIn((s) => {
        if (s <= 1) {
          setExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (countdown.current) clearInterval(countdown.current);
    };
  }, [sessionId, confirmedUrl]);

  // Поллинг статуса подтверждения
  useEffect(() => {
    if (!sessionId || confirmedUrl || expired) return;
    timer.current = setInterval(async () => {
      try {
        const r = await qrStatus(sessionId);
        if (r?.status === "expired") {
          setExpired(true);
          return;
        }
        if (r?.status === "confirmed" && r.subscription_url) {
          if (timer.current) clearInterval(timer.current);
          setConfirmedUrl(r.subscription_url);
          await saveSession({ subUrl: r.subscription_url });
          await refreshMe().catch(() => {});
          await reloadNodes().catch(() => {});
        }
      } catch {}
    }, 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [sessionId, confirmedUrl, expired, refreshMe, reloadNodes]);

  const qrData = sessionId ? `ghostcloud://qr-auth/${sessionId}` : "";
  const minutes = Math.max(0, Math.ceil(expiresIn / 60));

  return (
    <Screen style={{ paddingTop: insets.top + 12 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-back" label="Назад" onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }} />
      </View>
      <Title>Вход по QR-коду</Title>
      <Subtitle>
        Откройте GhostCloud на устройстве, где вы уже вошли: Профиль → «Отсканировать QR», и
        наведите камеру на этот код
      </Subtitle>

      <Card style={{ alignItems: "center", paddingVertical: 26 }}>
        {creating ? (
          <View style={{ width: 220, height: 220, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.textDim, fontSize: 13 }}>Создаём QR-код…</Text>
          </View>
        ) : expired ? (
          <View style={{ width: 220, height: 220, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.red, fontSize: 15, fontWeight: "700", marginBottom: 6 }}>
              QR-код истёк
            </Text>
            <Text style={{ color: colors.textDim, fontSize: 12, textAlign: "center" }}>
              Создайте новый код
            </Text>
          </View>
        ) : qrData ? (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              padding: 14,
              borderRadius: 16,
            }}
          >
            <QRCode value={qrData} size={200} backgroundColor="#FFFFFF" color="#111111" />
          </View>
        ) : null}

        {!!sessionId && !expired && (
          <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 14 }}>
            Код действителен ещё ~{minutes} мин.
          </Text>
        )}
      </Card>

      <ErrorText>{error}</ErrorText>

      {expired ? (
        <Button title="Попробовать снова" onPress={createSession} />
      ) : (
        <>
          {!confirmedUrl && (
            <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: "center", marginTop: 10 }}>
              Ожидание подтверждения…
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
});
