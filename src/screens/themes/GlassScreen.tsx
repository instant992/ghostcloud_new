import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { BlurView } from "expo-blur";
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
import { colors, splitNameFlag, formatBytes, useTheme, isLightPalette, powerButtonColors, pingColor as pingColorFor } from "../../theme";
import { transportLabel } from "../../utils/transportLabel";
import { AppFilterModal } from "../../components/AppFilterModal";
import { BalanceSheet } from "../../components/BalanceSheet";
import { showToast } from "../../components/Toast";
import { ServerSheet } from "./ServerSheet";
import * as stats from "../../stats";

const PURPLE = "#7C3AED";

function formatTimer(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Стеклянная карточка в духе iOS Liquid Glass: настоящий блюр того, что под ней,
 *  полупрозрачная тонировка и светлая граница. На Android < 12 BlurView
 *  автоматически откатывается к полупрозрачной подложке. */
export function GlassCard({
  radius = 20,
  intensity = 50,
  overlay,
  style,
  children,
  onPress,
}: {
  radius?: number;
  intensity?: number;
  overlay?: string;
  style?: any;
  children?: React.ReactNode;
  onPress?: () => void;
}) {
  useTheme();
  const light = isLightPalette();
  const outer = {
    borderRadius: radius,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: light ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)",
  };
  const body = (
    <>
      <BlurView intensity={intensity} tint={light ? "light" : "dark"} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: overlay ?? (light ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.05)") },
        ]}
        pointerEvents="none"
      />
      {children}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[outer, style]}>
        {body}
      </Pressable>
    );
  }
  return <View style={[outer, style]}>{body}</View>;
}

/** Фон темы: диагональный градиент + пять цветных «блобов» — как в Flutter-версии */
function GlassBackground() {
  useTheme();
  const light = isLightPalette();
  const { width, height } = Dimensions.get("window");
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="gcGlassBg" x1="0" y1="0" x2="1" y2="1">
            {light
              ? [
                  <Stop key="l0" offset="0" stopColor="#E8E2F0" />,
                  <Stop key="l1" offset="0.35" stopColor="#DDD6EA" />,
                  <Stop key="l2" offset="0.65" stopColor="#E2DCF0" />,
                  <Stop key="l3" offset="1" stopColor="#D8D2E6" />,
                ]
              : [
                  <Stop key="d0" offset="0" stopColor="#08080E" />,
                  <Stop key="d1" offset="0.35" stopColor="#0E0C16" />,
                  <Stop key="d2" offset="0.65" stopColor="#0A0A14" />,
                  <Stop key="d3" offset="1" stopColor="#060610" />,
                ]}
          </LinearGradient>
          <RadialGradient id="gcBlob1">
            <Stop offset="0" stopColor={light ? "#9B59B6" : "#7B2FBE"} stopOpacity={light ? "0.35" : "0.25"} />
            <Stop offset="1" stopColor={light ? "#9B59B6" : "#7B2FBE"} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="gcBlob2">
            <Stop offset="0" stopColor={light ? "#5B9CF6" : "#3B82F6"} stopOpacity={light ? "0.3" : "0.2"} />
            <Stop offset="1" stopColor={light ? "#5B9CF6" : "#3B82F6"} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="gcBlob3">
            <Stop offset="0" stopColor="#EC4899" stopOpacity={light ? "0.25" : "0.18"} />
            <Stop offset="1" stopColor="#EC4899" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="gcBlob4">
            <Stop offset="0" stopColor="#06B6D4" stopOpacity={light ? "0.22" : "0.15"} />
            <Stop offset="1" stopColor="#06B6D4" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="gcBlob5">
            <Stop offset="0" stopColor="#8B5CF6" stopOpacity={light ? "0.2" : "0.15"} />
            <Stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#gcGlassBg)" />
        <Circle cx={width - 120} cy={60} r={180} fill="url(#gcBlob1)" />
        <Circle cx={60} cy={360} r={160} fill="url(#gcBlob2)" />
        <Circle cx={width + 20} cy={height - 200} r={140} fill="url(#gcBlob3)" />
        <Circle cx={80} cy={90} r={130} fill="url(#gcBlob4)" />
        <Circle cx={170} cy={height - 310} r={110} fill="url(#gcBlob5)" />
      </Svg>
    </View>
  );
}

