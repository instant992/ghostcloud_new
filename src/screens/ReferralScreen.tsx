import React, { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, ErrorText, Input, Row, Screen } from "../components/UI";
import { referralApply, referralInfo } from "../api";
import { colors } from "../theme";

export default function ReferralScreen() {
  const [info, setInfo] = useState<any>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await referralInfo();
      if (r?.success) setInfo(r);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const apply = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await referralApply(code.trim());
      if (!r?.success) throw new Error(r?.error || "Ошибка");
      Alert.alert("Готово", r.message || "Код применён");
      await load();
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  if (!info) return <Screen />;

  return (
    <Screen>
      <Card>
        <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 6 }}>Ваша ссылка</Text>
        <Text selectable style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
          {info.link}
        </Text>
        <Button title="Скопировать" variant="ghost" onPress={() => Clipboard.setStringAsync(info.link)} />
      </Card>

      <Card>
        <Row label="Приглашено" value={`${info.confirmed_count}`} />
        <Row label="Ваша скидка" value={`${info.discount_percent}%`} valueColor={colors.green} />
        {info.next_tier && (
          <Row label="До следующего уровня" value={`${info.next_tier.count - info.confirmed_count} чел.`} />
        )}
      </Card>

      {!info.has_referrer && !info.bonus_received && (
        <Card>
          <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 8 }}>
            Есть код друга? Введите его — получите +80 ₽ при первом пополнении от 100 ₽
          </Text>
          <Input placeholder="Реферальный код" autoCapitalize="characters" value={code} onChangeText={setCode} />
          <ErrorText>{error}</ErrorText>
          <Button title="Применить код" onPress={apply} loading={loading} />
        </Card>
      )}

      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Уровни скидок</Text>
        {info.tiers.map((t: any) => (
          <Row
            key={t.count}
            label={`${t.count}+ приглашённых`}
            value={`${t.discount}%`}
            valueColor={info.confirmed_count >= t.count ? colors.green : colors.textFaint}
          />
        ))}
      </Card>
    </Screen>
  );
}
