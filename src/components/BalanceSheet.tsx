import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { autoRenewGet, autoRenewSet, balanceHistory } from "../api";
import { useApp } from "../context";
import { colors, sheetSurfaceBg, useTheme } from "../theme";
import { PressableScale } from "./PressableScale";
import { ThemeSwitch } from "./ThemeSwitch";
import { showToast } from "./Toast";

type Tx = {
  id?: number;
  type?: string;
  amount?: number;
  description?: string;
  created_at?: string;
};

type AutoRenewInfo = {
  enabled: boolean;
  plan: string;
  plans: Array<{ key: string; name: string; price: number }>;
};

const TYPE_INFO: Record<string, { emoji: string; label: string; color: string }> = {
  topup: { emoji: "💰", label: "Пополнение", color: "#34D399" },
  payment: { emoji: "💳", label: "Оплата подписки", color: "#F87171" },
  device: { emoji: "📱", label: "Доп. устройства", color: "#FBBF24" },
  promo: { emoji: "🎁", label: "Промокод", color: "#A855F7" },
  referral_bonus: { emoji: "🤝", label: "Реф. бонус", color: "#60A5FA" },
  referral_cashback: { emoji: "💸", label: "Реф. кэшбэк", color: "#22D3EE" },
};

function fmtDate(s?: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16);
  return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Мини-шторка баланса — как в старом приложении: пополнить, продлить,
 *  автопродление и история операций. */
