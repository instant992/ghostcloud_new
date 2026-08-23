import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Subtitle, Title } from "../components/UI";
import { colors, formatBytes } from "../theme";
import * as stats from "../stats";

type Period = 1 | 7 | 30;

export default function StatsScreen() {
  const [period, setPeriod] = useState<Period>(1);
  const [total, setTotal] = useState<stats.DayStat>({ rx: 0, tx: 0 });
  const [chart, setChart] = useState<Array<{ date: string; stat: stats.DayStat }>>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setTotal(await stats.sumDays(period));
        const raw14 = await stats.lastNDays(14);
        setChart(raw14);
      })();
    }, [period])
  );

  const maxTotal = Math.max(
    ...chart.map((c) => c.stat.rx + c.stat.tx),
    1
  );

  return (
    <Screen style={{ paddingTop: 64 }}>
      <Title>Статистика трафика</Title>
      <Subtitle>Считается локально на устройстве</Subtitle>

      <View style={styles.periodRow}>
        {([1, 7, 30] as Period[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={[styles.periodBtn, period === p && styles.periodBtnOn]}
          >
            <Text
              style={[
                styles.periodText,
                period === p && { color: "#fff" },
              ]}
            >
              {p === 1 ? "День" : `${p} дней`}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.bigCard}>
        <Text style={styles.bigLabel}>{period === 1 ? "Сегодня" : `За ${period} дней`}</Text>
        <Text style={styles.bigValue}>{formatBytes(total.rx + total.tx)}</Text>
        <View style={{ flexDirection: "row", gap: 20, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sideLabel}>↓ Загружено</Text>
            <Text style={[styles.sideValue, { color: colors.accent }]}>
              {formatBytes(total.rx)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sideLabel}>↑ Отправлено</Text>
            <Text style={[styles.sideValue, { color: colors.green }]}>
              {formatBytes(total.tx)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.chartTitle}>Последние 14 дней</Text>
      <View style={styles.chartCard}>
        <View style={styles.bars}>
          {chart.map((d) => {
            const v = d.stat.rx + d.stat.tx;
            const h = Math.max(3, Math.round((v / maxTotal) * 90));
            return (
              <View key={d.date} style={styles.barWrap}>
                <Text style={styles.barValue}>
                  {v > 0 ? formatBytes(v) : ""}
                </Text>
                <View style={[styles.bar, { height: h }, v === 0 && { backgroundColor: colors.bgSoft }]} />
                <Text style={styles.barLabel}>{d.date.slice(8)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={styles.note}>
        Трафик считается системным счётчиком приложения во время активного VPN-подключения.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  periodRow: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 16,
  },
  periodBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 11,
  },
  periodBtnOn: { backgroundColor: colors.accentDeep },
  periodText: { color: colors.textDim, fontWeight: "700", fontSize: 13 },
  bigCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 16,
  },
  bigLabel: { color: colors.textDim, fontSize: 13 },
  bigValue: { color: colors.text, fontSize: 32, fontWeight: "800", marginTop: 4 },
  sideLabel: { color: colors.textFaint, fontSize: 12 },
  sideValue: { fontSize: 15, fontWeight: "700", marginTop: 2 },
  chartTitle: { color: colors.textDim, fontSize: 13, marginBottom: 8 },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  barWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: 130 },
  bar: {
    width: "100%",
    maxWidth: 22,
    backgroundColor: colors.accent,
    borderRadius: 6,
    marginBottom: 6,
  },
  barLabel: { color: colors.textFaint, fontSize: 9 },
  barValue: { color: colors.textDim, fontSize: 8, marginBottom: 3, textAlign: "center" },
  note: { color: colors.textFaint, fontSize: 11, textAlign: "center" },
});
