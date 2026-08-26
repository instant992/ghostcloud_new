import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { Button, Card, ErrorText, Screen, Subtitle, Title } from "../../components/UI";
import { saveSession } from "../../storage";
import { qrCreateSession, qrStatus } from "../../api";
import { useApp } from "../../context";
import { colors, useTheme } from "../../theme";

/** Содержимое QR для подтверждения входа на авторизованном устройстве */
export function qrLoginPayload(sessionId: string): string {
  return `ghostcloud://qr-login?session=${sessionId}`;
}

/** Извлекает session_id из отсканированного QR (deep-link или голый id) */
export function parseQrSession(data: string): string | null {
  const raw = (data || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "ghostcloud:" && url.host === "qr-login") {
      const s = url.searchParams.get("session");
      if (s) return s;
    }
  } catch {}
  if (/^[a-zA-Z0-9\-_]{10,80}$/.test(raw)) return raw;
  return null;
}

export default function QRLoginScreen() {
  useTheme();
  const nav = useNavigation<any>();
  const { refreshMe, reloadNodes } = useApp();
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmedUrl, setConfirmedUrl] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await qrCreateSession();
        if (!r?.success) throw new Error(r?.error || "Не удалось создать сессию");
        if (cancelled) return;
        setSessionId(r.session_id);
      } catch (e: any) {
        setError(e?.message || "Ошибка");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId || confirmedUrl) return;
    timer.current = setInterval(async () => {
      try {
        const r = await qrStatus(sessionId);
        if (r?.status === "confirmed" && r.subscription_url) {
          if (timer.current) clearInterval(timer.current);
          setConfirmedUrl(r.subscription_url);
          await saveSession({ subUrl: r.subscription_url });
          await refreshMe().catch(() => {});
          await reloadNodes().catch(() => {});
        }
      } catch {}
    }, 2500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [sessionId, confirmedUrl, refreshMe, reloadNodes]);

  return (
    <Screen>
      <Title>Вход по QR-коду</Title>
      <Subtitle>
        Отсканируйте этот код с устройства, где вы уже авторизованы:
        GhostCloud → Профиль → «Подтвердить вход по QR»
      </Subtitle>
      <Card style={{ alignItems: "center", paddingVertical: 30 }}>
        <View
          style={{
            width: 240,
            minHeight: 240,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            backgroundColor: "#FFFFFF",
          }}
        >
          {sessionId ? (
            <QRCode
              value={qrLoginPayload(sessionId)}
              size={200}
              color="#111111"
              backgroundColor="transparent"
            />
          ) : (
            <Text style={{ color: "#777777", fontSize: 12 }}>Генерация QR…</Text>
          )}
        </View>
        <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: "center", marginTop: 12 }}>
          Наведите камеру авторизованного устройства на этот код
        </Text>
      </Card>
      <ErrorText>{error}</ErrorText>
      {!confirmedUrl && (
        <>
          <Button title="Отменить" variant="ghost" onPress={() => nav.goBack()} />
          <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: "center", marginTop: 10 }}>
            Ожидание подтверждения…
          </Text>
        </>
      )}
    </Screen>
  );
}
