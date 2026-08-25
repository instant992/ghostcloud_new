import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Button, Card, ErrorText, Input, Row, Screen, Subtitle, Title } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { createPayment, extendFromBalance, getPrices, paymentStatus } from "../api";
import { useApp } from "../context";
import { colors, useTheme } from "../theme";
import { formatDate } from "../utils/formatDate";

export default function PlansScreen() {
  useTheme();
  const styles = makeStyles();

  const nav = useNavigation<any>();
  const { me, refreshMe } = useApp();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [selectedPlan, setSelectedPlan] = useState("1_month");
  const [promo, setPromo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getPrices()
        .then((r) => {
          if (r?.success && r.prices) {
            setPrices(r.prices);
            setNames(r.names || {});
          }
        })
        .catch(() => {});
    }, [])
  );

  const buy = async () => {
    if (!me?.email && !me?.login) {
      setError("Не удалось определить email аккаунта");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await createPayment({
        email: me.email || `${me.login}@ghostcloud.local`,
        plan: selectedPlan,
        promo_code: promo.trim() || undefined,
        source: "app",
      });
      if (!r?.success) throw new Error(r?.error || "Не удалось создать платёж");
      const orderId = r.order_id || r.payment_id;
      if (r.confirmation_url) await WebBrowser.openBrowserAsync(r.confirmation_url);

      // Поллинг статуса до 2 минут
      let done = false;
      for (let i = 0; i < 40 && !done; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        try {
          const st = await paymentStatus(orderId);
          if (st?.status === "succeeded") {
            done = true;
            Alert.alert("Оплата прошла ✅", "Подписка продлена!");
            await refreshMe();
          } else if (st?.status === "canceled") {
            break;
          }
        } catch {}
      }
      if (!done) setError("Платёж пока не подтверждён. Если вы оплатили — он появится через пару минут.");
    } catch (e: any) {
      setError(e?.message || "Ошибка оплаты");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={{ paddingTop: 64 }}>
      <Title>Тарифы</Title>
      <Subtitle>Продление подписки GhostCloud</Subtitle>

      <Card>
        <Row label="Текущий тариф" value={me?.plan || "—"} />
        <Row
          label="Действует до"
          value={formatDate(me?.expire_at)}
          valueColor={me?.expire_at ? colors.green : colors.red}
        />
        <Row
          label="Баланс"
          value={`${((me?.balance || 0) / 100).toFixed(0)} ₽`}
          valueColor={colors.accent}
        />
      </Card>

      {(Object.keys(prices).length ? Object.keys(prices) : ["1_month", "2_months", "3_months"])
        .filter((key) => key !== "trial")
        .map((key) => (
          <PressableScale
            key={key}
            onPress={() => setSelectedPlan(key)}
            style={[
              styles.plan,
              selectedPlan === key && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{names[key] || planLabel(key)}</Text>
              <Text style={styles.planDays}>{planDays(key)}</Text>
            </View>
            <Text style={styles.planPrice}>{prices[key] ?? planPrice(key)} ₽</Text>
          </PressableScale>
        )
      )}

      <Input placeholder="Промокод (необязательно)" autoCapitalize="characters" value={promo} onChangeText={setPromo} />
      <ErrorText>{error}</ErrorText>
      <Button title="Оплатить" onPress={buy} loading={loading} />
      <Button title="Пополнить баланс" variant="ghost" onPress={() => nav.navigate("TopUp")} />
      <Button
        title={`Продлить с баланса (${names[selectedPlan] || planLabel(selectedPlan)})`}
        variant="ghost"
        loading={loading}
        onPress={() =>
          Alert.alert(
            "Продление с баланса",
            `Списать стоимость тарифа «${names[selectedPlan] || planLabel(selectedPlan)}» с баланса?`,
            [
              { text: "Отмена", style: "cancel" },
              {
                text: "Списать",
                onPress: async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const r = await extendFromBalance(selectedPlan);
                    if (!r?.success) {
                      if (r?.error === "insufficient_balance") {
                        throw new Error(`Недостаточно средств: нужно ${r.price ?? "?"} ₽`);
                      }
                      throw new Error(r?.error || "Ошибка");
                    }
                    Alert.alert("Готово ✅", r.message || "Подписка продлена");
                    await refreshMe();
                  } catch (e: any) {
                    setError(e?.message || "Ошибка");
                  } finally {
                    setLoading(false);
                  }
                },
              },
            ]
          )
        }
      />

      <Card style={{ marginTop: 8 }}>
        <Row label="Устройства" value={`${me?.device_count ?? 0} / ${me?.device_limit ?? 6}`} />
      </Card>
    </Screen>
  );
}

function planLabel(key: string): string {
  return { trial: "Тест 2 дня", "1_month": "1 месяц", "2_months": "2 месяца", "3_months": "3 месяца" }[key] || key;
}

function planPrice(key: string): number {
  return { trial: 30, "1_month": 160, "2_months": 300, "3_months": 410 }[key] ?? 0;
}

function planDays(key: string): string {
  return (
    { trial: "2 дня доступа", "1_month": "30 дней", "2_months": "60 дней", "3_months": "90 дней" }[key] || ""
  );
}

const makeStyles = () => StyleSheet.create({
  plan: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  planName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  planDays: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  planPrice: { color: colors.accent, fontWeight: "800", fontSize: 17 },
});




