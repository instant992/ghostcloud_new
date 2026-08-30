import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Subtitle, Title, useScreenTopPad } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { useApp } from "../context";
import { colors, splitNameFlag, formatBytes, useTheme } from "../theme";
import { getAppIcon } from "../vpn/native";
import * as stats from "../stats";

type Period = 1 | 7 | 30;

/** Иконка приложения для списка «куда идёт трафик» */
function AppIconSmall({ pkg, name }: { pkg: string; name: string }) {
  useTheme();
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getAppIcon(pkg).then((b64) => {
      if (alive && b64) setIcon(b64);
    });
    return () => {
      alive = false;
    };
  }, [pkg]);
  if (icon) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${icon}` }}
        style={{ width: 30, height: 30, borderRadius: 8 }}
      />
    );
  }
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 12 }}>
        {(name[0] || "?").toUpperCase()}
      </Text>
    </View>
  );
}

export default function StatsScreen() {
  useTheme();
  const styles = makeStyles();

  const { nodes } = useApp();
  const [period, setPeriod] = useState<Period>(1);
  const [total, setTotal] = useState<stats.DayStat>({ rx: 0, tx: 0 });
  const [chart, setChart] = useState<Array<{ date: string; stat: stats.DayStat }>>([]);
  const [byNode, setByNode] = useState<Array<{ nodeId: string; rx: number; tx: number }>>([]);
  const [byApp, setByApp] = useState<Array<{ pkg: string; name: string; rx: number; tx: number }>>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setTotal(await stats.sumDays(period));
        const raw14 = await stats.lastNDays(14);
        setChart(raw14);
        setByNode(await stats.nodeSums(period));
        setByApp(await stats.appSums(period));
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
    <Screen style={useScreenTopPad()}>
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
        {chart.every((d) => d.stat.rx + d.stat.tx === 0) ? (
          <Text style={styles.chartEmpty}>
            Пока нет данных — график заполнится после первого подключения
          </Text>
        ) : (
          <View style={styles.bars}>
            {chart.map((d) => {
              const v = d.stat.rx + d.stat.tx;
              const h = Math.max(3, Math.round((v / maxTotal) * 90));
              return (
                <View key={d.date} style={styles.barWrap} accessibilityLabel={`${d.date.slice(8)}: ${v > 0 ? formatBytes(v) : "нет данных"}`}>
                  <View style={[styles.bar, { height: h }, v === 0 && { backgroundColor: colors.bgSoft }]} />
                  <Text style={styles.barLabel}>{d.date.slice(8)}</Text>
                </View>
              );
            })}
          </View>
        )}
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
                <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 3 }}>
                  ↓ {formatBytes(n.rx)} · ↑ {formatBytes(n.tx)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.chartTitle}>По приложениям</Text>
      <View style={styles.chartCard}>
        {byApp.length === 0 ? (
          <Text style={{ color: colors.textFaint, fontSize: 13, textAlign: "center", paddingVertical: 10 }}>
            Пока нет данных — трафик приложений считается во время подключения
          </Text>
        ) : (
          <>
            {byApp.slice(0, 20).map((a) => {
              const sum = a.rx + a.tx;
              const top = byApp[0].rx + byApp[0].tx;
              const share = top > 0 ? sum / top : 0;
              return (
                <View key={a.pkg} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <AppIconSmall pkg={a.pkg} name={a.name} />
                    <Text
                      style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 4 }}
                      numberOfLines={1}
                    >
                      {a.name || a.pkg}
                    </Text>
                    <Text style={{ color: colors.textDim, fontSize: 12 }}>{formatBytes(sum)}</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressBar, { width: `${Math.max(2, Math.round(share * 100))}%` }]} />
                  </View>
                  <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 3 }}>
                    ↓ {formatBytes(a.rx)} · ↑ {formatBytes(a.tx)}
                  </Text>
                </View>
              );
            })}
            {byApp.length > 20 && (
              <Text style={{ color: colors.textFaint, fontSize: 10, textAlign: "center" }}>
                Показаны топ-20 приложений по трафику
              </Text>
            )}
          </>
        )}
      </View>

      <Text style={styles.note}>
        Трафик считается системными счётчиками во время активного VPN-подключения.
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
  barWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: 110 },
  bar: {
    width: "100%",
    maxWidth: 22,
    backgroundColor: colors.accent,
    borderRadius: 6,
    marginBottom: 6,
  },
  barLabel: { color: colors.textFaint, fontSize: 10 },
  barValue: { color: colors.textDim, fontSize: 8, marginBottom: 3, textAlign: "center" },
  chartEmpty: { color: colors.textFaint, fontSize: 13, textAlign: "center", paddingVertical: 14 },
  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgSoft,
    overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: colors.accent, borderRadius: 3 },
  note: { color: colors.textFaint, fontSize: 11, textAlign: "center" },
});
