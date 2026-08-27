import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, ErrorText, Input, Row, Screen } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { ProviderPicker } from "../components/ProviderPicker";
import { createTopup, topupStatus } from "../api";
import { colors, useTheme } from "../theme";

const PRESETS = [100, 300, 500, 1000];

export default function TopUpScreen() {
  useTheme();
  const styles = makeStyles();

  const [amount, setAmount] = useState("300");
  const [orderId, setOrderId] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const create = async () => {
    const num = parseInt(amount, 10);
    if (!num || num < 10) {
      setError("Минимальная сумма — 10 ₽");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await createTopup(num, provider || undefined);
      if (!r?.success) throw new Error(r?.error || "Ошибка создания платежа");
      setOrderId(r.order_id || "");
      setPayUrl(r.confirmation_url || "");
      if (r.confirmation_url) await WebBrowser.openBrowserAsync(r.confirmation_url);
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const check = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const r = await topupStatus(orderId);
      if (r?.status === "succeeded") {
        Alert.alert("Баланс пополнен ✅", `Сумма: ${amount} ₽`);
        setOrderId("");
        setPayUrl("");
      } else if (r?.status === "canceled") {
        setError("Платёж отменён");
        setOrderId("");
      } else if (r?.status === "pending") {
        setError(null);
        Alert.alert("Ещё не поступил", "Платёж обрабатывается. Попробуйте через минуту.");
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [orderId, amount]);

  return (
    <Screen>
      <Card>
        <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 10 }}>
          Пополните баланс — им можно оплачивать подписку и дополнительные устройства
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {PRESETS.map((p) => (
            <PressableScale
              key={p}
              onPress={() => setAmount(String(p))}
              style={[
                styles.preset,
                String(p) === amount && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>{p} ₽</Text>
            </PressableScale>
          ))}
        </View>
        <Input
          placeholder="Сумма, ₽"
          keyboardType="number-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <ProviderPicker value={provider} onChange={setProvider} />
        <ErrorText>{error}</ErrorText>
        <Button title="Пополнить" onPress={create} loading={loading} />
        {!!payUrl && (
          <>
            <Button
              title="Открыть страницу оплаты"
              variant="ghost"
              onPress={() => WebBrowser.openBrowserAsync(payUrl)}
            />
            <Button title="Проверить оплату" variant="ghost" onPress={check} loading={loading} />
          </>
        )}
      </Card>

      <Card>
        <Row label="Способ оплаты" value="выбирается выше" />
        <Row label="Зачисление" value="автоматически" valueColor={colors.green} />
      </Card>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  preset: {
    flex: 1,
    alignItems: "center" as const,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
});




