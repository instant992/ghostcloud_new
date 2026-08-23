import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useApp } from "../context";
import { connect, disconnect } from "../vpn/manager";
import * as pingStore from "../vpn/pingStore";
import { transportLabel } from "../utils/transportLabel";
import * as stats from "../stats";
import { colors, splitNameFlag, formatBytes } from "../theme";

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, subscriptionActive, reloadNodes } = useApp();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });
  const [weekStat, setWeekStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });

  const loadStats = useCallback(() => {
    stats.sumDays(1).then(setTodayStat).catch(() => {});
    stats.sumDays(7).then(setWeekStat).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      loadStats();
      if (!vpnRunning) return;
      const t = setInterval(loadStats, 15000);
      return () => clearInterval(t);
    }, [vpnRunning, loadStats])
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null,
    [nodes, selectedNodeId]
  );

  useEffect(() => {
    if (!vpnRunning) {
      setSeconds(0);
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [vpnRunning]);

  useFocusEffect(
    useCallback(() => {
      setError(null);
    }, [])
  );

  const toggle = async () => {
    if (busy) return;
    if (!connected && !subscriptionActive) {
      setError("Подписка истекла — продлите её во вкладке «Тарифы»");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (vpnRunning) {
        await disconnect();
        setVpnRunning(false);
      } else {
        if (!selectedNode) throw new Error("Нет доступных серверов");
        if (!selectedNode.supportedByXray) throw new Error("Протокол этого сервера не поддерживается");
        await connect(selectedNode);
        setVpnRunning(true);
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка подключения");
    } finally {
      setBusy(false);
    }
  };

  const connected = vpnRunning;
  const statusText = busy ? "Подключение…" : connected ? "Защищено" : "Не подключено";
  const selectedInfo = selectedNode ? splitNameFlag(selectedNode.name) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>GhostCloud</Text>
        <Text style={[styles.planTag, { color: me?.expire_at ? colors.green : colors.textFaint }]}>
          {me?.plan || ""}
        </Text>
      </View>

      <View style={styles.powerArea}>
        <Pressable onPress={toggle} disabled={busy} style={styles.pressable}>
          <View style={[styles.ring3, connected && styles.ringOn3]} />
          <View style={[styles.ring2, connected && styles.ringOn2]} />
          <View
            style={[
              styles.button,
              busy && { opacity: 0.7 },
              connected ? styles.buttonOn : styles.buttonOff,
            ]}
          >
            <PowerIcon on={connected} />
          </View>
        </Pressable>
        <Text style={[styles.status, { color: connected ? colors.green : colors.textDim }]}>
          {statusText}
        </Text>
        {!!connected && (
          <Text style={styles.timer}>
            {formatTimer(seconds)}
          </Text>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.statsBlock}>
        <View style={styles.statsLeft}>
          <Text style={styles.statsLabel}>Сегодня</Text>
          <Text style={styles.statsTotal}>{formatBytes(todayStat.rx + todayStat.tx)}</Text>
          <Text style={styles.statsWeek}>7 дней: {formatBytes(weekStat.rx + weekStat.tx)}</Text>
        </View>
        <View style={styles.statsDivider} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 14 }}>↓</Text>
            <Text style={styles.statsSide}>{formatBytes(todayStat.rx)}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.green, fontWeight: "800", fontSize: 14 }}>↑</Text>
            <Text style={styles.statsSide}>{formatBytes(todayStat.tx)}</Text>
          </View>
        </View>
        <Pressable onPress={() => nav.navigate("Статистика")}>
          <Text style={styles.statsMore}>Подробнее ›</Text>
        </Pressable>
      </View>

      <Pressable style={styles.serverCard} onPress={() => setPickerOpen(true)}>
        {selectedNode && selectedInfo ? (
          <>
            <Text style={{ fontSize: 30 }}>{selectedInfo.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.serverName} numberOfLines={1}>
                {selectedInfo.name}
              </Text>
              <Text style={styles.serverSub} numberOfLines={1}>
                {transportLabel(selectedNode)}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
            <View style={[styles.dot, { backgroundColor: connected ? colors.green : colors.textFaint }]} />
          </>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={styles.serverName}>Сервер не выбран</Text>
            <Text style={styles.serverSub}>Нажмите, чтобы выбрать локацию</Text>
          </View>
        )}
      </Pressable>

      <ServerPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        nodes={nodes}
        selectedId={selectedNodeId || nodes[0]?.id || null}
        subscriptionActive={subscriptionActive}
        onSelect={(id) => {
          selectNode(id);
          setPickerOpen(false);
          if (vpnRunning) {
            // Переподключаемся к новому серверу на лету
            (async () => {
              const node = nodes.find((n) => n.id === id);
              if (!node) return;
              setBusy(true);
              setError(null);
              try {
                await disconnect();
                await connect(node);
                setVpnRunning(true);
                setSeconds(0);
              } catch (e: any) {
                setError(e?.message || "Ошибка переподключения");
                setVpnRunning(false);
              } finally {
                setBusy(false);
              }
            })();
          }
        }}
        onRefresh={() => reloadNodes().catch(() => {})}
      />
    </View>
  );
}