export function BalanceSheet({
  visible,
  onClose,
  balance,
  daysLeft,
}: {
  visible: boolean;
  onClose: () => void;
  balance: number;
  daysLeft: number;
}) {
  useTheme();
  const styles = makeStyles();
  const nav = useNavigation<any>();
  const { isFoxcloud } = useApp();
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [autoRenew, setAutoRenew] = useState<AutoRenewInfo | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // FoxiCloud: баланс/автопродление живут в Bedolaga — локальная история
      // и автопродление GhostCloud не применяются.
      const [h, ar] = await Promise.all([
        isFoxcloud ? null : balanceHistory().catch(() => null),
        isFoxcloud ? null : autoRenewGet().catch(() => null),
      ]);
      if (cancelled) return;
      if (h?.success && Array.isArray(h.transactions)) setTxs(h.transactions);
      if (ar?.success) {
        setAutoRenew({
          enabled: Boolean(ar.enabled),
          plan: String(ar.plan || ""),
          plans: Array.isArray(ar.plans) ? ar.plans : [],
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, isFoxcloud]);

  const sumBy = (sign: 1 | -1) =>
    txs.reduce((acc, t) => {
      const v = Number(t.amount || 0) / 100;
      return sign > 0 ? acc + Math.max(0, v) : acc + Math.abs(Math.min(0, v));
    }, 0);

  const toggleAutoRenew = async (v: boolean) => {
    if (!autoRenew || autoBusy) return;
    setAutoBusy(true);
    try {
      const r = await autoRenewSet(v, autoRenew.plan || autoRenew.plans[0]?.key || "");
      if (r?.success === false) throw new Error(r?.error || "Ошибка");
      setAutoRenew({ ...autoRenew, enabled: v });
      showToast(v ? "Автопродление включено" : "Автопродление выключено");
    } catch (e: any) {
      showToast(e?.message || "Не удалось изменить автопродление");
    }
    setAutoBusy(false);
  };

  const pickAutoRenewPlan = async (key: string) => {
    if (!autoRenew || autoBusy) return;
    setAutoBusy(true);
    try {
      const r = await autoRenewSet(autoRenew.enabled, key);
      if (r?.success === false) throw new Error(r?.error || "Ошибка");
      setAutoRenew({ ...autoRenew, plan: key });
    } catch (e: any) {
      showToast(e?.message || "Не удалось выбрать тариф");
    }
    setAutoBusy(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Ionicons name="wallet-outline" size={20} color={colors.accent} />
            <Text style={styles.title}>Баланс</Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close" size={18} color={colors.textFaint} />
            </Pressable>
          </View>

          {/* Текущий баланс */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceIcon}>
              <Ionicons name="wallet-outline" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.balanceLabel}>Текущий баланс</Text>
              <Text style={styles.balanceValue}>{balance.toFixed(0)} ₽</Text>
            </View>
            <PressableScale
              style={styles.topupBtn}
              onPress={() => {
                onClose();
                nav.navigate("TopUp");
              }}
              accessibilityRole="button"
              accessibilityLabel="Пополнить баланс"
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.topupBtnText}>Пополнить</Text>
            </PressableScale>
          </View>

          {/* Продление */}
          <PressableScale
            style={styles.actionRow}
            onPress={() => {
              onClose();
              nav.navigate("Тарифы");
            }}
            accessibilityRole="button"
            accessibilityLabel={`Продлить подписку. ${daysLeft > 0 ? `Осталось ${daysLeft} дн.` : "Подписка истекла"}`}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.green + "26" }]}>
              <Ionicons name="cart-outline" size={19} color={colors.green} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.actionTitle}>Продлить подписку</Text>
              <Text style={styles.actionSub}>
                {daysLeft > 0 ? `Осталось ${daysLeft} дн.` : "Подписка истекла"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </PressableScale>

          {loading ? (
            <View style={{ paddingVertical: 26, alignItems: "center" }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : isFoxcloud ? (
            <View style={{ alignItems: "center", paddingVertical: 22 }}>
              <Ionicons name="wallet-outline" size={38} color={colors.accent} />
              <Text style={{ color: colors.textDim, fontSize: 13, marginTop: 8, textAlign: "center" }}>
                Баланс и операции — в аккаунте FoxCloud.{"\n"}
                История доступна в @foxicloudbot.
              </Text>
            </View>
          ) : (
            <ScrollView
          bounces={false}
          overScrollMode="never" style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {/* Итого */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <View style={[styles.summaryCard, { flex: 1 }]}>
                  <Ionicons name="arrow-down" size={13} color={colors.green} />
                  <Text style={styles.summaryLabel}>Пополнения</Text>
                  <Text style={[styles.summaryValue, { color: colors.green }]}>
                    +{sumBy(1).toFixed(0)} ₽
                  </Text>
                </View>
                <View style={[styles.summaryCard, { flex: 1 }]}>
                  <Ionicons name="arrow-up" size={13} color={colors.red} />
                  <Text style={styles.summaryLabel}>Списания</Text>
                  <Text style={[styles.summaryValue, { color: colors.red }]}>
                    −{sumBy(-1).toFixed(0)} ₽
                  </Text>
                </View>
              </View>

              {/* Автопродление */}
              {autoRenew && (
                <View style={styles.autoCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="refresh" size={17} color={colors.accent} />
                    <Text style={styles.autoTitle}>Автопродление</Text>
                    <View style={{ flex: 1 }} />
                    <ThemeSwitch
                      value={autoRenew.enabled}
                      onValueChange={toggleAutoRenew}
                      accessibilityLabel="Автопродление"
                    />
                  </View>
                  {!!autoRenew.enabled && autoRenew.plans.length > 0 && (
                    <>
                      <Text style={styles.autoHint}>Тариф автопродления</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {autoRenew.plans.map((p) => {
                          const on = autoRenew.plan === p.key;
                          return (
                            <PressableScale
                              key={p.key}
                              style={[styles.planChip, on && styles.planChipOn]}
                              onPress={() => pickAutoRenewPlan(p.key)}
                            >
                              <Text style={[styles.planChipText, on && { color: "#fff" }]}>
                                {p.name} — {p.price} ₽
                              </Text>
                            </PressableScale>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* История операций */}
              <Text style={styles.historyTitle}>История операций</Text>
              {txs.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <Ionicons name="receipt-outline" size={38} color={colors.textFaint} />
                  <Text style={{ color: colors.textDim, fontSize: 13, marginTop: 8 }}>Нет операций</Text>
                </View>
              ) : (
                txs.slice(0, 30).map((t, i) => {
                  const amount = Number(t.amount || 0) / 100;
                  const info = TYPE_INFO[String(t.type)] || {
                    emoji: "📄",
                    label: String(t.type || "Операция"),
                    color: colors.textDim,
                  };
                  return (
                    <View key={t.id ?? i} style={styles.txRow}>
                      <View style={[styles.txIcon, { backgroundColor: info.color + "26" }]}>
                        <Text style={{ fontSize: 16 }}>{info.emoji}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.txTitle}>{info.label}</Text>
                        {!!t.description && (
                          <Text style={styles.txDesc} numberOfLines={1}>
                            {t.description}
                          </Text>
                        )}
                        <Text style={styles.txDate}>{fmtDate(t.created_at)}</Text>
                      </View>
                      <Text
                        style={[
                          styles.txAmount,
                          { color: amount >= 0 ? colors.green : colors.red },
                        ]}
                      >
                        {amount >= 0 ? "+" : ""}
                        {amount.toFixed(0)} ₽
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: sheetSurfaceBg(),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 26,
    maxHeight: "84%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  balanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceLabel: { color: colors.textDim, fontSize: 12 },
  balanceValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 1 },
  topupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentDeep,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topupBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  actionSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  summaryCard: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  summaryLabel: { color: colors.textDim, fontSize: 11 },
  summaryValue: { fontSize: 15, fontWeight: "800" },
  autoCard: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  autoTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  autoHint: { color: colors.textDim, fontSize: 12, marginTop: 8, marginBottom: 6 },
  planChip: {
    backgroundColor: sheetSurfaceBg(),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  planChipOn: { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep },
  planChipText: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  historyTitle: { color: colors.textDim, fontSize: 13, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  txDesc: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  txDate: { color: colors.textFaint, fontSize: 10, marginTop: 1 },
  txAmount: { fontSize: 14, fontWeight: "800", marginLeft: 8 },
});
