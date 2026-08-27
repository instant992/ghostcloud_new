import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../context";
import { colors, formatBytes, useTheme } from "../theme";
import { PressableScale } from "../components/PressableScale";
import { BalanceSheet } from "../components/BalanceSheet";
import * as stats from "../stats";

/** Раздел «Подписка» — перенесён из Flutter-версии: статус подписки,
 *  дни, трафик, устройства и управление. */
export default function SubscriptionScreen() {
  useTheme();
  const styles = makeStyles();
  const nav = useNavigation<any>();
  const { me, subscriptionActive } = useApp();
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });
  const [balanceOpen, setBalanceOpen] = useState(false);

  useEffect(() => {
    const load = () => stats.sumDays(1).then(setTodayStat).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me]);

  const expireDate = me?.expire_at
    ? new Date(String(me.expire_at)).toLocaleDateString("ru-RU")
    : "—";
  const balance = (me?.balance || 0) / 100;
  const periodProgress = Math.min(1, Math.max(0.03, daysLeft / 30));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 84, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>Моя подписка</Text>
      <Text style={styles.pageSub}>Управляйте своей подпиской и меняйте параметры</Text>

      {/* Статус подписки */}
      <View style={styles.heroCard}>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: subscriptionActive ? colors.green + "26" : colors.red + "26",
            },
          ]}
        >
          <Text
            style={[styles.statusPillText, { color: subscriptionActive ? colors.green : colors.red }]}
          >
            {subscriptionActive ? "Активна" : "Неактивна"}
          </Text>
        </View>
        <Text style={styles.planName}>{me?.plan || "Без подписки"}</Text>
        <Text style={styles.planHint}>
          {subscriptionActive ? "Ваша подписка активна" : "Подписка неактивна"}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
          <Text style={styles.daysText}>Осталось дней: {daysLeft}</Text>
          <Text style={styles.untilText}>до {expireDate}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(periodProgress * 100)}%` }]} />
        </View>
        <PressableScale style={styles.manageBtn} onPress={() => nav.navigate("Тарифы")}>
          <Text style={styles.manageBtnText}>
            {subscriptionActive ? "Продлить подписку" : "Управление подпиской"}
          </Text>
        </PressableScale>
      </View>

      {/* Трафик */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Трафик подписки</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={styles.cardRow}>Использовано сегодня:</Text>
          <Text style={styles.cardRowValue}>{formatBytes(todayStat.rx + todayStat.tx)}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={styles.cardSmall}>↓ Загружено {formatBytes(todayStat.rx)}</Text>
          <Text style={styles.cardSmall}>↑ Отправлено {formatBytes(todayStat.tx)}</Text>
        </View>
      </View>

      {/* Устройства */}
      <PressableScale style={styles.card} onPress={() => nav.navigate("Devices")}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={styles.devicesIcon}>
            <Ionicons name="phone-portrait-outline" size={21} color={colors.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.cardTitle}>Мои устройства</Text>
            <Text style={styles.cardSmall}>
              {me?.device_count ?? 0} из {me?.device_limit ?? 6}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </View>
      </PressableScale>

      {/* Баланс */}
      <PressableScale style={styles.card} onPress={() => setBalanceOpen(true)}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={[styles.devicesIcon, { backgroundColor: colors.green + "1F" }]}>
            <Ionicons name="wallet-outline" size={21} color={colors.green} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.cardTitle}>Баланс</Text>
            <Text style={styles.cardSmall}>{balance.toFixed(0)} ₽ · история операций</Text>
          </View>
          <View style={styles.topupPill}>
            <Ionicons name="add" size={13} color={colors.accent} />
            <Text style={styles.topupPillText}>Пополнить</Text>
          </View>
        </View>
      </PressableScale>

      <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={balance}
        daysLeft={daysLeft}
      />
    </ScrollView>
  );
}

const makeStyles = () => StyleSheet.create({
  pageTitle: { color: colors.text, fontSize: 24, fontWeight: "700", textAlign: "center" },
  pageSub: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusPillText: { fontSize: 13, fontWeight: "600" },
  planName: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 10 },
  planHint: { color: colors.textDim, fontSize: 14, marginTop: 2 },
  daysText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  untilText: { color: colors.textDim, fontSize: 13 },
  progressTrack: {
    height: 5,
    borderRadius: 6,
    backgroundColor: colors.accentSoft,
    marginTop: 10,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 6, backgroundColor: colors.accent },
  manageBtn: {
    backgroundColor: colors.accentDeep,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  manageBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  cardRow: { color: colors.textDim, fontSize: 13 },
  cardRowValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
  cardSmall: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  devicesIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  topupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  topupPillText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
});
