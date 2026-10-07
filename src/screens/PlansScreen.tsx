import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Button, Card, ErrorText, Row, Screen, ThemedCard, Title, useScreenTopPad } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { ProviderPicker } from "../components/ProviderPicker";
import { SpinnerRing } from "../components/Foundations";
import { checkPromo, createPayment, extendFromBalance, getPrices, paymentStatus } from "../api";
import { useApp } from "../context";
import { FoxRenew } from "../components/FoxRenew";
import { colors, useTheme } from "../theme";

type Step = "plans" | "email" | "paying" | "waiting" | "success";

type PromoResult = {
  valid: boolean;
  isDiscount?: boolean;
  discountPercent?: number;
  finalPrice?: number;
  message?: string;
  error?: string;
};

export default function PlansScreen() {
  useTheme();
  const styles = makeStyles();

  const nav = useNavigation<any>();
  const { me, refreshMe, isFoxcloud } = useApp();
  const topPad = useScreenTopPad();

  const [step, setStep] = useState<Step>("plans");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [originalPrices, setOriginalPrices] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [selectedPlan, setSelectedPlan] = useState("1_month");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailLocked, setEmailLocked] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [promoExpanded, setPromoExpanded] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ login?: string; password?: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getPrices()
        .then((r) => {
          if (r?.success && r.prices) {
            setPrices(r.prices);
            setNames(r.names || {});
            if (r.original_prices) setOriginalPrices(r.original_prices);
          }
        })
        .catch(() => {});
    }, [])
  );

  const planKeys = Object.keys(prices).length
    ? Object.keys(prices).filter((k) => k !== "trial")
    : ["1_month", "2_months", "3_months"];

  const selectedPrice = prices[selectedPlan] ?? planPrice(selectedPlan);

  const hasSale = (key: string) =>
    !!originalPrices[key] && originalPrices[key] > (prices[key] ?? 0);

  const displayPrice = promoResult?.valid && promoResult.isDiscount ? promoResult.finalPrice ?? selectedPrice : selectedPrice;

  const openEmailStep = () => {
    const cached = me?.email || "";
    if (cached) {
      setEmail(cached);
      setEmailLocked(true);
    } else if (!email) {
      setEmail(me?.login ? `${me.login}@ghostcloud.local` : "");
    }
    setEmailError(null);
    setStep("email");
  };

  const validateEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

  const checkPromoCode = async () => {
    const code = promo.trim();
    if (!code || !selectedPlan) return;
    setPromoChecking(true);
    try {
      const r = await checkPromo(code, selectedPlan);
      setPromoResult({
        valid: !!r?.valid,
        isDiscount: r?.discount === true || typeof r?.final_price === "number",
        discountPercent: r?.discount_percent,
        finalPrice: r?.final_price,
        message: r?.message,
        error: r?.error,
      });
    } catch {
      setPromoResult({ valid: false, error: "Не удалось проверить промокод" });
    } finally {
      setPromoChecking(false);
    }
  };

  const startPayment = async () => {
    if (!validateEmail(email)) {
      setEmailError("Введите корректный email");
      return;
    }
    setEmailError(null);
    setLoading(true);
    setStep("paying");
    try {
      const r = await createPayment({
        email: email.trim(),
        plan: selectedPlan,
        promo_code: promoResult?.valid ? promo.trim() : undefined,
        provider: provider || undefined,
        source: "app",
      });
      if (!r?.success) throw new Error(r?.error || "Не удалось создать платёж");
      const orderId = r.order_id || r.payment_id;
      if (r.confirmation_url) await WebBrowser.openBrowserAsync(r.confirmation_url);
      setStep("waiting");

      let done = false;
      for (let i = 0; i < 40 && !done; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        try {
          const st = await paymentStatus(orderId);
          if (st?.status === "succeeded") {
            done = true;
            setCredentials({ login: st?.login, password: st?.password });
            setStep("success");
            await refreshMe();
          } else if (st?.status === "canceled") {
            throw new Error("Платёж отменён");
          }
        } catch {}
      }
      if (!done) {
        setStep("plans");
        Alert.alert(
          "Платёж не подтверждён",
          "Если вы уже оплатили — подписка появится через пару минут."
        );
      }
    } catch (e: any) {
      setStep("plans");
      setError(e?.message || "Ошибка оплаты");
    } finally {
      setLoading(false);
    }
  };

  const extendWithBalance = () =>
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
              setCredentials({ login: me?.login });
              setStep("success");
              await refreshMe();
            } catch (e: any) {
              setError(e?.message || "Ошибка");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );

  // ── FoxiCloud (Telegram-авторизация): тарифы и продление — через Bedolaga API ──
  if (isFoxcloud) {
    return (
      <Screen style={topPad}>
        <Title>Продлить подписку</Title>
        <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 12 }}>
          Подписка и баланс FoxCloud — тарифы подтягиваются из @foxicloudbot
        </Text>
        <FoxRenew />
      </Screen>
    );
  }

  // ── Шаг: выбор тарифа ──
  if (step === "plans") {
    const anySale = planKeys.some(hasSale);
    const salePercent = (() => {
      for (const k of planKeys) {
        if (hasSale(k)) {
          const p = prices[k];
          const o = originalPrices[k];
          if (p && o && o > p) return Math.round(((o - p) / o) * 100);
        }
      }
      return null;
    })();

    return (
      <Screen style={topPad}>
        <Title>{me?.plan ? "Продлить подписку" : "Купить подписку"}</Title>

        {!!anySale && (
          <View style={styles.saleBanner}>
            <Ionicons name="pricetag" size={18} color={colors.accent} />
            <Text style={styles.saleBannerText}>
              Скидка{salePercent ? ` ${salePercent}%` : ""} на все тарифы!
            </Text>
          </View>
        )}

        {planKeys.map((key) => {
          const active = selectedPlan === key;
          const trial = key === "trial";
          return (
            <PressableScale
              key={key}
              onPress={() => setSelectedPlan(key)}
              style={styles.planCardPress}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Тариф ${names[key] || planLabel(key)}, ${prices[key] ?? planPrice(key)} рублей`}
            >
              <ThemedCard style={styles.planCard}>
                <View
                  style={[
                    styles.planIconWrap,
                    { backgroundColor: trial ? colors.orange + "26" : colors.accentSoft },
                  ]}
                >
                  <Ionicons
                    name={trial ? "flash" : "shield-outline"}
                    size={22}
                    color={trial ? colors.orange : colors.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planName}>{names[key] || planLabel(key)}</Text>
                  {!!hasSale(key) && (
                    <Text style={[styles.planSub, { color: colors.accent }]}>
                      -{Math.round(((originalPrices[key] - prices[key]) / originalPrices[key]) * 100)}% скидка
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.planPrice, active && { color: colors.accent }]}>
                    {prices[key] ?? planPrice(key)} ₽
                  </Text>
                  {!!hasSale(key) && (
                    <Text style={styles.planOldPrice}>{originalPrices[key]} ₽</Text>
                  )}
                </View>
                {active && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                )}
              </ThemedCard>
            </PressableScale>
          );
        })}
        {!planKeys.length && (
          <Card>
            <Text style={{ color: colors.textDim, textAlign: "center", paddingVertical: 12 }}>
              Не удалось загрузить тарифы. Проверьте соединение.
            </Text>
          </Card>
        )}

        <ErrorText>{error}</ErrorText>
        <Button title={`Далее — ${selectedPrice} ₽`} disabled={!selectedPlan} onPress={openEmailStep} />

        <Button title="Пополнить баланс" variant="ghost" size="sm" onPress={() => nav.navigate("TopUp")} />

        <Card style={{ marginTop: 8 }}>
          <Row label="Текущий тариф" value={me?.plan || "—"} />
          <Row label="Устройства" value={`${me?.device_count ?? 0} / ${me?.device_limit ?? 6}`} />
          <Row label="Баланс" value={`${((me?.balance || 0) / 100).toFixed(0)} ₽`} valueColor={colors.accent} />
        </Card>
      </Screen>
    );
  }

  // ── Шаг: создание платежа ──
  if (step === "paying") {
    return (
      <Screen style={{ paddingTop: 120, alignItems: "center" }}>
        <SpinnerRing />
        <Text style={styles.waitTitle}>Создаём платёж…</Text>
        <Button title="Отмена" variant="ghost" size="sm" onPress={() => setStep("email")} />
      </Screen>
    );
  }

  // ── Шаг: ожидание оплаты ──
  if (step === "waiting") {
    return (
      <Screen style={{ paddingTop: 120, alignItems: "center" }}>
        <SpinnerRing />
        <Text style={styles.waitTitle}>Проверяем оплату…</Text>
        <Text style={styles.waitHint}>
          Если вы уже оплатили — подождите,{"\n"}подтверждение придёт автоматически.
        </Text>
        <Button title="Отменить" variant="ghost" size="sm" onPress={() => setStep("plans")} />
      </Screen>
    );
  }

  // ── Шаг: успех ──
  if (step === "success") {
    return (
      <Screen style={{ paddingTop: 110, alignItems: "center" }}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle-outline" size={52} color={colors.green} />
        </View>
        <Text style={styles.waitTitle}>Оплата прошла!</Text>
        <Text style={styles.waitHint}>Подписка активирована.</Text>
        {credentials?.login && (
          <Card style={{ alignSelf: "stretch", marginTop: 18 }}>
            <Row label="Логин" value={credentials.login} />
            {!!credentials.password && <Row label="Пароль" value={credentials.password} />}
            <PressableScale
              onPress={() => {
                const t = `Логин: ${credentials.login}\nПароль: ${credentials.password || "—"}`;
                Clipboard.setStringAsync(t).catch(() => {});
                Alert.alert("Скопировано", "Данные входа в буфере обмена");
              }}
            >
              <Text style={styles.copyCreds}>Скопировать данные</Text>
            </PressableScale>
          </Card>
        )}
        <View style={{ alignSelf: "stretch", marginTop: 14 }}>
          <Button title="Готово" onPress={() => setStep("plans")} />
        </View>
      </Screen>
    );
  }

  // ── Шаг: email + промокод + оплата ──
  return (
    <Screen style={topPad}>
      <PressableScale style={styles.backBtn} onPress={() => setStep("plans")} hitSlop={8}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
        <Text style={styles.backBtnText}>К выбору тарифа</Text>
      </PressableScale>

      <Title>Введите email</Title>
      <Text style={styles.stepHint}>На этот email будут отправлены данные для входа.</Text>

      <View style={[styles.emailField, emailLocked && { backgroundColor: colors.bgSoft }]}>
        <TextInput
          style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 4 }}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setEmailLocked(false);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!emailLocked}
          placeholder="example@mail.com"
          placeholderTextColor={colors.textFaint}
        />
        {emailLocked && <Ionicons name="lock-closed-outline" size={16} color={colors.textDim} />}
      </View>
      {emailLocked && (
        <PressableScale onPress={() => setEmailLocked(false)}>
          <Text style={styles.unlockEmail}>✕ Изменить email</Text>
        </PressableScale>
      )}
      {!!emailError && <Text style={styles.fieldError}>{emailError}</Text>}
      <Text style={styles.planSummary}>
        Тариф: {names[selectedPlan] || planLabel(selectedPlan)} — {selectedPrice} ₽
      </Text>

      <PressableScale style={styles.promoToggle} onPress={() => setPromoExpanded((s) => !s)}>
        <Ionicons name="pricetag-outline" size={15} color={colors.accent} />
        <Text style={styles.promoToggleText}>Есть промокод?</Text>
        <Ionicons
          name={promoExpanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.accent}
        />
      </PressableScale>
      {promoExpanded && (
        <View style={{ gap: 8, marginBottom: 6 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              style={[styles.emailField, { flex: 1 }]}
              value={promo}
              onChangeText={(v) => {
                setPromo(v);
                setPromoResult(null);
              }}
              autoCapitalize="characters"
              placeholder="Введите промокод"
              placeholderTextColor={colors.textFaint}
            />
            <Button title="Применить" size="sm" loading={promoChecking} onPress={checkPromoCode} />
          </View>
          {promoResult?.valid ? (
            <View style={styles.promoOk}>
              <Ionicons name="checkmark-circle" size={15} color={colors.green} />
              <Text style={[styles.promoMsg, { color: colors.green }]}>
                {promoResult.isDiscount
                  ? `Скидка ${promoResult.discountPercent ?? ""}% — итого ${promoResult.finalPrice} ₽`
                  : promoResult.message || "Промокод применён"}
              </Text>
            </View>
          ) : promoResult ? (
            <Text style={[styles.promoMsg, { color: colors.red }]}>
              {promoResult.error || "Промокод недействителен"}
            </Text>
          ) : null}
        </View>
      )}

      <ProviderPicker value={provider} onChange={setProvider} />

      <ErrorText>{error}</ErrorText>
      <Button title={`Оплатить ${displayPrice} ₽`} loading={loading} onPress={startPayment} />
      <Button
        title={`Продлить с баланса (${names[selectedPlan] || planLabel(selectedPlan)})`}
        variant="ghost"
        size="sm"
        onPress={extendWithBalance}
      />
    </Screen>
  );
}

function ActivityIndicatorBig() {
  return <SpinnerRing />;
}

function planLabel(key: string): string {
  return { trial: "Тест 2 дня", "1_month": "1 месяц", "2_months": "2 месяца", "3_months": "3 месяца" }[key] || key;
}

function planPrice(key: string): number {
  return { trial: 30, "1_month": 160, "2_months": 300, "3_months": 410 }[key] ?? 0;
}

const makeStyles = () =>
  StyleSheet.create({
    saleBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent + "4D",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
    },
    saleBannerText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
    planCardPress: { marginBottom: 10 },
    planCard: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 14,
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    planIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    planName: { color: colors.text, fontWeight: "700", fontSize: 15 },
    planSub: { fontSize: 11, fontWeight: "700", marginTop: 2 },
    planOldPrice: {
      color: colors.textFaint,
      fontSize: 12,
      textDecorationLine: "line-through" as const,
    },
    planPrice: { color: colors.text, fontWeight: "800", fontSize: 17 },
    backBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      marginBottom: 14,
    },
    backBtnText: { color: colors.textDim, fontWeight: "600", fontSize: 13 },
    stepHint: { color: colors.textDim, fontSize: 13, marginBottom: 14 },
    emailField: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    unlockEmail: {
      color: colors.textDim,
      fontSize: 12,
      textDecorationLine: "underline" as const,
      marginTop: 6,
    },
    fieldError: { color: colors.red, fontSize: 12, marginTop: 6 },
    planSummary: { color: colors.textFaint, fontSize: 12, marginVertical: 10 },
    promoToggle: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      marginBottom: 10,
    },
    promoToggleText: { color: colors.accent, fontWeight: "600", fontSize: 13 },
    promoOk: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      backgroundColor: colors.green + "1A",
      borderWidth: 1,
      borderColor: colors.green + "4D",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    promoMsg: { fontSize: 12, fontWeight: "600", flex: 1 },
    waitTitle: {
      color: colors.text,
      fontSize: 19,
      fontWeight: "800",
      textAlign: "center" as const,
      marginBottom: 8,
    },
    waitHint: {
      color: colors.textDim,
      fontSize: 13,
      textAlign: "center" as const,
      lineHeight: 20,
      marginBottom: 20,
    },
    successIcon: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.green + "26",
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginBottom: 18,
    },
    copyCreds: { color: colors.accent, fontSize: 12, fontWeight: "700", marginTop: 10 },
  });