function ServerPicker({
  visible,
  onClose,
  nodes,
  selectedId,
  subscriptionActive,
  onSelect,
  onRefresh,
}: {
  visible: boolean;
  onClose: () => void;
  nodes: any[];
  selectedId: string | null;
  subscriptionActive: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);
  const pinging = pingStore.isRunning();
  const [tab, setTab] = useState<"regular" | "lte">("regular");
  const filtered = nodes.filter((n: any) =>
    tab === "lte" ? n.source === "lte" : n.source !== "lte"
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Выбор сервера</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Pressable onPress={() => pingStore.pingAll(nodes)} disabled={pinging}>
                {pinging ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
                    Пинг
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={onClose}>
                <Text style={{ color: colors.textFaint, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.tabRow}>
            {([
              { key: "regular", label: "Обычные" },
              { key: "lte", label: "LTE Open" },
            ] as const).map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tabBtn, tab === t.key && styles.tabBtnOn]}
              >
                <Text style={[styles.tabText, tab === t.key && { color: "#fff" }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {!subscriptionActive && (
            <Text style={styles.expiredNote}>
              Подписка истекла — подключение недоступно. Продлите во вкладке «Тарифы».
            </Text>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(n: any) => n.id}
            style={{ maxHeight: 420 }}
            renderItem={({ item }: any) => {
              const info = splitNameFlag(item.name);
              const selected = item.id === selectedId;
              const ping = pings[item.id];
              return (
                <Pressable
                  style={[styles.sheetItem, selected && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
                  onPress={() => onSelect(item.id)}
                >
                  <Text style={{ fontSize: 24 }}>{info.flag}</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.sheetItemName} numberOfLines={1}>
                      {info.name}
                    </Text>
                    <Text style={styles.sheetItemSub} numberOfLines={1}>
                      {transportLabel(item)}
                    </Text>
                    {ping?.status === "done" && !!ping.error && (
                      <Text style={{ color: colors.red, fontSize: 10 }} numberOfLines={1}>
                        ⚠ {ping.error}
                      </Text>
                    )}
                  </View>
                  {ping?.status === "pending" && (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                  {ping?.status === "done" && !ping.error && (
                    <Text
                      style={{
                        color: ping.delay < 300 ? colors.green : colors.orange,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {ping.delay} мс
                    </Text>
                  )}
                  {!item.supportedByXray && !ping && (
                    <Text style={{ color: colors.orange, fontSize: 11 }}>HY2</Text>
                  )}
                  {selected && (
                    <View style={[styles.checkDot, { backgroundColor: colors.accent }]} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
                <Text style={{ color: colors.textFaint, textAlign: "center" }}>
                  Список пуст — обновите подписку
                </Text>
                <Pressable style={styles.refreshBtn} onPress={onRefresh}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Обновить</Text>
                </Pressable>
              </View>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatTimer(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PowerIcon({ on }: { on: boolean }) {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={styles.powerLine} />
      <View style={styles.powerArc} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  brand: { color: colors.text, fontSize: 20, fontWeight: "800" },
  planTag: { fontSize: 13, fontWeight: "700" },
  powerArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressable: { width: 240, height: 240, alignItems: "center", justifyContent: "center" },
  ring2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ringOn2: { borderColor: colors.accentDeep },
  ring3: {
    position: "absolute",
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 1,
    borderColor: colors.bgSoft,
  },
  ringOn3: { borderColor: "#4C2E85" },
  button: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonOff: {
    backgroundColor: colors.cardLight,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 10,
  },
  buttonOn: {
    backgroundColor: colors.accentDeep,
    shadowColor: colors.accent,
    shadowOpacity: 0.65,
    shadowRadius: 40,
    elevation: 16,
  },
  powerLine: {
    position: "absolute",
    top: -14,
    width: 6,
    height: 44,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  powerArc:
    ({
      width: 74,
      height: 74,
      borderRadius: 40,
      borderWidth: 7,
      borderColor: "#fff",
      borderTopColor: "transparent",
      transform: [{ rotate: "-45deg" }],
    } as const),
  status: { marginTop: 26, fontSize: 17, fontWeight: "800" },
  timer: { marginTop: 4, fontSize: 14, color: colors.textDim, letterSpacing: 2 },
  error: { marginTop: 8, fontSize: 12, color: colors.red, textAlign: "center", paddingHorizontal: 30 },
  serverCard: {
    margin: 20,
    marginBottom: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  serverName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  serverSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  statsBlock: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 16,
  },
  statsLeft: { alignItems: "flex-start" },
  statsLabel: { color: colors.textFaint, fontSize: 11 },
  statsTotal: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 2 },
  statsWeek: { color: colors.textDim, fontSize: 10, marginTop: 3 },
  statsDivider: { width: 1, height: 40, backgroundColor: colors.border },
  statsSide: { color: colors.text, fontSize: 13, fontWeight: "600" },
  statsMore: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chevron: { color: colors.textFaint, fontSize: 22, marginRight: 6 },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: "80%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBtnOn: { backgroundColor: colors.accentDeep },
  tabText: { color: colors.textDim, fontWeight: "700", fontSize: 13 },
  expiredNote: {
    color: colors.orange,
    fontSize: 12,
    textAlign: "center",
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSoft,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
  },
  sheetItemName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  sheetItemSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  checkDot: { width: 12, height: 12, borderRadius: 6, marginLeft: 8 },
  refreshBtn: {
    backgroundColor: colors.accentDeep,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 26,
  },
});
