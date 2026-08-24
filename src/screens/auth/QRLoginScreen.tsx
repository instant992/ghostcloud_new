import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, ErrorText, Screen, Subtitle, Title } from "../../components/UI";
import { saveSession } from "../../storage";
import { qrCreateSession, qrStatus } from "../../api";
import { useApp } from "../../context";
import { colors, useTheme } from "../../theme";

export default function QRLoginScreen() {
  const nav = useNavigation<any>();
  const { refreshMe, reloadNodes } = useApp();
  const [sessionId, setSessionId] = useState("");
  const [linkCode, setLinkCode] = useState("");
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
        setLinkCode(r.session_id);
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
        Откройте GhostCloud на устройстве, где вы уже авторизованы: Профиль → Вход по QR-коду,
        и подтвердите вход для этого устройства
      </Subtitle>
      <Card style={{ alignItems: "center", paddingVertical: 30 }}>
        <View
          style={{
            width: 220,
            minHeight: 120,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: colors.accentDeep,
            borderStyle: "dashed",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            backgroundColor: colors.bgSoft,
          }}
        >
          <Text style={{ color: colors.textDim, fontSize: 12, textAlign: "center", marginBottom: 8 }}>
            Код подтверждения:
          </Text>
          <Text selectable style={{ color: colors.accent, fontSize: 22, fontWeight: "800", letterSpacing: 1.5 }}>
            {linkCode ? linkCode.slice(0, 8).toUpperCase() : "..."}
          </Text>
        </View>
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
