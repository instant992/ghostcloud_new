import React, { useState } from "react";
import { Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, ErrorText, Input, Screen, Subtitle, Title } from "../../components/UI";
import { resetPassword } from "../../api";

export default function ResetPasswordScreen() {
  const nav = useNavigation<any>();
  const [step, setStep] = useState<"email" | "done">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await resetPassword({ email: email.trim().toLowerCase() });
      if (r?.success === false) throw new Error(r?.error || "Ошибка");
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Title>Сброс пароля</Title>
      <Subtitle>Мы отправим новый пароль на вашу почту</Subtitle>
      {step === "email" ? (
        <>
          <Input
            placeholder="Ваш email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Отправить новый пароль" onPress={submit} loading={loading} />
          <Button title="Назад" variant="ghost" onPress={() => nav.goBack()} />
        </>
      ) : (
        <Card style={{ alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ color: "#fff", fontSize: 40, marginBottom: 10 }}>📧</Text>
          <Subtitle>Проверьте почту — там новый пароль</Subtitle>
          <Button title="К экрану входа" onPress={() => nav.popToTop()} />
        </Card>
      )}
    </Screen>
  );
}
