import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "../components/PressableScale";
import { AppFilterModal } from "../components/AppFilterModal";
import { BalanceSheet } from "../components/BalanceSheet";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context";
import { connect, disconnect } from "../vpn/manager";
import * as pingStore from "../vpn/pingStore";
import * as appFilterMod from "../vpn/appFilter";
import { transportLabel } from "../utils/transportLabel";
import * as stats from "../stats";
import { colors, splitNameFlag, formatBytes, useTheme, pingColor } from "../theme";

export default function HomeScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();

  const nav = useNavigation<any>();
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, subscriptionActive, reloadNodes } = useApp();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [allowedCount, setAllowedCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });
  const [refreshingNodes, setRefreshingNodes] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);

  const refreshNodes = async () => {
    if (refreshingNodes) return;
    setRefreshingNodes(true);
    try {
      await reloadNodes();
    } catch {}
    finally {
      setRefreshingNodes(false);
    }
  };

  const loadStats = useCallback(() => {
    stats.sumDays(1).then(setTodayStat).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      loadStats();
      appFilterMod.loadFilter().then((f) => {
        setAllowedCount(f.allowed.length);
        setBlockedCount(f.blocked.length);
      }).catch(() => {});
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

  // Плавная пульсация кругов при подключении
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!vpnRunning) return;
    const mk = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
    const a1 = mk(pulse1, 1200);
    const a2 = mk(pulse2, 1600);
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
      pulse1.setValue(0);
      pulse2.setValue(0);
    };
  }, [vpnRunning, pulse1, pulse2]);

  // Медленное вращение колец из частиц
  const spin1 = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const mk = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.timing(val, { toValue: 360, duration: dur, easing: Easing.linear, useNativeDriver: true })
      );
    const a1 = mk(spin1, 80000);
    const a2 = mk(spin2, 110000);
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
    };
  }, [spin1, spin2]);

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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        if (!selectedNode) throw new Error("Нет доступных серверов");
        await connect(selectedNode);
        setVpnRunning(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e?.message || "Ошибка подключения");
    } finally {
      setBusy(false);
    }
  };

  const connected = vpnRunning;
  const selectedInfo = selectedNode ? splitNameFlag(selectedNode.name) : null;
  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <Image
            source={{ uri: "app_icon" }}
            style={styles.appBadge}
            resizeMode="cover"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName} numberOfLines={1}>
              GhostCloud
            </Text>
          </View>
        </View>
        <PressableScale style={styles.subPill} onPress={() => setBalanceOpen(true)}>
          <Text style={styles.subPillDays}>
            {daysLeft} {pluralDays(daysLeft)}
          </Text>
          <Text style={styles.subPillBalance}>
            Баланс: {((me?.balance || 0) / 100).toFixed(0)} ₽
          </Text>
        </PressableScale>
      </View>

      <View style={styles.powerArea}>
        <PressableScale onPress={toggle} disabled={busy} style={styles.pressable}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbit,
              styles.orbitOuter,
              {
                opacity: connected ? 1 : 0.55,
                transform: [
                  {
                    rotate: spin1.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }),
                  },
                ],
              },
            ]}
          >
            <ParticleRing size={304} color={colors.accent} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbit,
              styles.orbitInner,
              {
                opacity: connected ? 0.95 : 0.45,
                transform: [
                  {
                    rotate: spin2.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "-360deg"] }),
                  },
                ],
              },
            ]}
          >
            <ParticleRing size={256} color="#C4B5FD" />
          </Animated.View>
          <View pointerEvents="none" style={[styles.halo, connected && styles.haloOn]} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring3,
              connected && styles.ringOn3,
              {
                transform: [
                  { scale: pulse1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                ],
                opacity: pulse1.interpolate({ inputRange: [0, 1], outputRange: [connected ? 1 : 0, 0.35] }),
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring2,
              connected && styles.ringOn2,
              {
                transform: [
                  { scale: pulse2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                ],
                opacity: pulse2.interpolate({ inputRange: [0, 1], outputRange: [connected ? 1 : 0, 0.3] }),
              },
            ]}
          />
          <View
            style={[
              styles.button,
              busy && { opacity: 0.7 },
              connected ? styles.buttonOn : styles.buttonOff,
            ]}
          >
            <PowerIcon on={connected} />
          </View>
        </PressableScale>
        {!!connected && (
          <Text style={styles.timer}>
            {formatTimer(seconds)}
          </Text>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.serverCard}>
        <PressableScale style={styles.serverRow} onPress={() => setPickerOpen(true)}>
          <View style={styles.serverIcon}>
            <Ionicons name="flash" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            {selectedNode && selectedInfo ? (
              <>
                <Text style={styles.serverName} numberOfLines={1}>
                  {selectedInfo.name}
                </Text>
                <Text style={styles.serverSub} numberOfLines={1}>
                  {transportLabel(selectedNode)}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.serverName}>Сервер не выбран</Text>
                <Text style={styles.serverSub}>Нажмите, чтобы выбрать локацию</Text>
              </>
            )}
          </View>
          {selectedInfo && <Text style={{ fontSize: 22 }}>{selectedInfo.flag}</Text>}
          <PressableScale style={styles.infoBtn} onPress={refreshNodes} disabled={refreshingNodes}>
            {refreshingNodes ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh" size={16} color={colors.textDim} />
            )}
          </PressableScale>
        </PressableScale>

        <View style={styles.cardDivider} />

        <PressableScale style={styles.serverRow} onPress={() => setAppsOpen(true)}>
          <View style={styles.serverIcon}>
            <Ionicons name="apps" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.serverName}>Приложения</Text>
            <Text style={styles.serverSub} numberOfLines={1}>
              {allowedCount > 0
                ? `Через VPN: ${allowedCount} · белый список`
                : blockedCount > 0
                  ? `Мимо VPN: ${blockedCount}`
                  : "Все приложения через VPN"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </PressableScale>
      </View>

      <PressableScale
        style={[styles.connectPill, busy && { opacity: 0.7 }]}
        onPress={toggle}
        disabled={busy}
      >
        <Text style={styles.connectPillText}>
          {busy ? "Подключение…" : connected ? "Отключить" : "Подключить"}
        </Text>
      </PressableScale>

      <View style={styles.statsRow}>
        <PressableScale style={styles.statCard} onPress={() => nav.navigate("Статистика")}>
          <View style={[styles.statIcon, { backgroundColor: "rgba(52,211,153,0.12)" }]}>
            <Ionicons name="arrow-up" size={15} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Отправлено</Text>
            <Text style={styles.statValue}>{formatBytes(todayStat.tx)}</Text>
          </View>
        </PressableScale>
        <PressableScale style={styles.statCard} onPress={() => nav.navigate("Статистика")}>
          <View style={[styles.statIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="arrow-down" size={15} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Получено</Text>
            <Text style={styles.statValue}>{formatBytes(todayStat.rx)}</Text>
          </View>
        </PressableScale>
      </View>

      <AppFilterModal
        visible={appsOpen}
        onClose={() => setAppsOpen(false)}
        onChange={(allowed, blocked) => {
          setAllowedCount(allowed.length);
          setBlockedCount(blocked.length);
        }}
      />

      <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={(me?.balance || 0) / 100}
        daysLeft={daysLeft}
      />

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
  useTheme();
  const styles = makeStyles();

  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);
  const pinging = pingStore.isRunning();
  const [tab, setTab] = useState<"regular" | "lte">("regular");
  const filtered = nodes.filter((n: any) =>
    tab === "lte" ? n.source === "lte" : n.source !== "lte"
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <PressableScale style={styles.sheetBackdrop} onPress={onClose}>
        <PressableScale style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Выбор сервера</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <PressableScale onPress={() => pingStore.pingAll(nodes)} disabled={pinging}>
                {pinging ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
                    Пинг
                  </Text>
                )}
              </PressableScale>
              <PressableScale onPress={onClose}>
                <Text style={{ color: colors.textFaint, fontSize: 18 }}>✕</Text>
              </PressableScale>
            </View>
          </View>

          <View style={styles.tabRow}>
            {([
              { key: "regular", label: "Обычные" },
              { key: "lte", label: "LTE Open" },
            ] as const).map((t) => (
              <PressableScale
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tabBtn, tab === t.key && styles.tabBtnOn]}
              >
                {t.key === "lte" ? (
                  <Text style={[styles.tabText, tab === t.key && { color: "#fff" }]}>
                    {t.label}
                  </Text>
                ) : (
                  <Text style={[styles.tabText, tab === t.key && { color: "#fff" }]}>
                    {t.label}
                  </Text>
                )}
              </PressableScale>
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
                <PressableScale
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
                        color: pingColor(ping.delay),
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
                </PressableScale>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
                <Text style={{ color: colors.textFaint, textAlign: "center" }}>
                  Список пуст — обновите подписку
                </Text>
                <PressableScale style={styles.refreshBtn} onPress={onRefresh}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Обновить</Text>
                </PressableScale>
              </View>
            }
          />
        </PressableScale>
      </PressableScale>
    </Modal>
  );
}

