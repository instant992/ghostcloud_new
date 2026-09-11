import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Button } from "./UI";
import { PressableScale } from "./PressableScale";
import { foxRenew, foxRenewalOptions } from "../api";
import { useApp } from "../context";
import { colors, sheetSurfaceBg, typo } from "../theme";

type FoxOption = {
  days: number;
  cost_rubles: number;
  /** Подпись цены от Bedolaga («337 ₽») — копейки отображаются как в боте */
  cost_label?: string;
  /** Зачёркнутая старая цена, если есть скидка */
  original_label?: string;
  discount_percent?: number;
  is_recommended?: boolean;
  label: string;
  can_afford?: boolean;
};

/**
 * FoxCloud (вход через Telegram): компактный баннер в профиле с двумя
 * действиями — «Пополнить баланс» и «Продлить». Продление открывается
 * всплывающим окном (bottom-sheet) со списком периодов, ценой, скидкой,
 * текущим балансом и итоговой суммой списания.
 *
 * Цены и списание — из Bedolaga API: баланс и подписка живут там.
 */
export function FoxRenewSheet() {
  const nav = useNavigation<any>();
  const { me, refreshMe, subscriptionActive } = useApp();

  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<FoxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const balanceRub = (me?.balance || 0) / 100;

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
            cost_label: o.cost_label ? String(o.cost_label) : undefined,
            original_label: o.original_cost_label ? String(o.original_cost_label) : undefined,
            discount_percent: Number(o.discount_percent) || 0,
            is_recommended: !!o.is_recommended,
            label: String(o.label || `${o.days} дн.`),
            can_afford: !!o.can_afford,
          }));
        setOptions(opts);
        // Предвыбор: рекомендуемый тариф, иначе первый, на который хватает баланса
        setSelected((prev) => {
          if (prev != null && opts.some((o) => o.days === prev)) return prev;
          const rec = opts.find((o) => o.is_recommended);
          const affordable = opts.find((o) => o.can_afford);
          return (rec || affordable || opts[0])?.days ?? null;
        });
      } else {
        setError(r?.error || "Не удалось получить тарифы FoxCloud");
      }
    } catch (e: any) {
      setError(e?.message || "Нет соединения");
    } finally {
      setLoading(false);
    }
  }, []);

  const openSheet = () => {
    setOpen(true);
    load();
  };

  const selectedOpt = options.find((o) => o.days === selected) || null;
  const priceText = selectedOpt
    ? selectedOpt.cost_label || `${selectedOpt.cost_rubles} ₽`
    : "—";
  const enoughBalance = !!selectedOpt?.can_afford;
  const missingRub = selectedOpt && !enoughBalance
    ? Math.max(0, Math.ceil((selectedOpt.cost_rubles * 100 - (me?.balance || 0)) / 100))
    : 0;

  const doRenew = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const r = await foxRenew(selected);
      if (r?.success) {
        await refreshMe().catch(() => {});
        setOpen(false);
        Alert.alert("Подписка продлена ✅", r.message || `Продлено на ${selected} дн.`);
      } else if (r?.error === "insufficient_balance") {
        Alert.alert(
          "Недостаточно средств",
          `Для продления не хватает ${r.need_topup || missingRub} ₽. Пополнить баланс FoxCloud?`,
          [
            { text: "Отмена", style: "cancel" },
            {
              text: "Пополнить",
              onPress: () => {
                setOpen(false);
                nav.navigate("TopUp");
              },
            },
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

  // Дней до окончания — для подписи в баннере
  const daysLeft = (() => {
    if (!me?.expire_at) return null;
    const d = new Date(String(me.expire_at));
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
  })();

  return (
    <>
      {/* ── Баннер с двумя действиями ── */}
      <View style={styles.banner}>
        <View style={styles.bannerHead}>
          <View style={styles.bannerIcon}>
            <Ionicons name="flash" size={17} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Подписка FoxCloud</Text>
            <Text style={styles.bannerSub} numberOfLines={1}>
              {subscriptionActive && daysLeft != null
                ? `Активна · осталось ${daysLeft} дн.`
                : "Не активна — продлите, чтобы подключаться"}
            </Text>
          </View>
          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Баланс</Text>
            <Text style={styles.balanceValue}>{balanceRub.toFixed(0)} ₽</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <View style={{ flex: 1 }}>
            <Button size="sm" title="Продлить" onPress={openSheet} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              size="sm"
              title="Пополнить баланс"
              variant="ghost"
              onPress={() => nav.navigate("TopUp")}
            />
          </View>
        </View>
      </View>

      {/* ── Всплывающее окно продления ── */}
      {open && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.grabber} />
              <Text style={styles.sheetTitle}>Продление подписки</Text>
              <Text style={styles.sheetSub}>
                Тарифы и списание — из вашего аккаунта @foxicloudbot
              </Text>

              {loading ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.loadingText}>Загружаем тарифы…</Text>
                </View>
              ) : error ? (
                <View style={styles.centerBox}>
                  <Ionicons name="alert-circle-outline" size={28} color={colors.red} />
                  <Text style={styles.errorText}>{error}</Text>
                  <Button title="Повторить" variant="ghost" onPress={load} />
                </View>
              ) : (
                <>
                  <View style={styles.optionsRow}>
                    {options.map((o) => {
                      const on = selected === o.days;
                      const poor = !o.can_afford;
                      return (
                        <PressableScale
                          key={o.days}
                          style={[styles.opt, on && styles.optOn, poor && styles.optPoor]}
                          onPress={() => setSelected(o.days)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${o.label}, ${o.cost_label || `${o.cost_rubles} ₽`}${
                            o.is_recommended ? ", рекомендуем" : ""
                          }${poor ? ", не хватает средств" : ""}`}
                        >
                          {o.is_recommended && (
                            <View style={styles.recBadge}>
                              <Text style={styles.recBadgeText}>выгодно</Text>
                            </View>
                          )}
                          <Text style={[styles.optDays, on && { color: colors.accent }]}>
                            {o.label}
                          </Text>
                          {!!o.original_label && (
                            <Text style={styles.optOldPrice}>{o.original_label}</Text>
                          )}
                          <Text style={[styles.optPrice, on && { color: colors.text }]}>
                            {o.cost_label || `${o.cost_rubles} ₽`}
                          </Text>
                          {!!o.discount_percent && (
                            <Text style={styles.optDiscount}>−{o.discount_percent}%</Text>
                          )}
                        </PressableScale>
                      );
                    })}
                  </View>

                  {/* Итог: сумма, баланс, остаток после списания */}
                  <View style={styles.summary}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Период</Text>
                      <Text style={styles.summaryValue}>{selectedOpt?.label || "—"}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Сумма списания</Text>
                      <Text style={[styles.summaryValue, styles.summaryStrong]}>{priceText}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Баланс сейчас</Text>
                      <Text style={styles.summaryValue}>{balanceRub.toFixed(2)} ₽</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Останется после оплаты</Text>
                      <Text
                        style={[
                          styles.summaryValue,
                          enoughBalance ? { color: colors.green } : { color: colors.red },
                        ]}
                      >
                        {enoughBalance && selectedOpt
                          ? `${((me?.balance || 0) / 100 - selectedOpt.cost_rubles).toFixed(2)} ₽`
                          : `не хватает ${missingRub} ₽`}
                      </Text>
                    </View>
                  </View>

                  <Button
                    title={selected ? `Продлить за ${priceText}` : "Продлить"}
                    onPress={doRenew}
                    loading={busy}
                    disabled={!selected}
                  />
                  {!enoughBalance && !!selected && (
                    <Button
                      title={`Пополнить на ${missingRub} ₽`}
                      variant="ghost"
                      onPress={() => {
                        setOpen(false);
                        nav.navigate("TopUp");
                      }}
                    />
                  )}
                  <Button size="sm" title="Отмена" variant="ghost" onPress={() => setOpen(false)} />
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

/** Прежний inline-вариант (тарифы списком прямо в карточке) — оставлен для
 *  экрана «Тарифы», где всплывающее окно не нужно. */
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
            cost_label: o.cost_label ? String(o.cost_label) : undefined,
            original_label: o.original_cost_label ? String(o.original_cost_label) : undefined,
            discount_percent: Number(o.discount_percent) || 0,
            is_recommended: !!o.is_recommended,
            label: String(o.label || `${o.days} дн.`),
            can_afford: !!o.can_afford,
          }));
        setOptions(opts);
        if (opts.length && selected == null) {
          const rec = opts.find((o) => o.is_recommended);
          setSelected((rec || opts[0]).days);
        }
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
    <View style={styles.inlineCard}>
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
                  accessibilityLabel={`Продление ${o.days} дней за ${o.cost_label || `${o.cost_rubles} ₽`}`}
                >
                  <Text style={[styles.optDays, on && { color: colors.accent }]}>{o.days} дн.</Text>
                  {!!o.original_label && <Text style={styles.optOldPrice}>{o.original_label}</Text>}
                  <Text style={styles.optPrice}>{o.cost_label || `${o.cost_rubles} ₽`}</Text>
                  {!!o.discount_percent && (
                    <Text style={styles.optDiscount}>−{o.discount_percent}%</Text>
                  )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Баннер ──
  banner: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
    padding: 14,
  },
  bannerHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  bannerSub: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
  balanceBox: { alignItems: "flex-end" },
  balanceLabel: { color: colors.textFaint, fontSize: 10 },
  balanceValue: { color: colors.green, fontSize: 16, fontWeight: "800" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },

  // ── Всплывающее окно ──
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: sheetSurfaceBg(),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    padding: 18,
    paddingBottom: 28,
    gap: 8,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  sheetSub: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: "center",
    marginBottom: 6,
  },
  centerBox: { alignItems: "center", paddingVertical: 18, gap: 10 },
  loadingText: { color: colors.textDim, fontSize: 13 },
  errorText: { color: colors.red, fontSize: 13, textAlign: "center" },

  optionsRow: { flexDirection: "row", gap: 8, marginVertical: 6 },
  opt: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  optOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optPoor: { opacity: 0.55 },
  recBadge: {
    position: "absolute",
    top: -8,
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  recBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  optDays: { color: colors.text, fontSize: 13, fontWeight: "800" },
  optOldPrice: {
    color: colors.textFaint,
    fontSize: 10,
    marginTop: 2,
    textDecorationLine: "line-through",
  },
  optPrice: { color: colors.textDim, fontSize: 12, marginTop: 1, fontWeight: "700" },
  optDiscount: { color: colors.green, fontSize: 10, fontWeight: "800", marginTop: 1 },

  summary: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginVertical: 4,
    gap: 6,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: colors.textDim, fontSize: 12 },
  summaryValue: { color: colors.text, fontSize: 13, fontWeight: "700" },
  summaryStrong: { fontSize: 15, fontWeight: "800" },
  summaryDivider: { height: 1, backgroundColor: colors.border, opacity: 0.6, marginVertical: 2 },

  // ── Inline-вариант (экран «Тарифы») ──
  inlineCard: { gap: 2 },
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
});
