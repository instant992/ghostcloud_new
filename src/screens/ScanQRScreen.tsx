import React, { useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Card, Screen, Subtitle, Title } from "../components/UI";
import { qrConfirm } from "../api";
import { colors, useTheme } from "../theme";
import { parseQrSession } from "./auth/QRLoginScreen";

export default function ScanQRScreen() {
  useTheme();
  const styles = makeStyles();
  const nav = useNavigation<any>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const scannedRef = useRef(false);

  const handleScan = async ({ data }: { data: string }) => {
    if (scannedRef.current || busy || done) return;
    const sessionId = parseQrSession(data);
    if (!sessionId) return;
    scannedRef.current = true;
    setBusy(true);
    Alert.alert(
      "Подтвердить вход?",
      "На другом устройстве выполняется вход в ваш аккаунт по QR-коду. Подтвердить?",
      [
        {
          text: "Отмена",
          style: "cancel",
          onPress: () => {
            scannedRef.current = false;
            setBusy(false);
          },
        },
        {
          text: "Подтвердить",
          onPress: async () => {
            try {
              const r = await qrConfirm(sessionId);
              if (!r?.success) throw new Error(r?.error || "Не удалось подтвердить вход");
              setDone(sessionId);
            } catch (e: any) {
              Alert.alert("Ошибка", e?.message || "Не удалось подтвердить вход");
              scannedRef.current = false;
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (!permission) {
    return (
      <Screen>
        <Title>Подтвердить вход по QR</Title>
        <Card>
          <Text style={{ color: colors.textDim, textAlign: "center" }}>Загрузка камеры…</Text>
        </Card>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Title>Подтвердить вход по QR</Title>
        <Subtitle>Нужен доступ к камере, чтобы отсканировать QR-код с другого устройства</Subtitle>
        <Button title="Разрешить камеру" onPress={() => requestPermission()} />
        <Button title="Назад" variant="ghost" onPress={() => nav.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingTop: 64 }}>
      <Title>Подтвердить вход по QR</Title>
      <Subtitle>Наведите камеру на QR-код с устройства, на котором выполняется вход</Subtitle>

      {done ? (
        <Card style={{ alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontSize: 44 }}>✅</Text>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16, marginTop: 10 }}>
            Вход подтверждён
          </Text>
          <Text style={{ color: colors.textDim, fontSize: 13, textAlign: "center", marginTop: 6 }}>
            На другом устройстве вы автоматически войдёте в аккаунт
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button title="Готово" onPress={() => nav.goBack()} />
          </View>
        </Card>
      ) : (
        <>
          <View style={styles.scannerBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={handleScan}
            />
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>
          <Text style={styles.hint}>{busy ? "Отправка подтверждения…" : "Ожидание QR-кода…"}</Text>
          <Button title="Отменить" variant="ghost" onPress={() => nav.goBack()} />
        </>
      )}
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    scannerBox: {
      width: 260,
      height: 260,
      borderRadius: 20,
      overflow: "hidden",
      alignSelf: "center",
      backgroundColor: "#000000",
    },
    cornerTL: {
      position: "absolute",
      top: 18,
      left: 18,
      width: 34,
      height: 34,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderColor: colors.accent,
      borderRadius: 8,
    },
    cornerTR: {
      position: "absolute",
      top: 18,
      right: 18,
      width: 34,
      height: 34,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderColor: colors.accent,
      borderRadius: 8,
    },
    cornerBL: {
      position: "absolute",
      bottom: 18,
      left: 18,
      width: 34,
      height: 34,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderColor: colors.accent,
      borderRadius: 8,
    },
    cornerBR: {
      position: "absolute",
      bottom: 18,
      right: 18,
      width: 34,
      height: 34,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderColor: colors.accent,
      borderRadius: 8,
    },
    hint: {
      color: colors.textFaint,
      fontSize: 12,
      textAlign: "center",
      marginTop: 14,
    },
  });
