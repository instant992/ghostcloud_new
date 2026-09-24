import React, { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../../context";
import { connect, disconnect } from "../../vpn/manager";
import * as pingStore from "../../vpn/pingStore";
import type { VpnNode } from "../../vpn/parse";
import { colors, splitNameFlag, useTheme, isLightPalette } from "../../theme";
import { transportLabel } from "../../utils/transportLabel";
import { ServerSheet } from "./ServerSheet";
import { showToast } from "../../components/Toast";
import { useVpnTimerSeconds, formatElapsed } from "../../vpn/timer";

/** Тема «AWG» — стиль AmneziaVPN: чёрный фон, контурный круг «Подключиться»
 *  со свечением, снизу панель выбора сервера, док из контурных иконок. */
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
  const seconds = useVpnTimerSeconds(vpnRunning);

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

      {/* Нижняя панель сервера + док из контурных иконок */}
      <View style={styles.bottomArea}>
        <Pressable
          style={styles.serverPanel}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Выбор сервера. Текущий: ${selectedInfo?.name || "не выбран"}`}
        >
          <Text style={styles.serverFlag} accessibilityElementsHidden>
            {selectedInfo?.flag || "🌐"}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.serverName} numberOfLines={1}>
              {selectedInfo?.name || "Выберите сервер"}
            </Text>
            <Text style={styles.serverSub} numberOfLines={1}>
              {selectedNode ? transportLabel(selectedNode) : "—"}
              {selPing?.status === "done" && !selPing.error && selPing.delay > 0
                ? ` | ${selPing.delay} мс`
                : ""}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={colors.textFaint} />
        </Pressable>

        {/* Док: Главная (активна) / Рефералы / Настройки / Тарифы */}
        <View style={[styles.dock, { paddingBottom: Math.max(10, insets.bottom) }]}>
          <View style={styles.dockSlot} accessibilityRole="tab" accessibilityState={{ selected: true }}>
            <Ionicons name="home" size={24} color={colors.accent} />
          </View>
          <Pressable
            style={styles.dockSlot}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              nav.navigate("Referral");
            }}
            accessibilityRole="tab"
            accessibilityLabel="Рефералы"
          >
            <Ionicons name="share-outline" size={24} color={colors.textFaint} />
          </Pressable>
          <Pressable
            style={styles.dockSlot}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              nav.navigate("Настройки");
            }}
            accessibilityRole="tab"
            accessibilityLabel="Настройки"
          >
            <Ionicons name="settings-outline" size={24} color={colors.textFaint} />
          </Pressable>
          <Pressable
            style={styles.dockSlot}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              nav.navigate("Тарифы");
            }}
            accessibilityRole="tab"
            accessibilityLabel="Тарифы"
          >
            <Ionicons name="add" size={26} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>

      <ServerSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        nodes={nodes}
        selectedId={selectedNodeId}
        onSelect={chooseNode}
      />
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
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
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bgSoft,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    serverPanel: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    dock: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      paddingTop: 14,
    },
    dockSlot: {
      paddingHorizontal: 18,
      paddingVertical: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    serverFlag: { fontSize: 26 },
    serverName: { color: colors.text, fontSize: 15, fontWeight: "700" },
    serverSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  });
