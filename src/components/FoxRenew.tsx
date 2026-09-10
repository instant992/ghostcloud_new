import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Button, Card } from "./UI";
import { PressableScale } from "./PressableScale";
import { foxRenew, foxRenewalOptions } from "../api";
import { useApp } from "../context";
import { colors, typo } from "../theme";

type FoxOption = {
  days: number;
  cost_rubles: number;
  label: string;
  can_afford?: boolean;
};

/** Продление подписки FoxiCloud (Telegram-авторизация).
 *  Тарифы/цены и списание — из Bedolaga API: баланс и подписка живут там. */
export function FoxRenew() {
  const nav = useNavigation<any>();
  const { me, refreshMe } = useApp();
  const [options, setOptions] = useState<FoxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await foxRenewalOptions();
      if (r?.success && Array.isArray(r.options)) {
        const opts: FoxOption[] = r.options
          .filter((o: any) => o && o.days > 0)
          .map((o: any) => ({
            days: Number(o.days) || 0,
            cost_rubles: Number(o.cost_rubles) || 0,
            label: String(o.label || `${o.days} дн.`),
            can_afford: !!o.can_afford,
          }));
        setOptions(opts);
        if (opts.length && selected == null) setSelected(opts[0].days);
      } else {
        setError(r?.error || "Не удалось получить тарифы FoxCloud");
      }
    } catch (e: any) {
      setError(e?.message || "Нет соединения");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const balanceRub = Math.round((me?.balance || 0) / 100);

  const doRenew = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const r = await foxRenew(selected);
      if (r?.success) {
        await refreshMe().catch(() => {});
        load();
        Alert.alert("Подписка продлена ✅", r.message || `Продлено на ${selected} дн.`);
      } else if (r?.error === "insufficient_balance") {
        Alert.alert(
          "Недостаточно средств",
          `Для продления не хватает ${r.need_topup || ""} ₽. Пополнить баланс FoxCloud?`,
          [
            { text: "Отмена", style: "cancel" },
            { text: "Пополнить", onPress: () => nav.navigate("TopUp") },
          ]
        );
      } else {
        Alert.alert("Не удалось продлить", r?.error || "Попробуйте позже");
      }
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Нет соединения");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Ionicons name="flash-outline" size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Продление FoxCloud</Text>
          <Text style={styles.sub}>Баланс и подписка — в FoxCloud</Text>
        </View>
        <Text style={styles.balance}>{balanceRub} ₽</Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <Button title="Повторить" variant="ghost" onPress={load} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8, marginVertical: 10 }}>
            {options.map((o) => {
              const on = selected === o.days;
              return (
                <PressableScale
                  key={o.days}
                  style={[styles.opt, on && styles.optOn]}
                  onPress={() => setSelected(o.days)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Продление ${o.days} дней за ${o.cost_rubles} рублей`}
                >
                  <Text style={[styles.optDays, on && { color: colors.accent }]}>{o.days} дн.</Text>
                  <Text style={styles.optPrice}>{o.cost_rubles} ₽</Text>
                </PressableScale>
              );
            })}
          </View>
          <Button
            title={selected ? `Продлить на ${selected} дн.` : "Продлить"}
            onPress={doRenew}
            loading={busy}
            disabled={!selected}
          />
          <Button title="Пополнить баланс" variant="ghost" onPress={() => nav.navigate("TopUp")} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text, ...typo.heading },
  sub: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
  balance: { color: colors.green, fontSize: 15, fontWeight: "800" },
  error: { color: colors.red, fontSize: 13, marginBottom: 10, textAlign: "center" },
  opt: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  optOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optDays: { color: colors.text, fontSize: 14, fontWeight: "800" },
  optPrice: { color: colors.textDim, fontSize: 11, marginTop: 2 },
});
