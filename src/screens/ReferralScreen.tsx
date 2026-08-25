import React, { useCallback, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, ErrorText, Input, Row, Screen, Subtitle, Title } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { referralApply, referralInfo } from "../api";
import { colors, useTheme } from "../theme";

type Referral = {
  email: string;
  created_at?: string;
  confirmed: boolean;
  confirmed_at?: string;
  is_trial: boolean;
};

export default function ReferralScreen() {
  useTheme();
  const styles = makeStyles();

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

  const nextTier = info.next_tier;

  return (
    <Screen>
      {/* Ссылка */}
      <Card>
        <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 6 }}>
          Твоя ссылка — приглашай и получай скидку
        </Text>
        <Text selectable style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
          {info.link}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <PressableScale
            style={styles.linkBtn}
            onPress={() => Clipboard.setStringAsync(info.link).catch(() => {})}
          >
            <Text style={styles.linkBtnText}>Копировать</Text>
          </PressableScale>
          <PressableScale
            style={styles.linkBtn}
            onPress={() =>
              Share.share({ message: `GhostCloud VPN — попробуй по моей ссылке: ${info.link}` }).catch(() => {})
            }
          >
            <Text style={styles.linkBtnText}>Поделиться</Text>
          </PressableScale>
        </View>
      </Card>

      {/* Сводка */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Card style={{ flex: 1, alignItems: "center", paddingVertical: 18 }}>
          <Text style={styles.bigNum}>{info.confirmed_count}</Text>
          <Text style={styles.smallLabel}>приглашено</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: "center", paddingVertical: 18 }}>
          <Text style={[styles.bigNum, { color: colors.green }]}>
            {info.discount_percent}%
          </Text>
          <Text style={styles.smallLabel}>твоя скидка</Text>
        </Card>
      </View>

      {/* Прогресс до следующего уровня */}
      <Card>
        <Row label="Подтверждено" value={`${info.confirmed_count}`} />
        {nextTier ? (
          <>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${
                      nextTier.needed > 0
                        ? Math.min(100, Math.round(((nextTier.needed - (nextTier.remaining || 0)) / nextTier.needed) * 100))
                        : 100
                    }%`,
                  },
                ]}
              />
            </View>
            <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 6 }}>
              Ещё {nextTier.remaining} чел. до скидки {nextTier.discount}%
            </Text>
          </>
        ) : (
          <Text style={{ color: colors.green, fontSize: 12, marginTop: 4 }}>
            Максимальный уровень достигнут 🎉
          </Text>
        )}
      </Card>

      {/* Бонус за использование кода */}
      {info.has_referrer && !info.bonus_received && (
        <Card style={{ borderColor: colors.accent }}>
          <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 4 }}>
            🎁 Бонус доступен
          </Text>
          <Text style={{ color: colors.textDim, fontSize: 12 }}>
            Ты пришёл по реферальной ссылке. Пополни баланс от 100 ₽ и получи +80 ₽ на счёт.
          </Text>
        </Card>
      )}
      {info.bonus_received && (
        <Card>
          <Row label="Бонус по коду друга" value="получен ✓" valueColor={colors.green} />
        </Card>
      )}

      {/* Ввод кода */}
      {!info.has_referrer && !info.bonus_received && (
        <Card>
          <Text style={{ color: colors.textDim, fontSize: 13, marginBottom: 8 }}>
            Есть код друга? Введи его — получишь +80 ₽ при первом пополнении от 100 ₽
          </Text>
          <Input placeholder="Реферальный код" autoCapitalize="characters" value={code} onChangeText={setCode} />
          <ErrorText>{error}</ErrorText>
          <Button title="Применить код" onPress={apply} loading={loading} />
        </Card>
      )}

      {/* Уровни */}
      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>Уровни скидок</Text>
        {info.tiers.map((t: any) => (
          <Row
            key={t.count}
            label={`${t.count}+ приглашённых`}
            value={`−${t.discount}%`}
            valueColor={info.confirmed_count >= t.count ? colors.green : colors.textFaint}
          />
        ))}
      </Card>

      {/* Список приглашённых */}
      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 8 }}>
          Приглашённые ({(info.referrals || []).length})
        </Text>
        {(info.referrals || []).length === 0 && (
          <Text style={{ color: colors.textFaint, fontSize: 13 }}>
            Пока никого. Поделись ссылкой!
          </Text>
        )}
        {(info.referrals || []).map((r: Referral, i: number) => (
          <View key={i} style={{ paddingVertical: 8, borderBottomWidth: i < info.referrals.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                {r.email}
              </Text>
              <Text
                style={{
                  color: r.confirmed ? colors.green : colors.orange,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {r.confirmed ? "подтверждён" : r.is_trial ? "триал" : "ожидает"}
              </Text>
            </View>
            {!!r.created_at && (
              <Text style={{ color: colors.textFaint, fontSize: 10, marginTop: 2 }}>
                {String(r.created_at).slice(0, 16)}
                {r.confirmed_at ? ` · подтверждён ${String(r.confirmed_at).slice(5, 16)}` : ""}
              </Text>
            )}
          </View>
        ))}
      </Card>

      <Subtitle>Скидка применяется автоматически при покупке подписки</Subtitle>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  linkBtn: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  linkBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  bigNum: { color: colors.text, fontSize: 24, fontWeight: "800" },
  smallLabel: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  progressBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgSoft,
    overflow: "hidden",
    marginTop: 6,
  },
  progressBar: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
});
