import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Image,
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
import { connect, disconnect, pickBestNode } from "../../vpn/manager";
import * as pingStore from "../../vpn/pingStore";
import { AUTO_SERVER_ID } from "../../vpn/autoSelect";
import type { VpnNode } from "../../vpn/parse";
import { getSetting, setSetting } from "../../settings";
import { colors, splitNameFlag, formatBytes, useTheme, isLightPalette, powerButtonColors, pingColor } from "../../theme";
import { transportLabel } from "../../utils/transportLabel";
import { ConnectionFilterModal } from "../../components/ConnectionFilterModal";
import { showToast } from "../../components/Toast";
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
  const [appsOpen, setAppsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });
  /** Выпадающий список типа серверов: обычные / LTE OPEN */
  const [serverTab, setServerTab] = useState<"regular" | "lte">("regular");
  const [serverMenuOpen, setServerMenuOpen] = useState(false);

  const mainNodes = useMemo(() => nodes.filter((n) => n.source !== "lte"), [nodes]);
  const lteNodes = useMemo(
    () => (lteEnabled ? nodes.filter((n) => n.source === "lte") : []),
    [nodes, lteEnabled]
  );
  const allVisible = useMemo(() => [...mainNodes, ...lteNodes], [mainNodes, lteNodes]);

  const autoMode = selectedNodeId === AUTO_SERVER_ID;
  const selectedNode = useMemo(
    () =>
      autoMode
        ? null
        : allVisible.find((n) => n.id === selectedNodeId) || mainNodes[0] || null,
    [allVisible, selectedNodeId, mainNodes, autoMode]
  );
  /** Список серверов выбранного типа (обычные / LTE OPEN) */
  const tabNodes = useMemo(
    () => (serverTab === "lte" ? lteNodes : mainNodes),
    [serverTab, lteNodes, mainNodes]
  );
  const otherNodes = useMemo(
    () => tabNodes.filter((n) => n.id !== selectedNode?.id),
    [tabNodes, selectedNode]
  );

  // Выпадающий список следует за типом выбранного сервера
  useEffect(() => {
    if (selectedNode?.source === "lte") setServerTab("lte");
  }, [selectedNode?.source]);

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
        // Режим «Автовыбор»: настоящий тест серверов через прокси (нужен выключенный VPN)
        let target: VpnNode | null;
        if (autoMode) {
          const best = await pickBestNode(nodes);
          target = best[0] || null;
        } else {
          target = selectedNode;
        }
        if (!target) {
          showToast("Нет доступных серверов");
          return;
        }
        await connect(target, { isSponsor: me?.is_sponsor === true });
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
        await connect(node, { isSponsor: me?.is_sponsor === true });
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

  /** Режим «Автовыбор»: тест серверов через прокси и подключение к лучшему. */
  const chooseAuto = async () => {
    selectNode(AUTO_SERVER_ID);
    Haptics.selectionAsync().catch(() => {});
    if (vpnRunning) {
      try {
        setBusy(true);
        await disconnect();
        const best = await pickBestNode(nodes);
        const node = best[0];
        if (!node) {
          showToast("Нет доступных серверов");
          setVpnRunning(false);
          return;
        }
        await connect(node, { isSponsor: me?.is_sponsor === true });
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

  return (
    <View style={styles.screen}>
      {/* Шапка: версия — иконка+название — поддержка */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{Application.nativeApplicationVersion || "1.0"}</Text>
        </View>
        <View style={styles.headerCenter}>
          <Image source={{ uri: "app_icon" }} style={styles.headerLogo} resizeMode="cover" />
          <Text style={styles.headerTitle}>GhostCloud</Text>
        </View>
        <Pressable
          onPress={() => nav.navigate("Support")}
          hitSlop={8}
          style={styles.headerIcon}
          accessibilityRole="button"
          accessibilityLabel="Поддержка"
        >
          <Ionicons name="headset-outline" size={21} color={colors.textDim} />
        </Pressable>
      </View>

      {/* Тип серверов: раскрывающийся список «Обычные» / «LTE OPEN».
          Меню раскрывается в потоке (без перекрытия со скроллом),
          поэтому тапы по пунктам всегда срабатывают. */}
      <View style={styles.serverTypeRow}>
        <Pressable
          style={styles.serverTypeBtn}
          onPress={() => setServerMenuOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Тип серверов: ${serverTab === "lte" ? "LTE OPEN" : "обычные"}. Нажмите, чтобы изменить`}
        >
          <Ionicons
            name={serverTab === "lte" ? "cellular-outline" : "server-outline"}
            size={16}
            color={colors.accent}
          />
          <Text style={styles.serverTypeText} numberOfLines={1}>
            {serverTab === "lte" ? `LTE OPEN (${lteNodes.length})` : `Обычные серверы (${mainNodes.length})`}
          </Text>
          <Ionicons name={serverMenuOpen ? "chevron-up" : "chevron-down"} size={15} color={colors.textDim} />
        </Pressable>
        {serverMenuOpen && (
          <View style={styles.serverTypeMenu}>
            <Pressable
              style={[styles.serverTypeMenuItem, serverTab === "regular" && styles.serverTypeMenuItemOn]}
              onPress={() => {
                setServerTab("regular");
                setServerMenuOpen(false);
              }}
            >
              <Ionicons name="server-outline" size={15} color={serverTab === "regular" ? "#fff" : colors.textDim} />
              <Text style={[styles.serverTypeMenuText, serverTab === "regular" && { color: "#fff" }]}>
                Обычные серверы
              </Text>
              {serverTab === "regular" && <Ionicons name="checkmark" size={15} color="#fff" />}
            </Pressable>
            <Pressable
              style={[styles.serverTypeMenuItem, serverTab === "lte" && styles.serverTypeMenuItemOn]}
              onPress={() => {
                setServerTab("lte");
                setServerMenuOpen(false);
                if (!lteEnabled) toggleLte(true); // включаем загрузку профилей при выборе
              }}
            >
              <Ionicons name="cellular-outline" size={15} color={serverTab === "lte" ? "#fff" : colors.textDim} />
              <Text style={[styles.serverTypeMenuText, serverTab === "lte" && { color: "#fff" }]}>
                LTE OPEN
              </Text>
              {serverTab === "lte" && <Ionicons name="checkmark" size={15} color="#fff" />}
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
          bounces={false}
          overScrollMode="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 116 }}
        showsVerticalScrollIndicator={false}
      >

        {/* Кнопка питания — цвета как в основной теме */}
        <View style={styles.powerArea}>
          <View
            style={[
              styles.powerGlow,
              {
                shadowColor: vpnRunning ? powerButtonColors().glow : "#000",
                shadowOpacity: vpnRunning ? 0.45 : 0.18,
              },
            ]}
          >
            <Pressable
              onPress={toggle}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={vpnRunning ? "Выключить VPN" : "Включить VPN"}
              accessibilityState={{ busy }}
              style={[
                styles.powerBtn,
                {
                  opacity: busy ? 0.7 : 1,
                  backgroundColor: vpnRunning ? powerButtonColors().on : powerButtonColors().off,
                  borderColor: vpnRunning ? powerButtonColors().on : colors.border,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="large" color={vpnRunning ? "#fff" : colors.accent} />
              ) : (
                <Ionicons
                  name="power"
                  size={56}
                  color={vpnRunning ? "#fff" : isLightPalette() ? colors.accent : "#fff"}
                />
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
            <Ionicons name="shield-half-outline" size={22} color={colors.text} />
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

        {/* Трафик за сегодня — как в основной теме: Отправлено/Получено. И дни. */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            style={[styles.miniCard, { flex: 1 }]}
            onPress={() => nav.navigate("Статистика")}
            accessibilityRole="button"
            accessibilityLabel={`Отправлено сегодня: ${formatBytes(todayStat.tx)}. Открыть статистику`}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="arrow-up" size={13} color={colors.green} />
              <Text style={styles.miniCardTitle}>Отправлено</Text>
            </View>
            <Text style={styles.miniCardValue}>{formatBytes(todayStat.tx)}</Text>
          </Pressable>
          <Pressable
            style={[styles.miniCard, { flex: 1 }]}
            onPress={() => nav.navigate("Статистика")}
            accessibilityRole="button"
            accessibilityLabel={`Получено сегодня: ${formatBytes(todayStat.rx)}. Открыть статистику`}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="arrow-down" size={13} color={colors.accent} />
              <Text style={styles.miniCardTitle}>Получено</Text>
            </View>
            <Text style={styles.miniCardValue}>{formatBytes(todayStat.rx)}</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 10 }}>
          <View style={[styles.miniCard]}>
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

        {/* Выбранный сервер — сплошная заливка (без стрелки выбора — сервер меняется из списка ниже) */}
        <View
          style={[styles.selectedCard, lteEnabled && selectedNode?.source === "lte" && { backgroundColor: colors.accentDeep }]}
        >
          <View style={styles.selectedFlagBox}>
            <Text style={{ fontSize: 18 }}>{selectedInfo?.flag || "🌍"}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.selectedName} numberOfLines={1}>
              {autoMode ? "Автовыбор" : selectedInfo?.name || "Сервер не выбран"}
            </Text>
            <Text style={styles.selectedSub} numberOfLines={1}>
              {autoMode
                ? "Лучший сервер по пингу"
                : selectedNode ? transportLabel(selectedNode) : "Нажмите, чтобы выбрать"}
            </Text>
          </View>
          {selPing?.status === "pending" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : selPing?.status === "done" && selPing.delay > 0 ? (
            <Text style={styles.selectedPing}>{selPing.delay} мс</Text>
          ) : null}
        </View>

        {/* LTE OPEN — переключатель в нижнем блоке серверов */}
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
              <Text style={styles.lteTitle}>LTE OPEN</Text>
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

        {/* Другие локации — серверы выбранного типа (обычные / LTE) */}
        <View style={styles.otherHeader}>
          <View style={styles.otherLine} />
          <Text style={styles.otherText}>
            {serverTab === "lte" ? "LTE OPEN серверы" : "Другие локации"}
          </Text>
          <View style={styles.otherLine} />
          <Pressable onPress={refreshServers} hitSlop={8} disabled={refreshing} style={styles.roundRefresh}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh" size={14} color={colors.textDim} />
            )}
          </Pressable>
        </View>

        {/* Автовыбор — лучший обычный сервер по пингу (только среди обычных) */}
        {serverTab === "regular" && (
          <Pressable
            style={[styles.otherRow, autoMode && { borderColor: colors.accent }]}
            onPress={chooseAuto}
          >
            <Text style={{ fontSize: 20 }}>✨</Text>
            <Text style={styles.otherName} numberOfLines={1}>
              Автовыбор
            </Text>
            {autoMode && (
              <Text style={[styles.otherPing, { color: colors.accent }]}>активен</Text>
            )}
          </Pressable>
        )}

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

      <ConnectionFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />
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
  },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.6 },
  headerIcon: { padding: 10, margin: -4 },
  serverTypeRow: { marginTop: 8, marginHorizontal: 20 },
  serverTypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  serverTypeText: {
    flex: 1,
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "700",
  },
  serverTypeMenu: {
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 6,
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  serverTypeMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  serverTypeMenuItemOn: { backgroundColor: colors.accentDeep },
  serverTypeMenuText: { flex: 1, color: colors.textDim, fontSize: 13.5, fontWeight: "600" },
  lteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
  },
  lteIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
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
  powerArea: { alignItems: "center", paddingVertical: 16 },
  powerGlow: {
    borderRadius: 100,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  powerBtn: {
    width: 152,
    height: 152,
    borderRadius: 76,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  statusText: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  timerText: { color: "#22C55E", fontSize: 13, fontWeight: "600", marginTop: 2 },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  squareIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  roundRefresh: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardLight,
    alignItems: "center",
    justifyContent: "center",
  },
  miniCard: {
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    paddingBottom: 10,
  },
  miniCardTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  miniCardLabel: { color: colors.textDim, fontSize: 11, fontWeight: "500" },
  miniCardValue: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  miniBarTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(240,242,255,0.08)",
    marginTop: 8,
    overflow: "hidden",
  },
  miniBarFill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
  miniCardSub: { color: colors.textDim, fontSize: 10, marginTop: 6 },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  selectedFlagBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedName: { color: "#fff", fontSize: 14, fontWeight: "700" },
  selectedSub: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  selectedPing: { color: "#fff", fontSize: 13, fontWeight: "600", marginRight: 6 },
  otherHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
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
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
