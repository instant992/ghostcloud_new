import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { Button, ErrorText, Input, Row, Screen, Subtitle, Title, Card } from "../../components/UI";
import {
  checkEmail,
  createPayment,
  paymentStatus,
  sendEmailCode,
  verifyEmailCode,
} from "../../api";
import { colors } from "../../theme";

type Step = "email" | "code" | "plan" | "pay";

export default function RegisterScreen() {
  const nav = useNavigation<any>();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [regToken, setRegToken] = useState("");
  const [plans, setPlans] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [selectedPlan, setSelectedPlan] = useState("trial");
  const [paymentId, setPaymentId] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitEmail = async () => {
    setLoading(true);
    setError(null);
    try {
      const exists = await checkEmail(email.trim().toLowerCase());
      if (exists?.exists) {
        setError("Аккаунт с таким email уже есть — просто войдите");
        return;
      }
      const r = await sendEmailCode(email.trim().toLowerCase());
      if (r?.success === false) throw new Error(r?.error || "Ошибка отправки кода");
      setStep("code");
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await verifyEmailCode(email.trim().toLowerCase(), code.trim());
      if (!r?.success) throw new Error(r?.error || "Неверный код");
      setRegToken(r.registration_token || "");
      setPlans({
        trial: 30,
        "1_month": 160,
        "2_months": 300,
        "3_months": 410,
      });
      setNames({
        trial: "Тест 2 дня",
        "1_month": "1 месяц",
        "2_months": "2 месяца",
        "3_months": "3 месяца",
      });
      setStep("plan");
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const startPayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await createPayment({
        email: email.trim().toLowerCase(),
        plan: selectedPlan,
        source: "app",
        registration_token: regToken || undefined,
      });
      if (!r?.success) throw new Error(r?.error || "Не удалось создать платёж");
      setPaymentId(r.order_id || r.payment_id || "");
      setPayUrl(r.confirmation_url || "");
      setStep("pay");
      if (r.confirmation_url) {
        await WebBrowser.openBrowserAsync(r.confirmation_url);
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const checkPaid = async () => {
    if (!paymentId) return;
    setLoading(true);
    try {
      const r = await paymentStatus(paymentId);
      if (r?.status === "succeeded") {
        Alert.alert(
          "Готово!",
          r.login
            ? `Ваш логин: ${r.login}\nПароль придёт на почту. Войдите с ними в приложении.`
            : "Оплата прошла! Войдите в приложение.",
          [
            {
              text: "Войти",
              onPress: () => {
                nav.popToTop();
                if (r.login) nav.navigate("Login");
              },
            },
          ]
        );
      } else if (r?.status === "canceled") {
        setError("Платёж отменён");
      } else {
        setError("Платёж ещё не поступил. Подождите пару секунд после оплаты.");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>Регистрация</Title>
      <Subtitle>Создайте аккаунт GhostCloud за минуту</Subtitle>

      {step === "email" && (
        <>
          <Input
            placeholder="Ваш email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Получить код" onPress={submitEmail} loading={loading} />
          <Button title="Назад" variant="ghost" onPress={() => nav.goBack()} />
        </>
      )}

      {step === "code" && (
        <>
          <Card>
            <Row label="Email" value={email} />
          </Card>
          <Input
            placeholder="Код из письма"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Подтвердить" onPress={submitCode} loading={loading} />
        </>
      )}

      {step === "plan" && (
        <>
          {Object.keys(plans).map((key) => (
            <PlanOption
              key={key}
              label={names[key] || key}
              price={plans[key]}
              selected={selectedPlan === key}
              onPress={() => setSelectedPlan(key)}
            />
          ))}
          <ErrorText>{error}</ErrorText>
          <Button title={`Оплатить ${plans[selectedPlan]} ₽`} onPress={startPayment} loading={loading} />
        </>
      )}

      {step === "pay" && (
        <>
          <Card style={{ alignItems: "center", paddingVertical: 28 }}>
            <Text style={{ color: colors.textDim, textAlign: "center", marginBottom: 14 }}>
              Оплата открыта в браузере.{"\n"}После успешной оплаты вернитесь сюда.
            </Text>
            <Button title="Открыть страницу оплаты" variant="ghost" onPress={() => payUrl && WebBrowser.openBrowserAsync(payUrl)} />
          </Card>
          <ErrorText>{error}</ErrorText>
          <Button title="Я оплатил(а) — проверить" onPress={checkPaid} loading={loading} />
        </>
      )}
    </Screen>
  );
}

function PlanOption({
  label,
  price,
  selected,
  onPress,
}: {
  label: string;
  price: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: selected ? colors.accent : colors.border,
        borderWidth: 1.5,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }} onPress={onPress}>
        {label} — {price} ₽
      </Text>
    </View>
  );
}
