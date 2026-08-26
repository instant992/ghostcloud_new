import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Subtitle, Title } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { useApp } from "../context";
import { colors, splitNameFlag, formatBytes, useTheme, withAlpha } from "../theme";
import * as stats from "../stats";
import { getAppTraffic, type AppTrafficEntry } from "../vpn/native";

type Period = 1 | 7 | 30;

export default function StatsScreen() {
  useTheme();
  const styles = makeStyles();

  const { nodes, vpnRunning } = useApp();
  const [period, setPeriod] = useState<Period>(1);
  const [total, setTotal] = useState<stats.DayStat>({ rx: 0, tx: 0 });
  const [chart, setChart] = useState<Array<{ date: string; stat: stats.DayStat }>>([]);
  const [byNode, setByNode] = useState<Array<{ nodeId: string; rx: number; tx: number }>>([]);
  const [appTraffic, setAppTraffic] = useState<AppTrafficEntry[] | null>(null);

  // Трафик по приложениям — опрос каждые 10 секунд
  useEffect(() => {
    let alive = true;
    const load = () => {
      getAppTraffic().then((r) => {
        if (alive) setAppTraffic(r);
      });
    };
    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setTotal(await stats.sumDays(period));
        const raw14 = await stats.lastNDays(14);
        setChart(raw14);
        setByNode(await stats.nodeSums(period));
      })();
    }, [period])
  );

  const maxTotal = Math.max(
    ...chart.map((c) => c.stat.rx + c.stat.tx),
    1
  );

  const nodeName = (id: string): string => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return id;
    return splitNameFlag(n.name).name;
  };

  return (
    <Screen style={{ paddingTop: 64 }}>
      <Title>Статистика трафика</Title>
      <Subtitle>Считается локально на устройстве</Subtitle>

      <View style={styles.periodRow}>
        {([1, 7, 30] as Period[]).map((p) => (
          <PressableScale
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
          </PressableScale>
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

      <Text style={styles.chartTitle}>По серверам</Text>
      <View style={styles.chartCard}>
        {byNode.length === 0 ? (
          <Text style={{ color: colors.textFaint, fontSize: 13, textAlign: "center", paddingVertical: 10 }}>
            Пока нет данных — трафик считается во время подключения
          </Text>
        ) : (
          byNode.map((n) => {
            const sum = n.rx + n.tx;
            const share = total.rx + total.tx > 0 ? sum / (total.rx + total.tx) : 0;
            const info = nodes.find((x) => x.id === n.nodeId);
            return (
              <View key={n.nodeId} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {(info && splitNameFlag(info.name).flag) + " " + nodeName(n.nodeId)}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: 12 }}>{formatBytes(sum)}</Text>
                </View>
                <View style={styles.progressBg}>
                  <View style={[styles.progressBar, { width: `${Math.round(share * 100)}%` }]} />
                </View>
                <Text style={{ color: colors.textFaint, fontSize: 9, marginTop: 3 }}>
                  ↓ {formatBytes(n.rx)} · ↑ {formatBytes(n.tx)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.chartTitle}>Трафик по приложениям</Text>
      <View style={styles.chartCard}>
        {appTraffic === null ? (
          <Text style={{ color: colors.textFaint, fontSize: 13, textAlign: "center", paddingVertical: 10 }}>
            Недоступно на этом устройстве
          </Text>
        ) : appTraffic.length === 0 ? (
          <Text style={{ color: colors.textFaint, fontSize: 13, textAlign: "center", paddingVertical: 10 }}>
            {vpnRunning
              ? "Данные появятся через несколько секунд после подключения"
              : "Подключитесь к VPN — счётчики зафиксируются с момента подключения"}
          </Text>
        ) : (
          (() => {
            const maxApp = Math.max(...appTraffic.map((a) => a.rx + a.tx), 1);
            return appTraffic.slice(0, 20).map((a) => {
              const sum = a.rx + a.tx;
              const share = sum / maxApp;
              const letter = (a.appName[0] || "?").toUpperCase();
              return (
                <View key={a.packageName} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: colors.accentSoft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "800" }}>{letter}</Text>
                    </View>
                    <Text
                      style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 }}
                      numberOfLines={1}
                    >
                      {a.appName}
                    </Text>
                    <Text style={{ color: colors.textDim, fontSize: 12 }}>{formatBytes(sum)}</Text>
                  </View>
                  <View style={[styles.progressBg, { marginLeft: 40, marginTop: 5 }]}>
                    <View
                      style={[
                        styles.progressBar,
                        { width: `${Math.max(3, Math.round(share * 100))}%` },
                      ]}
                    />
                  </View>
                  <Text style={{ color: colors.textFaint, fontSize: 9, marginTop: 3, marginLeft: 40 }}>
                    ↓ {formatBytes(a.rx)} · ↑ {formatBytes(a.tx)}
                  </Text>
                </View>
              );
            });
          })()
        )}
      </View>

      <Text style={styles.note}>
        Трафик по приложениям считается системным счётчиком с момента последнего подключения VPN.
      </Text>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
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
  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgSoft,
    overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: colors.accent, borderRadius: 3 },
  note: { color: colors.textFaint, fontSize: 11, textAlign: "center" },
});
