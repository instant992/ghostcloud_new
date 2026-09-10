import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, ErrorText, Input, Row, Screen } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { ProviderPicker } from "../components/ProviderPicker";
import { FoxMethodPicker } from "../components/FoxMethodPicker";
import { createTopup, topupStatus } from "../api";
import { useApp } from "../context";
import { colors, useTheme } from "../theme";

const PRESETS = [100, 300, 500, 1000];
// FoxiCloud: платёж создаёт Bedolaga (platega) — там свой минимум (50 ₽)
const FOX_PRESETS = [100, 300, 500, 1000];

export default function TopUpScreen() {
  useTheme();
  const styles = makeStyles();
  const { isFoxcloud, refreshMe } = useApp();

  const [amount, setAmount] = useState(isFoxcloud ? "100" : "300");
  const [orderId, setOrderId] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  /** FoxCloud: выбранный способ оплаты Bedolaga (null = авто) */
  const [foxMethod, setFoxMethod] = useState<{ method: string; option?: string } | null>(null);

  const minAmount = isFoxcloud ? 50 : 10;
  const presets = isFoxcloud ? FOX_PRESETS : PRESETS;

  const create = async () => {
    const num = parseInt(amount, 10);
    if (!num || num < minAmount) {
      setError(`Минимальная сумма — ${minAmount} ₽`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = isFoxcloud
        ? await createTopup(num, undefined, foxMethod?.method, foxMethod?.option)
        : await createTopup(num, provider || undefined);
      if (!r?.success) throw new Error(r?.error || "Ошибка создания платежа");
      setOrderId(r.order_id || "");
      setPayUrl(r.confirmation_url || r.payment_url || "");
      const url = r.confirmation_url || r.payment_url;
      if (url) await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const check = useCallback(async () => {
    // FoxiCloud: платёж обрабатывает Bedolaga — статус берём из профиля
    if (isFoxcloud) {
      setLoading(true);
      try {
        await refreshMe();
        Alert.alert(
          "Баланс обновлён",
          "Если платёж прошёл — новая сумма уже отображается. Зачисление занимает до 1 минуты."
        );
      } catch {} finally {
        setLoading(false);
      }
      return;
    }
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
  }, [orderId, amount, isFoxcloud, refreshMe]);

  return (
    <Screen>
      <Card>
        <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 10 }}>
          {isFoxcloud
            ? "Пополнение баланса FoxCloud — оплата через @foxicloudbot, зачисление автоматическое"
            : "Пополните баланс — им можно оплачивать подписку и дополнительные устройства"}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {presets.map((p) => (
            <PressableScale
              key={p}
              onPress={() => setAmount(String(p))}
              accessibilityRole="radio"
              accessibilityState={{ selected: String(p) === amount }}
              accessibilityLabel={`Сумма ${p} рублей`}
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
          label="Сумма, ₽"
          placeholder="Сумма, ₽"
          keyboardType="number-pad"
          value={amount}
          onChangeText={setAmount}
        />
        {!isFoxcloud && <ProviderPicker value={provider} onChange={setProvider} />}
        {isFoxcloud && (
          <FoxMethodPicker
            value={foxMethod}
            onChange={setFoxMethod}
            amountKopeks={(parseInt(amount, 10) || 0) * 100}
          />
        )}
        <ErrorText>{error}</ErrorText>
        <Button title="Пополнить" onPress={create} loading={loading} />
        {(!!payUrl || isFoxcloud) && (
          <>
            {!!payUrl && (
              <Button
                title="Открыть страницу оплаты"
                variant="ghost"
                onPress={() => WebBrowser.openBrowserAsync(payUrl)}
              />
            )}
            <Button
              title={isFoxcloud ? "Проверить зачисление" : "Проверить оплату"}
              variant="ghost"
              onPress={check}
              loading={loading}
            />
          </>
        )}
      </Card>

      <Card>
        <Row label="Способ оплаты" value={isFoxcloud ? "FoxCloud" : "выбирается выше"} />
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