/** Главный экран темы Liquid Glass: градиентный фон с блобами, стеклянные
 *  карточки и сфера питания — как в Flutter-версии. */
export default function GlassScreen() {
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
    refreshMe,
  } = useApp();

  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);

  const [lteEnabled, setLteEnabled] = useState(() => getSetting("lte_enabled", "1") === "1");
  const [lteBusy, setLteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
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

  // Пульс свечения сферы
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [pulse]);

  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me]);

  const balance = (me?.balance || 0) / 100;

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

  const [syncBusy, setSyncBusy] = useState(false);
  const syncAll = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      await Promise.all([reloadNodes(), refreshMe()]);
      showToast("Профиль обновлён");
    } catch {
      showToast("Не удалось обновить профиль");
    } finally {
      setSyncBusy(false);
    }
  };

  const selectedInfo = selectedNode ? splitNameFlag(selectedNode.name) : null;
  const selPing = selectedNode ? pings[selectedNode.id] : undefined;
  const pingText =
    selPing?.status === "done" && selPing.delay > 0 ? `${selPing.delay} мс` : null;
  const pingColor =
    selPing?.status === "done" && selPing.delay > 0
      ? pingColorFor(selPing.delay)
      : colors.textDim;

  const totalToday = todayStat.rx + todayStat.tx;
  const rxShare = totalToday > 0 ? todayStat.rx / totalToday : 0;
  const expireStr = me?.expire_at
    ? new Date(String(me.expire_at)).toLocaleDateString("ru-RU")
    : "—";
  const expireColor =
    daysLeft <= 0 ? colors.red : daysLeft <= 3 ? colors.orange : colors.textDim;

  const light = isLightPalette();
  const pc = powerButtonColors();

  return (
    <View style={styles.screen}>
      <GlassBackground />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Шапка */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Image source={{ uri: "app_icon" }} style={styles.headerLogo} resizeMode="cover" />
          <Text style={styles.headerTitle}>GhostCloud</Text>
          <Text style={styles.headerVersion}>v{Application.nativeApplicationVersion || "1.0"}</Text>
          <View style={{ flex: 1 }} />
          <GlassCard radius={14} intensity={35} style={styles.headerIconBox} onPress={() => nav.navigate("Support")}>
            <Ionicons name="headset-outline" size={22} color={colors.text} />
          </GlassCard>
        </View>

        {/* Статус + баланс */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.status, { color: vpnRunning ? "#22C55E" : colors.textDim }]}>
              {vpnRunning ? "Подключено" : "Не подключено"}
              {!!vpnRunning && ` · ${formatTimer(seconds)}`}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Ionicons name="swap-vertical" size={13} color={colors.textDim} />
              <Text style={styles.trafficHint}>Трафик: {formatBytes(totalToday)} сегодня</Text>
            </View>
            <View style={styles.trafficTrack}>
              <View style={[styles.trafficFill, { width: `${Math.round(rxShare * 100)}%` }]} />
            </View>
          </View>
          <GlassCard radius={14} style={{ padding: 10, marginLeft: 12 }} onPress={() => setBalanceOpen(true)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name="wallet-outline" size={13} color={colors.textFaint} />
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>Баланс:</Text>
              <Text style={{ color: balance > 0 ? "#4CAF50" : colors.orange, fontSize: 13, fontWeight: "600" }}>
                {balance.toFixed(0)} ₽
              </Text>
              <View style={styles.plusBtn}>
                <Ionicons name="add" size={13} color={colors.accent} />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
              <Ionicons name="calendar-outline" size={12} color={colors.textFaint} />
              <Text style={{ color: colors.textFaint, fontSize: 11 }}>Истекает:</Text>
              <Text style={{ color: expireColor, fontSize: 11, fontWeight: "500" }}>{expireStr}</Text>
            </View>
          </GlassCard>
        </View>

        {/* Стеклянная сфера питания */}
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sphereGlow,
              {
                backgroundColor: vpnRunning ? "#22C55E" : "#7C3AED",
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: vpnRunning ? [0.15, 0.25] : [0.08, 0.12],
                }),
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                ],
              },
            ]}
          />
          <View style={[styles.sphereWrap, { shadowColor: vpnRunning ? pc.glow : "transparent" }]}>
            <View style={styles.sphereRing} pointerEvents="none" />
            <Svg width={180} height={180}>
              <Defs>
                <RadialGradient id="gcSphereOff" cx="0.35" cy="0.3" r="0.85">
                  <Stop offset="0" stopColor={light ? "#FFFFFF" : "#3B2D5E"} stopOpacity="1" />
                  <Stop offset="1" stopColor={light ? "#E0D9F0" : "#1A1030"} stopOpacity="1" />
                </RadialGradient>
                <RadialGradient id="gcSphereOn" cx="0.35" cy="0.3" r="0.85">
                  <Stop offset="0" stopColor="#8B5CF6" stopOpacity="1" />
                  <Stop offset="0.6" stopColor="#7C3AED" stopOpacity="1" />
                  <Stop offset="1" stopColor="#5B21B6" stopOpacity="1" />
                </RadialGradient>
              </Defs>
              <Circle cx={90} cy={90} r={90} fill={vpnRunning ? "url(#gcSphereOn)" : "url(#gcSphereOff)"} />
              <Ellipse cx={90} cy={48} rx={56} ry={26} fill="#FFFFFF" opacity={light ? 0.35 : 0.07} />
              <Circle
                cx={90}
                cy={90}
                r={89}
                stroke="#FFFFFF"
                strokeOpacity={light ? 0.5 : 0.16}
                strokeWidth={1.5}
                fill="none"
              />
            </Svg>
            <Pressable
              onPress={toggle}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={vpnRunning ? "Выключить VPN" : "Включить VPN"}
              accessibilityState={{ busy }}
              style={styles.spherePress}
            >
              {busy ? (
                <ActivityIndicator size="large" color={vpnRunning ? "#fff" : colors.accent} />
              ) : (
                <Ionicons
                  name="power"
                  size={60}
                  color={vpnRunning ? "#fff" : light ? colors.accent : "rgba(255,255,255,0.92)"}
                />
              )}
            </Pressable>
          </View>
        </View>

        {/* LTE OPEN */}
        <GlassCard
          radius={16}
          overlay={lteEnabled ? "rgba(124,58,237,0.12)" : undefined}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderColor: lteEnabled ? "rgba(124,58,237,0.45)" : colors.border,
          }}
        >
          <View
            style={[
              styles.lteIconBox,
              { backgroundColor: lteEnabled ? "rgba(124,58,237,0.18)" : colors.cardLight },
            ]}
          >
            {lteBusy ? (
              <ActivityIndicator size="small" color={PURPLE} />
            ) : (
              <Ionicons name="cellular-outline" size={16} color={lteEnabled ? PURPLE : colors.textDim} />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                LTE OPEN
              </Text>
              <View style={styles.lteBeta}>
                <Text style={styles.lteBetaText}>beta</Text>
              </View>
            </View>
            <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 1 }}>
              {lteBusy ? "Загружаем профили..." : lteEnabled ? `${lteNodes.length} серверов` : "Нажмите для включения"}
            </Text>
          </View>
          <Switch
            value={lteEnabled}
            onValueChange={toggleLte}
            trackColor={{ false: colors.border, true: "rgba(124,58,237,0.45)" }}
            thumbColor={lteEnabled ? PURPLE : "#fff"}
          />
        </GlassCard>

        {/* Карточка сервера + фильтр соединения */}
        <GlassCard radius={20} style={{ marginTop: 8 }}>
          <Pressable style={styles.serverRow} onPress={() => setPickerOpen(true)}>
            <View style={styles.flagBox}>
              <Text style={{ fontSize: 20 }}>{selectedInfo?.flag || "🌍"}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              {selPing?.status === "pending" ? (
                <Text style={{ color: colors.textDim, fontSize: 10, fontWeight: "600", marginBottom: 1 }}>
                  пинг…
                </Text>
              ) : pingText ? (
                <Text style={{ color: pingColor, fontSize: 10, fontWeight: "600", marginBottom: 1 }}>
                  {pingText}
                </Text>
              ) : null}
              <Text style={styles.serverName} numberOfLines={1}>
                {selectedInfo?.name || "Сервер не выбран"}
              </Text>
              <Text style={styles.serverSub} numberOfLines={1}>
                {selectedNode ? transportLabel(selectedNode) : "Выберите локацию"}
              </Text>
            </View>
            <Pressable onPress={syncAll} hitSlop={8} style={styles.roundRefresh}>
              {syncBusy ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="refresh" size={15} color={colors.textDim} />
              )}
            </Pressable>
            <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
          </Pressable>
          <View style={styles.glassDivider} />
          <Pressable style={styles.serverRow} onPress={() => setAppsOpen(true)}>
            <View style={[styles.flagBox, { backgroundColor: "rgba(168,85,247,0.15)" }]}>
              <Ionicons name="shield-half-outline" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.serverName}>Фильтр соединения</Text>
              <Text style={styles.serverSub}>Какие приложения идут через VPN</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
          </Pressable>
        </GlassCard>

        {/* Поддержка */}
        <GlassCard
          radius={16}
          style={{ flexDirection: "row", alignItems: "center", padding: 14, marginTop: 10 }}
          onPress={() => nav.navigate("Support")}
        >
          <View style={[styles.flagBox, { backgroundColor: "rgba(52,211,153,0.12)" }]}>
            <Ionicons name="bulb-outline" size={19} color={colors.green} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.serverName}>Поддержка</Text>
            <Text style={styles.serverSub}>Напишите нам, если что-то не так</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </GlassCard>

        {/* Два стеклянных блока */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <GlassCard
            radius={16}
            style={{ flex: 1, alignItems: "center", paddingVertical: 14 }}
            onPress={() => nav.navigate("Статистика")}
          >
            <View style={[styles.tileIconBox, { backgroundColor: "rgba(59,130,246,0.14)" }]}>
              <Ionicons name="bar-chart-outline" size={19} color="#60A5FA" />
            </View>
            <Text style={styles.tileLabel}>Статистика</Text>
          </GlassCard>
          <GlassCard
            radius={16}
            style={{ flex: 1, alignItems: "center", paddingVertical: 14 }}
            onPress={() => nav.navigate("Тарифы")}
          >
            <View style={[styles.tileIconBox, { backgroundColor: "rgba(42,171,238,0.14)" }]}>
              <Ionicons name="card-outline" size={19} color="#2AABEE" />
            </View>
            <Text style={styles.tileLabel}>Тарифы</Text>
          </GlassCard>
        </View>
      </ScrollView>

      <AppFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />
      <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={balance}
        daysLeft={daysLeft}
      />
      <ServerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        nodes={allVisible}
        selectedId={selectedNode?.id || null}
        pingRight
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
  headerLogo: { width: 32, height: 32, borderRadius: 8 },
  headerTitle: {
    color: "#7B2FBE",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginLeft: 8,
  },
  headerVersion: { color: colors.green, fontSize: 12, fontWeight: "500", marginLeft: 8, marginTop: 8 },
  headerIconBox: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  status: { fontSize: 14, fontWeight: "600" },
  trafficHint: { color: colors.textDim, fontSize: 12, fontWeight: "500" },
  trafficTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.cardLight,
    marginTop: 6,
    maxWidth: 180,
    overflow: "hidden",
  },
  trafficFill: { height: "100%", borderRadius: 2, backgroundColor: colors.accent },
  plusBtn: {
    width: 20,
    height: 18,
    borderRadius: 6,
    backgroundColor: "rgba(139,92,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  sphereGlow: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    top: 19,
  },
  sphereWrap: {
    width: 210,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.4,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 6 },
    elevation: 18,
  },
  sphereRing: {
    position: "absolute",
    width: 194,
    height: 194,
    borderRadius: 97,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardLight,
  },
  spherePress: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  lteIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  lteBeta: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "rgba(124,58,237,0.15)",
  },
  lteBetaText: { color: PURPLE, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  flagBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(168,85,247,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  serverName: { color: colors.text, fontSize: 14, fontWeight: "600" },
  serverSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  roundRefresh: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  glassDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  tileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileLabel: { color: colors.text, fontSize: 12, fontWeight: "600" },
  dock: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
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
    backgroundColor: "rgba(139,92,246,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(139,92,246,0.3)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dockPillText: { color: colors.accent, fontSize: 15, fontWeight: "600" },

});
