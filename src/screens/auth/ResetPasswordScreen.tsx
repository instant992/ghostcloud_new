import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Button, Card, ErrorText, Input, Screen, Subtitle, Title } from "../../components/UI";
import { IconButton } from "../../components/Foundations";
import { resetPassword } from "../../api";
import { colors, useTheme } from "../../theme";

export default function ResetPasswordScreen() {
  useTheme();
  const styles = makeStyles();
  const nav = useNavigation<any>();
  const [step, setStep] = useState<"email" | "done">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim()) {
      setError("Введите email");
      return;
    }
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
      <View style={styles.header}>
        <IconButton icon="arrow-back" label="Назад" onPress={() => nav.goBack()} />
        <View style={{ flex: 1 }} />
      </View>
      <Title>Сброс пароля</Title>
      <Subtitle>Мы отправим новый пароль на вашу почту</Subtitle>
      {step === "email" ? (
        <>
          <Input
            label="Email"
            placeholder="Ваш email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Отправить новый пароль" onPress={submit} loading={loading} />
        </>
      ) : (
        <Card style={{ alignItems: "center", paddingVertical: 30 }}>
          <View style={styles.doneIcon}>
            <Ionicons name="mail-open-outline" size={30} color={colors.green} />
          </View>
          <Subtitle>Проверьте почту — там новый пароль</Subtitle>
          <Button title="К экрану входа" onPress={() => nav.popToTop()} />
        </Card>
      )}
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    doneIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.green + "26",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
  });
