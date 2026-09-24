import React, { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../../context";
import { connect, disconnect } from "../../vpn/manager";
import * as pingStore from "../../vpn/pingStore";
import type { VpnNode } from "../../vpn/parse";
import { colors, splitNameFlag, useTheme, isLightPalette, sheetSurfaceBg } from "../../theme";
import { transportLabel } from "../../utils/transportLabel";
import { ServerSheet } from "./ServerSheet";
import TopUpScreen from "../TopUpScreen";
import PlansScreen from "../PlansScreen";
import { ConnectionFilterModal } from "../../components/ConnectionFilterModal";
import * as appFilterMod from "../../vpn/appFilter";
import { computeBypassForNetwork, loadFilterSettings } from "../../vpn/connectionFilter";
import { getNetworkType } from "../../vpn/native";
import { showToast } from "../../components/Toast";
import { useVpnTimerSeconds, formatElapsed } from "../../vpn/timer";

function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
  return "дней";
}

/** Всплывающее окно (bottom-sheet) с заголовком и крестиком — внутри
 *  рендерится готовый экран (пополнение / продление подписки). */
function AwgPopup({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={popupStyles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Закрыть: ${title}`}
        />
        <View style={popupStyles.sheet}>
          <View style={popupStyles.handle} />
          <View style={popupStyles.header}>
            <Text style={popupStyles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.textFaint} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const popupStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    height: "88%",
    backgroundColor: sheetSurfaceBg(),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
});

/** Тема «AWG» — стиль AmneziaVPN: чёрный фон, контурный круг «Подключиться»
 *  со свечением, сверху дни подписки и баланс (тап — всплывающее окно),
 *  снизу панель выбора сервера, док из контурных иконок. */
export default function AwgScreen() {
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
  } = useApp();

  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  /** Краткий статус раздельного туннелирования: «выключено» / «N приложений мимо» и т.п. */
  const [splitLabel, setSplitLabel] = useState("выключено");
  const seconds = useVpnTimerSeconds(vpnRunning);

  const refreshSplitLabel = () => {
    appFilterMod
      .loadFilter()
      .then(async (f) => {
        let parts: string[] = [];
        try {
          const s = loadFilterSettings();
          const bypass = computeBypassForNetwork(s, getNetworkType());
          if (bypass.domains.length) parts.push(`${bypass.domains.length} сайтов мимо`);
          if (bypass.packages.length) parts.push(`${bypass.packages.length} приложений мимо`);
          if (s.active.length) parts.push(`${s.active.length} профилей`);
        } catch {}
        if (!parts.length) {
          if (f.allowed.length) parts.push(`через VPN ${f.allowed.length} прил.`);
          else if (f.blocked.length) parts.push(`мимо VPN ${f.blocked.length} прил.`);
        }
        setSplitLabel(parts.length ? parts.join(", ") : "выключено");
      })
      .catch(() => {});
  };

  React.useEffect(() => {
    refreshSplitLabel();
  }, [appsOpen]);

  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me]);
  const balanceRub = (me?.balance || 0) / 100;

  const allVisible = useMemo(() => nodes, [nodes]);
  const selectedNode = useMemo(
    () => allVisible.find((n) => n.id === selectedNodeId) || allVisible[0] || null,
    [allVisible, selectedNodeId]
  );

  const didPing = useRef(false);
  React.useEffect(() => {
    if (didPing.current || nodes.length === 0) return;
    didPing.current = true;
    pingStore.pingAll(nodes).catch(() => {});
  }, [nodes]);

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
        const target = selectedNode;
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

  const chooseNode = async (id: string) => {
    const node = allVisible.find((n) => n.id === id);
    if (!node) return;
    selectNode(id);
    setSheetOpen(false);
    Haptics.selectionAsync().catch(() => {});
    if (vpnRunning) {
      try {
        setBusy(true);
        await disconnect();
        await connect(node, { isSponsor: me?.is_sponsor === true });
        setVpnRunning(true);
      } catch (e: any) {
        showToast(e?.message || "Ошибка переподключения");
        setVpnRunning(false);
      } finally {
        setBusy(false);
      }
    }
  };

  const selectedInfo = selectedNode ? splitNameFlag(selectedNode.name) : null;
  const selPing = selectedNode ? pings[selectedNode.id] : undefined;
  const glow = vpnRunning ? colors.accent : isLightPalette() ? colors.accent : "#F5F0E6";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Сверху: дни подписки по центру, баланс справа — оба с «+» и тапом */}
      <View style={styles.topRow}>
        <Pressable
          style={styles.topPill}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setPlansOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Осталось ${daysLeft} ${pluralDays(daysLeft)} подписки. Продлить`}
        >
          <Ionicons name="time-outline" size={15} color={colors.textDim} />
          <Text style={styles.topPillText}>
            {daysLeft} {pluralDays(daysLeft)}
          </Text>
          <View style={styles.plusBadge}>
            <Ionicons name="add" size={13} color="#fff" />
          </View>
        </Pressable>
        <Pressable
          style={styles.topPill}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setTopupOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Баланс ${balanceRub.toFixed(0)} рублей. Пополнить`}
        >
          <Ionicons name="wallet-outline" size={15} color={colors.textDim} />
          <Text style={styles.topPillText}>{balanceRub.toFixed(0)} ₽</Text>
          <View style={styles.plusBadge}>
            <Ionicons name="add" size={13} color="#fff" />
          </View>
        </Pressable>
      </View>

      {/* Круг по центру */}
      <View style={styles.center}>
        <View style={[styles.glowOuter, { borderColor: glow + "22" }]}>
          <View style={[styles.glowMid, { borderColor: glow + "44" }]}>
            <Pressable
              onPress={toggle}
              style={[styles.circle, { borderColor: glow }, vpnRunning && { backgroundColor: colors.accentSoft }]}
              accessibilityRole="button"
              accessibilityLabel={vpnRunning ? "Отключиться" : "Подключиться"}
            >
              {busy ? (
                <ActivityIndicator size="large" color={colors.accent} />
              ) : (
                <Text style={[styles.circleText, vpnRunning && { color: colors.accent }]}>
                  {vpnRunning ? "Отключиться" : "Подключиться"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
        <Text style={[styles.status, { color: vpnRunning ? colors.green : colors.textDim }]}>
          {vpnRunning ? "Подключено" : "Не подключено"}
        </Text>
        {!!vpnRunning && (
          <Text style={styles.timer} numberOfLines={1}>
            {formatElapsed(seconds)}
          </Text>
        )}
      </View>

      {/* Низ: раздельное туннелирование на простом фоне + полноширинная карточка сервера */}
      <View style={styles.bottomArea}>
        {/* Раздельное туннелирование — текст по центру с шевроном, без подложки */}
        <Pressable
          style={styles.splitRow}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setAppsOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Раздельное туннелирование ${splitLabel}. Настроить`}
        >
          <Text style={styles.splitText} numberOfLines={1}>
            {`Раздельное туннелирование ${splitLabel}`}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textFaint} />
        </Pressable>

        {/* Карточка сервера как на фото: во всю ширину, скруглённые верхние углы, рамка */}
        <Pressable
          style={styles.serverCard}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Выбор сервера. Текущий: ${selectedInfo?.name || "не выбран"}`}
        >
          <View style={styles.handle} />
          <View style={styles.serverMainRow}>
            <Text style={styles.serverFlag} accessibilityElementsHidden>
              {selectedInfo?.flag || "🌐"}
            </Text>
            <Text
              style={styles.serverName}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {selectedInfo?.name || "Выберите сервер"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
          </View>
          {/* Снизу: пинг слева от протокола */}
          <View style={styles.serverSubRow}>
            {selPing?.status === "done" && !selPing.error && selPing.delay > 0 ? (
              <>
                <Text style={styles.serverPing}>{selPing.delay} мс</Text>
                <Text style={styles.serverSubDot}>·</Text>
              </>
            ) : null}
            <Text style={styles.serverSub} numberOfLines={1}>
              {selectedNode ? transportLabel(selectedNode) : "—"}
            </Text>
          </View>

          <View style={styles.dockSeparator} />

          {/* Док: Главная (активна) / Профиль / Настройки — кучно к центру */}
          <View style={[styles.dock, { paddingBottom: Math.max(10, insets.bottom) }]}>
            <View style={styles.dockSlot} accessibilityRole="tab" accessibilityState={{ selected: true }}>
              <Ionicons name="home" size={24} color={colors.accent} />
            </View>
            <Pressable
              style={styles.dockSlot}
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                nav.navigate("Профиль");
              }}
              accessibilityRole="tab"
              accessibilityLabel="Профиль"
            >
              <Ionicons name="person-outline" size={24} color={colors.textFaint} />
            </Pressable>
            <Pressable
              style={styles.dockSlot}
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                nav.navigate("Настройки");
              }}
              accessibilityRole="tab"
              accessibilityLabel="Настройки"
            >
              <Ionicons name="settings-outline" size={24} color={colors.textFaint} />
            </Pressable>
          </View>
        </Pressable>
      </View>

      <ServerSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        nodes={nodes}
        selectedId={selectedNodeId}
        onSelect={chooseNode}
      />

      {/* Всплывающие окна: пополнение баланса и продление подписки */}
      <AwgPopup visible={topupOpen} onClose={() => setTopupOpen(false)} title="Пополнение баланса">
        <TopUpScreen />
      </AwgPopup>
      <AwgPopup visible={plansOpen} onClose={() => setPlansOpen(false)} title="Продление подписки">
        <PlansScreen />
      </AwgPopup>

      <ConnectionFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    topPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingLeft: 12,
      paddingRight: 6,
      paddingVertical: 6,
    },
    topPillText: { color: colors.text, fontSize: 13, fontWeight: "700" },
    plusBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    // Свечение: вложенные контурные круги с убывающей прозрачностью
    glowOuter: {
      width: 300,
      height: 300,
      borderRadius: 150,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    glowMid: {
      width: 268,
      height: 268,
      borderRadius: 134,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    circle: {
      width: 236,
      height: 236,
      borderRadius: 118,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    circleText: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "600",
      letterSpacing: 0.3,
    },
    status: { marginTop: 28, fontSize: 15, fontWeight: "500" },
    timer: { marginTop: 6, fontSize: 13, color: colors.textFaint, fontVariant: ["tabular-nums"] },
    bottomArea: {
      backgroundColor: "transparent",
    },
    splitRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    splitText: {
      color: colors.textDim,
      fontSize: 14,
      fontWeight: "500",
    },
    serverCard: {
      alignItems: "center",
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 14,
      paddingTop: 6,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    serverMainRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      width: "100%",
    },
    serverSubRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 6,
    },
    serverSubDot: {
      color: colors.textFaint,
      fontSize: 12,
    },
    serverPing: {
      color: colors.textDim,
      fontSize: 13,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    dockSeparator: {
      alignSelf: "stretch",
      height: 1,
      backgroundColor: colors.border,
      marginTop: 12,
    },
    dock: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 44,
      paddingTop: 10,
    },
    dockSlot: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    serverFlag: { fontSize: 26 },
    // Длинное имя сервера: влезает в одну строку — крупно; не влезает —
    // переносится на две строки и автоматически уменьшается (adjustsFontSizeToFit)
    serverName: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      flexShrink: 1,
      textAlign: "center",
    },
    serverSub: { color: colors.textDim, fontSize: 12 },
  });
