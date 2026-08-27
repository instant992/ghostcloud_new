import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Application from "expo-application";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../../context";
import { connect, disconnect } from "../../vpn/manager";
import * as pingStore from "../../vpn/pingStore";
import type { VpnNode } from "../../vpn/parse";
import { getSetting, setSetting } from "../../settings";
import { colors, splitNameFlag, formatBytes, useTheme } from "../../theme";
import { transportLabel } from "../../utils/transportLabel";
import { AppFilterModal } from "../../components/AppFilterModal";
import { PrivacyText } from "../../components/PrivacyText";
import { showToast } from "../../components/Toast";
import { ServerSheet } from "./ServerSheet";
import * as stats from "../../stats";

function formatTimer(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Главный экран темы «Минимализм»: плоский тёмный фон, сплошная кнопка сервера,
 *  док «островками», без стекла и блюра — как в Flutter-версии. */
export default function MinimalistScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const {
    nodes,
    selectedNodeId,
    selectNode,
    vpnRunning,
    setVpnRunning,
    me,
    subscriptionActive,
    reloadNodes,
  } = useApp();

  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);

  const [lteEnabled, setLteEnabled] = useState(() => getSetting("lte_enabled", "1") === "1");
  const [lteBusy, setLteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });

  const mainNodes = useMemo(() => nodes.filter((n) => n.source !== "lte"), [nodes]);
  const lteNodes = useMemo(
    () => (lteEnabled ? nodes.filter((n) => n.source === "lte") : []),
    [nodes, lteEnabled]
  );
  const allVisible = useMemo(() => [...mainNodes, ...lteNodes], [mainNodes, lteNodes]);

  const selectedNode = useMemo(
    () => allVisible.find((n) => n.id === selectedNodeId) || mainNodes[0] || null,
    [allVisible, selectedNodeId, mainNodes]
  );
  const otherNodes = useMemo(
    () => allVisible.filter((n) => n.id !== selectedNode?.id),
    [allVisible, selectedNode]
  );

  useEffect(() => {
    if (!vpnRunning) {
      setSeconds(0);
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [vpnRunning]);

  useEffect(() => {
    const load = () => stats.sumDays(1).then(setTodayStat).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const didPing = useRef(false);
  useEffect(() => {
    if (didPing.current || nodes.length === 0) return;
    didPing.current = true;
    pingStore.pingAll(nodes).catch(() => {});
  }, [nodes]);

  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me]);

  const toggle = async () => {
    if (busy) return;
    if (!vpnRunning && !subscriptionActive) {
      showToast("Подписка истекла — продлите её в разделе «Тарифы»");
      return;
    }
    setBusy(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (vpnRunning) {
        await disconnect();
        setVpnRunning(false);
      } else {
        if (!selectedNode) {
          showToast("Нет доступных серверов");
          return;
        }
        await connect(selectedNode);
        setVpnRunning(true);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showToast(e?.message || "Ошибка подключения");
    } finally {
      setBusy(false);
    }
  };

  const chooseNode = async (node: VpnNode) => {
    selectNode(node.id);
    Haptics.selectionAsync().catch(() => {});
    if (vpnRunning) {
      try {
        setBusy(true);
        await disconnect();
        await connect(node);
        setVpnRunning(true);
        setSeconds(0);
      } catch (e: any) {
        showToast(e?.message || "Ошибка переподключения");
        setVpnRunning(false);
      } finally {
        setBusy(false);
      }
    }
  };

  const toggleLte = (v: boolean) => {
    if (v && !subscriptionActive) {
      nav.navigate("Тарифы");
      showToast("Для LTE OPEN нужна активная подписка");
      return;
    }
    setLteEnabled(v);
    setSetting("lte_enabled", v ? "1" : "0");
    if (v) {
      setLteBusy(true);
      reloadNodes()
        .then(() => showToast("LTE OPEN активирован"))
        .catch(() => showToast("Ошибка активации LTE OPEN"))
        .finally(() => setLteBusy(false));
    }
  };

  const refreshServers = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await reloadNodes();
      showToast("Серверы обновлены");
    } catch {
      showToast("Не удалось обновить серверы");
    } finally {
      setRefreshing(false);
    }
  };

  const selectedInfo = selectedNode ? splitNameFlag(selectedNode.name) : null;
  const selPing = selectedNode ? pings[selectedNode.id] : undefined;
  const totalToday = todayStat.rx + todayStat.tx;
  const rxShare = totalToday > 0 ? todayStat.rx / totalToday : 0;

  const pingColor = (delay: number) =>
    delay < 80 ? "#22C55E" : delay < 200 ? "#F59E0B" : "#EF4444";

  return (
    <View style={styles.screen}>
      {/* Шапка: версия — иконка+название — поддержка */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{Application.nativeApplicationVersion || "1.0"}</Text>
        </View>
        <View style={styles.headerCenter}>
          <View style={styles.headerLogo}>
            <Ionicons name="cloud-outline" size={16} color={colors.accent} />
          </View>
          <Text style={styles.headerTitle}>GhostCloud</Text>
        </View>
        <Pressable onPress={() => nav.navigate("Support")} hitSlop={8} style={styles.headerIcon}>
          <Ionicons name="headset-outline" size={21} color={colors.textDim} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* LTE OPEN */}
        <View
          style={[
            styles.lteRow,
            lteEnabled
              ? { backgroundColor: colors.accentDeep + "1F", borderColor: colors.accentDeep + "73" }
              : { backgroundColor: colors.bgSoft, borderColor: colors.border },
          ]}
        >
          <View style={[styles.lteIconBox, lteEnabled && { backgroundColor: colors.accentDeep + "2E" }]}>
            {lteBusy ? (
              <ActivityIndicator size="small" color={colors.accentDeep} />
            ) : (
              <Ionicons name="cellular-outline" size={16} color={lteEnabled ? colors.accentDeep : colors.textDim} />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <PrivacyText style={styles.lteTitle}>LTE OPEN</PrivacyText>
              <View style={styles.lteBeta}>
                <Text style={styles.lteBetaText}>beta</Text>
              </View>
            </View>
            <Text style={styles.lteSub}>
              {lteBusy ? "Загружаем профили..." : lteEnabled ? `${lteNodes.length} серверов` : "Нажмите для включения"}
            </Text>
          </View>
          <Switch
            value={lteEnabled}
            onValueChange={toggleLte}
            trackColor={{ false: colors.border, true: colors.accentDeep + "73" }}
            thumbColor={lteEnabled ? colors.accentDeep : "#fff"}
          />
        </View>

        {/* Кнопка питания с плоским свечением */}
        <View style={styles.powerArea}>
          <View
            style={[
              styles.powerGlow,
              {
                shadowColor: vpnRunning ? "#22C55E" : colors.accent,
                shadowOpacity: vpnRunning ? 0.38 : 0.24,
              },
            ]}
          >
            <Pressable onPress={toggle} disabled={busy} style={[styles.powerBtn, { opacity: busy ? 0.7 : 1 }]}>
              {busy ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <Ionicons name="power" size={56} color="#fff" />
              )}
            </Pressable>
          </View>
          <Text style={[styles.statusText, { color: vpnRunning ? "#22C55E" : colors.textDim }]}>
            {vpnRunning ? "Подключено" : "Не подключено"}
          </Text>
          {!!vpnRunning && <Text style={styles.timerText}>{formatTimer(seconds)}</Text>}
        </View>

        {/* Ряд действий */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.squareIcon} onPress={() => setAppsOpen(true)}>
            <Ionicons name="grid-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable style={styles.refreshBtn} onPress={refreshServers} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.refreshBtnText}>Обновить серверы</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.squareIcon}
            onPress={async () => {
              await pingStore.pingAll(allVisible);
              showToast("Проверка задержки завершена");
            }}
          >
            <Ionicons name="speedometer-outline" size={22} color={colors.text} />
          </Pressable>
        </View>

        {/* Трафик и дни */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <View style={[styles.miniCard, { flex: 1 }]}>
            <Text style={styles.miniCardTitle}>Трафик</Text>
            <Text style={styles.miniCardValue}>{formatBytes(totalToday)}</Text>
            <View style={styles.miniBarTrack}>
              <View style={[styles.miniBarFill, { width: `${Math.round(rxShare * 100)}%` }]} />
            </View>
            <Text style={styles.miniCardSub}>
              ↓ {formatBytes(todayStat.rx)} · ↑ {formatBytes(todayStat.tx)}
            </Text>
          </View>
          <View style={[styles.miniCard, { flex: 1 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.miniCardTitle}>Дней</Text>
              <Text style={styles.miniCardLabel}>До конца</Text>
            </View>
            <Text style={styles.miniCardValue}>{daysLeft}</Text>
            <View style={styles.miniBarTrack}>
              <View
                style={[styles.miniBarFill, { width: `${Math.min(100, Math.round((daysLeft / 30) * 100))}%` }]}
              />
            </View>
            <Text style={styles.miniCardSub}>
              {me?.expire_at ? new Date(String(me.expire_at)).toLocaleDateString("ru-RU") : "—"}
            </Text>
          </View>
        </View>

        {/* Выбранный сервер — сплошная заливка */}
        <Pressable
          style={[styles.selectedCard, lteEnabled && selectedNode?.source === "lte" && { backgroundColor: colors.accentDeep }]}
          onPress={() => setPickerOpen(true)}
        >
          <View style={styles.selectedFlagBox}>
            <Text style={{ fontSize: 18 }}>{selectedInfo?.flag || "🌍"}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.selectedName} numberOfLines={1}>
              {selectedInfo?.name || "Сервер не выбран"}
            </Text>
            <Text style={styles.selectedSub} numberOfLines={1}>
              {selectedNode ? transportLabel(selectedNode) : "Нажмите, чтобы выбрать"}
            </Text>
          </View>
          {selPing?.status === "pending" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : selPing?.status === "done" && selPing.delay > 0 ? (
            <Text style={styles.selectedPing}>{selPing.delay} мс</Text>
          ) : null}
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Другие локации */}
        <View style={styles.otherHeader}>
          <View style={styles.otherLine} />
          <Text style={styles.otherText}>Другие локации</Text>
          <View style={styles.otherLine} />
        </View>

        {otherNodes.map((n) => {
          const info = splitNameFlag(n.name);
          const ping = pings[n.id];
          return (
            <Pressable key={n.id} style={styles.otherRow} onPress={() => chooseNode(n)}>
              <Text style={{ fontSize: 22 }}>{info.flag}</Text>
              <Text style={styles.otherName} numberOfLines={1}>
                {info.name}
              </Text>
              {ping?.status === "pending" ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : ping?.status === "done" && ping.delay > 0 ? (
                <Text style={[styles.otherPing, { color: pingColor(ping.delay) }]}>{ping.delay}</Text>
              ) : ping?.status === "done" ? (
                <Text style={[styles.otherPing, { color: colors.red }]}>✕</Text>
              ) : null}
            </Pressable>
          );
        })}
        {otherNodes.length === 0 && (
          <Text style={{ color: colors.textFaint, textAlign: "center", paddingVertical: 18, fontSize: 13 }}>
            Нет других серверов
          </Text>
        )}
      </ScrollView>

      {/* Док рендерится как таб-бар потока темы (см. App.tsx) */}

      <AppFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />
      <ServerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        nodes={allVisible}
        selectedId={selectedNode?.id || null}
        onSelect={(id) => {
          setPickerOpen(false);
          const node = allVisible.find((n) => n.id === id);
          if (node) chooseNode(node);
        }}
      />
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1.3,
    borderColor: colors.green,
  },
  versionText: { color: colors.green, fontSize: 12, fontWeight: "700" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.6 },
  headerIcon: { padding: 6 },
  lteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  lteIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.cardLight,
    alignItems: "center",
    justifyContent: "center",
  },
  lteTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  lteBeta: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: colors.accentDeep + "26",
  },
  lteBetaText: { color: colors.accentDeep, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  lteSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  powerArea: { alignItems: "center", paddingVertical: 26 },
  powerGlow: {
    borderRadius: 100,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  powerBtn: {
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: colors.accentDeep,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accent,
  },
  statusText: { fontSize: 15, fontWeight: "600", marginTop: 18 },
  timerText: { color: "#22C55E", fontSize: 13, fontWeight: "600", marginTop: 4 },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  squareIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.accentDeep,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  refreshBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  miniCard: {
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 14,
    paddingBottom: 12,
  },
  miniCardTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  miniCardLabel: { color: colors.textDim, fontSize: 12, fontWeight: "500" },
  miniCardValue: { color: colors.text, fontSize: 19, fontWeight: "800", marginTop: 6 },
  miniBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(240,242,255,0.08)",
    marginTop: 10,
    overflow: "hidden",
  },
  miniBarFill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
  miniCardSub: { color: colors.textDim, fontSize: 10, marginTop: 8 },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 18,
  },
  selectedFlagBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedName: { color: "#fff", fontSize: 15, fontWeight: "700" },
  selectedSub: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  selectedPing: { color: "#fff", fontSize: 13, fontWeight: "600", marginRight: 6 },
  otherHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    marginBottom: 12,
  },
  otherLine: { flex: 1, height: 1, backgroundColor: colors.border, opacity: 0.6 },
  otherText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  otherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  otherName: { color: colors.text, fontSize: 14, fontWeight: "500", flex: 1 },
  otherPing: { fontSize: 12, fontWeight: "600" },
  dock: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  dockSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  dockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 0.5,
    borderColor: colors.accent + "4D",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dockPillText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