function formatTimer(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
  return "дней";
}

function PowerIcon({ on }: { on: boolean }) {
  return (
    <Ionicons
      name={on ? "pause" : "power"}
      size={64}
      color="#fff"
      style={{ marginTop: -6 }}
    />
  );
}

/** Кольцо из частиц вокруг кнопки питания.
 *  Детерминированный псевдослучайный сид — частицы не «прыгают» при ре-рендере. */
function ParticleRing({ size, color }: { size: number; color: string }) {
  const particles = useMemo(() => {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const count = 130;
    const rInner = size * 0.375;
    const rOuter = size * 0.5;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.32;
      const radius = rInner + (rOuter - rInner) * Math.pow(rnd(), 0.6);
      return {
        x: size / 2 + Math.cos(angle) * radius,
        y: size / 2 + Math.sin(angle) * radius,
        r: 0.7 + rnd() * 1.5,
        opacity: 0.12 + rnd() * 0.6,
      };
    });
  }, [size]);

  return (
    <Svg width={size} height={size}>
      {particles.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill={color} opacity={p.opacity} />
      ))}
    </Svg>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  appBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  clientName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  subPill: {
    backgroundColor: colors.accentDeep,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: "center",
  },
  subPillDays: { color: "#fff", fontSize: 13, fontWeight: "800" },
  subPillBalance: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 1 },
  powerArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressable: { width: 304, height: 304, alignItems: "center", justifyContent: "center" },
  orbit: { position: "absolute" },
  orbitOuter: { left: 0, top: 0 },
  orbitInner: { left: 24, top: 24 },
  halo: {
    position: "absolute",
    width: 216,
    height: 216,
    left: 44,
    top: 44,
    borderRadius: 108,
    backgroundColor: "rgba(124,58,237,0.10)",
  },
  haloOn: { backgroundColor: "rgba(124,58,237,0.18)" },
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
  timer: { marginTop: 4, fontSize: 14, color: colors.textDim, letterSpacing: 2 },
  error: { marginTop: 8, fontSize: 12, color: colors.red, textAlign: "center", paddingHorizontal: 30 },
  serverIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  connectPill: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: colors.accentDeep,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: "center",
  },
  connectPillText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 1 },
  serverCard: {
    margin: 20,
    marginBottom: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
    opacity: 0.7,
  },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  serverName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  serverSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  statLabel: { color: colors.textFaint, fontSize: 10 },
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
