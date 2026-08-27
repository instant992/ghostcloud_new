import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { getSetting, setSetting, getJsonList, setJsonList } from "../../settings";
import { colors, splitNameFlag, useTheme, useThemeSwitcher, type ThemeName } from "../../theme";
import { AppFilterModal } from "../../components/AppFilterModal";
import { BalanceSheet } from "../../components/BalanceSheet";
import { PrivacyText } from "../../components/PrivacyText";
import { showToast } from "../../components/Toast";

function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
  return "дней";
}

function protoLabel(n: VpnNode): string {
  const base = n.protocol.toLowerCase();
  if (n.security === "reality") return `${base} reality`;
  const net = (n.network || "tcp").toLowerCase();
  return `${base} ${net}`;
}

/** Главный экран темы v2ray — полностью в духе v2rayNG:
 *  AppBar с гамбургером, строка баланса, вкладки профилей,
 *  плавающая кнопка пуска и нижняя строка статуса. */
export default function V2rayScreen() {
  const theme = useTheme();
  const switchTheme = useThemeSwitcher();
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
  const [pinned, setPinned] = useState<string[]>(() => getJsonList("v2ray_pinned_proxies"));
  const [smartLocation, setSmartLocation] = useState(() => getSetting("smart_location", "0") === "1");
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartName, setSmartName] = useState<string | null>(null);
  const [tab, setTab] = useState<"pinned" | "main" | "lte">("main");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const mainNodes = useMemo(() => nodes.filter((n) => n.source !== "lte"), [nodes]);
  const lteNodes = useMemo(
    () => (lteEnabled ? nodes.filter((n) => n.source === "lte") : []),
    [nodes, lteEnabled]
  );
  const pinnedNodes = useMemo(() => nodes.filter((n) => pinned.includes(n.id)), [nodes, pinned]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || mainNodes[0] || lteNodes[0] || null,
    [nodes, selectedNodeId, mainNodes, lteNodes]
  );

  useEffect(() => {
    if (!vpnRunning) {
      setSeconds(0);
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [vpnRunning]);

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

  const balance = ((me?.balance || 0) / 100).toFixed(0);

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

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setJsonList("v2ray_pinned_proxies", next);
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const toggleLte = (v: boolean) => {
    if (v && !subscriptionActive) {
      setDrawerOpen(false);
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
    } else if (tab === "lte") {
      setTab("main");
    }
  };

  const toggleSmartLocation = async (v: boolean) => {
    if (!v) {
      setSmartLocation(false);
      setSetting("smart_location", "0");
      setSmartName(null);
      return;
    }
    setSmartBusy(true);
    setSmartLocation(true);
    setSetting("smart_location", "1");
    try {
      await pingStore.pingAll(mainNodes);
      const snap = pingStore.getSnapshot();
      let best: VpnNode | null = null;
      let bestDelay = Infinity;
      for (const n of mainNodes) {
        const p = snap[n.id];
        if (p?.status === "done" && p.delay > 0 && p.delay < bestDelay) {
          best = n;
          bestDelay = p.delay;
        }
      }
      if (!best) {
        showToast("Не удалось найти доступный сервер");
        return;
      }
      selectNode(best.id);
      if (vpnRunning) {
        await disconnect();
        await connect(best);
        setVpnRunning(true);
      }
      const name = splitNameFlag(best.name).name;
      setSmartName(name);
      showToast(`Подключено: ${name}`);
    } catch {
      showToast("Ошибка умной локации");
    } finally {
      setSmartBusy(false);
    }
  };

  const checkDelays = async () => {
    setMenuOpen(false);
    await pingStore.pingAll(nodes);
    showToast("Проверка задержки завершена");
  };

  const updateSubscription = async () => {
    setMenuOpen(false);
    try {
      await Promise.all([reloadNodes(), refreshMe()]);
      showToast("Подписка обновлена");
    } catch {
      showToast("Не удалось обновить подписку");
    }
  };

  const currentNodes = tab === "pinned" ? pinnedNodes : tab === "lte" ? lteNodes : mainNodes;
  const emptyText =
    tab === "pinned"
      ? "Нет закреплённых серверов"
      : tab === "lte"
        ? "Нет серверов LTE OPEN"
        : "Серверов пока нет";

  const tabs: Array<{ key: "pinned" | "main" | "lte"; label: string; count: number }> = [];
  if (pinnedNodes.length > 0) tabs.push({ key: "pinned", label: "Закрепленные", count: pinnedNodes.length });
  tabs.push({ key: "main", label: "Основные", count: mainNodes.length });
  if (lteNodes.length > 0 && subscriptionActive) tabs.push({ key: "lte", label: "LTE OPEN", count: lteNodes.length });

  const selPing = selectedNode ? pings[selectedNode.id] : undefined;
  let statusText = "Нет соединения";
  if (vpnRunning) {
    statusText = "Подключено";
    if (selPing?.status === "pending") statusText += " • Проверяем...";
    else if (selPing?.status === "done" && selPing.delay > 0) statusText += ` • Пинг: ${selPing.delay} ms`;
    else if (selPing?.status === "done") statusText += " • недоступен";
  }

  const daysColor = daysLeft <= 0 ? colors.red : daysLeft <= 3 ? colors.orange : colors.text;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.appBar}>
          <IconBtn icon="menu" onPress={() => setDrawerOpen(true)} />
          <Text style={styles.appTitle}>GhostCloud</Text>
          <View style={{ flex: 1 }} />
          <IconBtn icon="person-outline" onPress={() => nav.navigate("Профиль")} />
          <IconBtn icon="ellipsis-vertical" onPress={() => setMenuOpen(true)} />
        </View>

        <View style={styles.balanceBar}>
          <IconBtn icon="add-circle-outline" size={18} color={colors.accent} onPress={() => setBalanceOpen(true)} />
          <Pressable
            style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
            onPress={() => setBalanceOpen(true)}
          >
            <Text style={styles.balanceText}>{balance} ₽</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.balanceHint}>Осталось: </Text>
            <Text style={[styles.balanceDays, { color: daysColor }]}>
              {daysLeft} {pluralDays(daysLeft)}
            </Text>
          </Pressable>
          <IconBtn icon="cart-outline" size={18} color={colors.green} onPress={() => setBalanceOpen(true)} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {tabs.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabItem, tab === t.key && styles.tabItemOn]}
            >
              {t.key === "lte" ? (
                <PrivacyText style={[styles.tabLabel, tab === t.key && { color: colors.accent }]}>
                  {t.label} ({t.count})
                </PrivacyText>
              ) : (
                <Text style={[styles.tabLabel, tab === t.key && { color: colors.accent }]}>
                  {t.label} ({t.count})
                </Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          data={currentNodes}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => (
            <ServerRow
              node={item}
              selected={item.id === selectedNode?.id}
              ping={pings[item.id]}
              isPinned={pinned.includes(item.id)}
              onSelect={() => {
                selectNode(item.id);
                Haptics.selectionAsync().catch(() => {});
              }}
              onPing={() => pingStore.pingOne(item)}
              onTogglePin={() => togglePin(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <Text style={{ color: colors.textDim }}>{emptyText}</Text>
            </View>
          }
        />

        <Pressable
          style={[styles.fab, { backgroundColor: vpnRunning ? "#22C55E" : "#B0B0B0", opacity: busy ? 0.7 : 1 }]}
          onPress={toggle}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name={vpnRunning ? "stop" : "play"} size={40} color="#fff" />
          )}
        </Pressable>
      </View>

      <Pressable
        style={[styles.statusBar, { paddingBottom: Math.max(14, insets.bottom + 4) }]}
        onPress={() => {
          if (vpnRunning && selectedNode) pingStore.pingOne(selectedNode);
        }}
      >
        {selPing?.status === "pending" && vpnRunning ? (
          <ActivityIndicator size="small" color={colors.textDim} style={{ marginRight: 8 }} />
        ) : null}
        <Text style={styles.statusText}>{statusText}</Text>
        {!!vpnRunning && !!selectedNode && (
          <Text style={styles.statusTimer}>  {formatTimer(seconds)}</Text>
        )}
      </Pressable>

      <AppFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />

      <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={Number(balance)}
        daysLeft={daysLeft}
      />

      {/* Боковое меню */}
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerBackdrop}>
          <View style={[styles.drawer, { paddingTop: insets.top + 10 }]}>
            <Text style={styles.drawerTitle}>Главное меню</Text>

            <DrawerItem
              icon="shield-half-outline"
              label="Фильтр соединения"
              privacy
              chevron
              onPress={() => {
                setDrawerOpen(false);
                setAppsOpen(true);
              }}
            />
            <View style={styles.drawerDivider} />
            <DrawerItem
              icon="settings-outline"
              label="Настройки"
              onPress={() => {
                setDrawerOpen(false);
                nav.navigate("Настройки");
              }}
            />

            <View style={styles.drawerRow}>
              {lteBusy ? (
                <ActivityIndicator size="small" color={colors.accent} style={{ width: 22 }} />
              ) : (
                <Ionicons name="cellular-outline" size={21} color={colors.text} />
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <PrivacyText style={styles.drawerRowTitle}>LTE OPEN</PrivacyText>
                {!lteEnabled && lteBusy && (
                  <Text style={styles.drawerRowSub}>Загружаем профили...</Text>
                )}
              </View>
              <Switch
                value={lteEnabled}
                onValueChange={toggleLte}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.drawerRow}>
              {smartBusy ? (
                <ActivityIndicator size="small" color={colors.accent} style={{ width: 22 }} />
              ) : (
                <Ionicons name="sparkles-outline" size={21} color={colors.text} />
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.drawerRowTitle}>Умная локация</Text>
                <Text style={styles.drawerRowSub}>
                  {smartBusy
                    ? "Поиск лучшего сервера..."
                    : smartLocation && smartName
                      ? `Подключено: ${smartName}`
                      : "Авто-выбор лучшего сервера"}
                </Text>
              </View>
              <Switch
                value={smartLocation}
                onValueChange={toggleSmartLocation}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            <View style={{ flex: 1 }} />

            <View style={styles.themePill}>
              {(
                [
                  ["dark", "moon-outline", "Тёмная"],
                  ["auto", "contrast", "Авто"],
                  ["light", "sunny-outline", "Светлая"],
                ] as Array<[ThemeName, any, string]>
              ).map(([key, icon, label]) => {
                const on = theme.name === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.themeSeg, on && styles.themeSegOn]}
                    onPress={() => {
                      setSetting("theme", key);
                      switchTheme(key);
                    }}
                  >
                    <Ionicons name={icon} size={14} color={on ? "#fff" : colors.textDim} />
                    {on && <Text style={styles.themeSegText}>{label}</Text>}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.updateRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.green} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.updateTitle}>Проверить обновления</Text>
                <Text style={styles.updateSub}>
                  v{Application.nativeApplicationVersion || "1.0.0"} — актуальная
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
            </View>
          </View>
          <Pressable style={{ flex: 1 }} onPress={() => setDrawerOpen(false)} />
        </View>
      </Modal>

      {/* Меню ⋮ */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCard}>
            <MenuRow icon="speedometer-outline" label="Проверить задержку профилей" onPress={checkDelays} />
            <MenuRow icon="refresh" label="Обновить подписку" onPress={updateSubscription} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function formatTimer(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function IconBtn({
  icon,
  onPress,
  size = 22,
  color,
}: {
  icon: any;
  onPress: () => void;
  size?: number;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ padding: 8, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={size} color={color || colors.text} />
    </Pressable>
  );
}

function DrawerItem({
  icon,
  label,
  onPress,
  chevron,
  privacy,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  chevron?: boolean;
  privacy?: boolean;
}) {
  return (
    <Pressable style={makeStyles().drawerItem} onPress={onPress}>
      <Ionicons name={icon} size={21} color={colors.text} />
      {privacy ? (
        <PrivacyText style={makeStyles().drawerItemText}>{label}</PrivacyText>
      ) : (
        <Text style={makeStyles().drawerItemText}>{label}</Text>
      )}
      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
    </Pressable>
  );
}

function MenuRow({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  const styles = makeStyles();
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.menuRowText}>{label}</Text>
    </Pressable>
  );
}

function ServerRow({
  node,
  selected,
  ping,
  isPinned,
  onSelect,
  onPing,
  onTogglePin,
}: {
  node: VpnNode;
  selected: boolean;
  ping: pingStore.PingState | undefined;
  isPinned: boolean;
  onSelect: () => void;
  onPing: () => void;
  onTogglePin: () => void;
}) {
  const styles = makeStyles();
  const info = splitNameFlag(node.name);

  let pingText = "n/a";
  let pingColor = colors.red;
  if (ping?.status === "pending") {
    pingText = "...";
    pingColor = colors.textDim;
  } else if (ping?.status === "done" && ping.delay > 0) {
    pingText = `${ping.delay} ms`;
    pingColor = colors.green;
  }

  return (
    <Pressable style={styles.row} onPress={onSelect}>
      <View style={[styles.selBar, selected && styles.selBarOn]} />
      <View style={styles.rowFlag}>
        <Text style={{ fontSize: 20 }}>{info.flag}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 11 }}>
        <Text style={styles.rowName} numberOfLines={2}>
          {info.name}
        </Text>
        <Text style={styles.rowProto}>{protoLabel(node)}</Text>
        <Text style={[styles.rowPing, { color: pingColor }]}>{pingText}</Text>
      </View>
      {ping?.status === "pending" ? (
        <ActivityIndicator size="small" color={colors.accent} style={{ width: 40 }} />
      ) : (
        <Pressable onPress={onPing} hitSlop={8} style={styles.rowIconBtn}>
          <Ionicons name="speedometer-outline" size={20} color={colors.text} />
        </Pressable>
      )}
      <Pressable onPress={onTogglePin} hitSlop={8} style={styles.rowIconBtn}>
        <Ionicons
          name={isPinned ? "push" : "push-outline"}
          size={20}
          color={isPinned ? colors.accent : colors.textFaint}
        />
      </Pressable>
    </Pressable>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  appTitle: { color: colors.accent, fontSize: 22, fontWeight: "800", marginLeft: 2 },
  balanceBar: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    backgroundColor: colors.bgSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  balanceText: { color: colors.text, fontSize: 13, fontWeight: "600", marginLeft: 2 },
  balanceHint: { color: colors.textDim, fontSize: 12 },
  balanceDays: { fontSize: 13, fontWeight: "600", marginRight: 2 },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabItemOn: { borderBottomColor: colors.accent },
  tabLabel: { color: colors.textDim, fontWeight: "700", fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selBar: {
    width: 5,
    alignSelf: "stretch",
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  selBarOn: { backgroundColor: colors.accent },
  rowFlag: { width: 30, alignItems: "center", marginLeft: 10 },
  rowName: { color: colors.text, fontSize: 17, lineHeight: 21 },
  rowProto: { color: colors.accent, fontSize: 12, fontWeight: "500", marginTop: 5 },
  rowPing: { fontSize: 12, fontWeight: "500", marginTop: 3 },
  rowIconBtn: { padding: 8, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 76,
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 14,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  statusText: { color: colors.text, fontSize: 16, opacity: 0.7 },
  statusTimer: { color: colors.textDim, fontSize: 13 },
  drawerBackdrop: { flex: 1, flexDirection: "row", backgroundColor: "rgba(0,0,0,0.5)" },
  drawer: {
    width: 300,
    backgroundColor: colors.bg,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  drawerItemText: { color: colors.text, fontSize: 14, flex: 1, fontWeight: "500" },
  drawerDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4, opacity: 0.6 },
  drawerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  drawerRowTitle: { color: colors.text, fontSize: 14, fontWeight: "500" },
  drawerRowSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  themePill: {
    flexDirection: "row",
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardLight,
    marginHorizontal: 8,
    marginVertical: 6,
    padding: 3,
  },
  themeSeg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    gap: 4,
  },
  themeSegOn: { backgroundColor: colors.accent },
  themeSegText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  updateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  updateTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  updateSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 130,
    paddingRight: 12,
  },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    minWidth: 260,
    elevation: 8,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuRowText: { color: colors.text, fontSize: 14, fontWeight: "500" },
});
