import { BrandName } from "../../components/BrandName";
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Application from "expo-application";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../../context";
import { SubscriptionUpdatedLabel } from "../../components/SubscriptionUpdatedLabel";
import { connect, disconnect, resolveConnectNode } from "../../vpn/manager";
import * as pingStore from "../../vpn/pingStore";
import { useVpnTimerSeconds, formatElapsed } from "../../vpn/timer";
import type { VpnNode } from "../../vpn/parse";
import { colors, splitNameFlag, formatBytes, useTheme, pingColor as pingColorFor, pingFailLabel, BRAND_PURPLE } from "../../theme";
import { PowerButton } from "../../components/PowerButton";
import { AnnouncementsArea } from "../../components/AnnouncementsArea";
import { transportLabel } from "../../utils/transportLabel";
import { ConnectionFilterModal } from "../../components/ConnectionFilterModal";
import { BalanceSheet } from "../../components/BalanceSheet";
import { showToast } from "../../components/Toast";
import { ServerSheet } from "./ServerSheet";
import { GlassCard, GlassScreenBackdrop, GLASS_SCROLL_HANDLERS } from "../../components/liquidGlass";
import { AUTO_SERVER_ID } from "../../vpn/autoSelect";
import { isBestServerAggregate } from "../../vpn/serverGrouping";
import * as stats from "../../stats";

const PURPLE = "#7C3AED";

/** Стеклянная карточка темы Liquid Glass.
 *
 * Раньше — BlurView из expo-blur (только гауссов блюр того, что под карточкой).
 * Теперь — AGSL-движок (react-native-liquid-glassmorphism): настоящее
 * преломление фона на GPU каждый кадр, контент ВНУТРИ стекла с вуалью
 * читабельности (legibilityFloor). Фон темы — плоская заливка colors.bg,
 * которую рисует GlassBackdropProvider, поэтому карточка преломляет её
 * вместе со скроллящимся контентом, как в референсе.
 *
 * `intensity` сохранён для совместимости вызовов: маппится в силу блюра.
 * Каноническая реализация — в components/liquidGlass/GlassCard, здесь
 * реэкспорт, чтобы у всех разделов темы был один и тот же блок. */
export { GlassCard } from "../../components/liquidGlass";

/** Главный экран темы Liquid Glass: фон рисует GlassBackdropProvider,
 *  стеклянные карточки и сфера питания — как в референсе Backdrop. */
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

  const [busy, setBusy] = useState(false);
  // Таймер от абсолютной метки подключения — не обнуляется при ремаунте
  const seconds = useVpnTimerSeconds(vpnRunning);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });

  const mainNodes = useMemo(() => nodes.filter((n) => n.source !== "lte" && !isBestServerAggregate(n)), [nodes]);
  const lteNodes = useMemo(
    () => nodes.filter((n) => n.source === "lte"),
    [nodes]
  );
  const allVisible = useMemo(() => [...mainNodes, ...lteNodes], [mainNodes, lteNodes]);

  const selectedNode = useMemo(
    () => selectedNodeId === AUTO_SERVER_ID ? null : allVisible.find((n) => n.id === selectedNodeId) || mainNodes[0] || null,
    [allVisible, selectedNodeId, mainNodes]
  );

  useEffect(() => {
    const load = () => stats.sumDays(1).then(setTodayStat).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  // Пинг — только по кнопке «Пинг» в меню выбора серверов, без автопроверки

  // Пульс и свечение — внутри общего компонента <PowerButton />

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
        const target = selectedNodeId === AUTO_SERVER_ID ? await (await import("../../vpn/manager")).resolveConnectNode(nodes, selectedNodeId) : selectedNode;
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
      } catch (e: any) {
        showToast(e?.message || "Ошибка переподключения");
        setVpnRunning(false);
      } finally {
        setBusy(false);
      }
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

  const selectedInfo = selectedNode
    ? splitNameFlag(selectedNode.name)
    : selectedNodeId === AUTO_SERVER_ID
      ? { name: "Умный режим", flag: "✨" }
      : null;
  const selPing = selectedNode ? pings[selectedNode.id] : undefined;
  const pingDone = selPing && selPing.status === "done" ? selPing : null;
  const pingOk = Boolean(pingDone && pingDone.delay > 0);
  const pingText = pingOk
    ? `${pingDone!.delay} мс`
    : pingDone
      ? pingFailLabel(pingDone.error)
      : null;
  const pingColor = pingOk
    ? pingColorFor(pingDone!.delay)
    : pingDone
      ? colors.red
      : colors.textDim;

  const expireStr = me?.expire_at
    ? new Date(String(me.expire_at)).toLocaleDateString("ru-RU")
    : "—";
  const expireColor =
    daysLeft <= 0 ? colors.red : daysLeft <= 3 ? colors.orange : colors.textDim;

  return (
    <View style={styles.screen}>
      {/* Собственный непрозрачный фон вкладки: AGSL-захват бэкдропа рисует весь
          корень, исключая только стёкла, — без этого слоя во время перехода
          вкладок стекло «впечатывает» контент соседней вкладки (призрачный
          текст). Провайдерский фон под стеком остаётся для push-экранов. */}
      <GlassScreenBackdrop />
      <ScrollView
          bounces={false}
          overScrollMode="never"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          // Плавающий док: контент не должен залезать под меню
          paddingBottom: insets.bottom + 116,
        }}
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={GLASS_SCROLL_HANDLERS.onMomentumScrollEnd}
                onScrollEndDrag={GLASS_SCROLL_HANDLERS.onScrollEndDrag}
      >
        {/* Шапка */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Image source={{ uri: "app_icon" }} style={styles.headerLogo} resizeMode="cover" />
          <BrandName style={styles.headerTitle} />
          <Text style={styles.headerVersion}>v{Application.nativeApplicationVersion || "1.0"}</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => nav.navigate("Support")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Поддержка">
            <GlassCard radius={8} intensity={35} style={styles.headerIconBox}>
              <Ionicons name="headset-outline" size={20} color={colors.text} />
            </GlassCard>
          </Pressable>
        </View>

        {/* Объявления с сервера — над балансом */}
        <AnnouncementsArea style={{ marginTop: 6, marginBottom: 10 }} />

        {/* Статус + баланс */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 6 }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => nav.navigate("Статистика")}
            accessibilityRole="button"
            accessibilityLabel="Трафик за сегодня. Открыть статистику"
          >
            <Text style={[styles.status, { color: vpnRunning ? "#22C55E" : colors.textDim }]}>
              {vpnRunning ? "Подключено" : "Не подключено"}
              {!!vpnRunning && ` · ${formatElapsed(seconds)}`}
            </Text>
          </Pressable>
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

        {/* Кнопка питания — идентична основной теме */}
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <PowerButton connected={vpnRunning} busy={busy} onToggle={toggle} />
        </View>

        {/* LTE OPEN: отдельный блок убран — серверы LTE обновляются общей
            кнопкой обновления (syncAll → reloadNodes тянет обычные + LTE) */}

        {/* Карточка сервера + фильтр соединения */}
        <GlassCard radius={32} style={{ marginTop: 8 }}>
          <Pressable
            style={styles.serverRow}
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Сервер: ${selectedInfo?.name || "не выбран"}. Открыть выбор сервера`}
          >
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
                {selectedNode ? transportLabel(selectedNode) : selectedNodeId === AUTO_SERVER_ID ? "Лучший доступный сервер" : "Выберите локацию"}
              </Text>
            </View>
            <Pressable
              onPress={syncAll}
              hitSlop={8}
              style={styles.roundRefresh}
              accessibilityRole="button"
              accessibilityLabel="Обновить список серверов"
              accessibilityState={{ busy: syncBusy }}
            >
              {syncBusy ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="refresh" size={15} color={colors.textDim} />
              )}
            </Pressable>
            <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
          </Pressable>
          <View style={styles.glassDivider} />
          <Pressable
            style={styles.serverRow}
            onPress={() => setAppsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Фильтр соединения: какие приложения идут через VPN"
          >
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

        {/* Трафик за сегодня — как в основной теме: две плитки Отправлено/Получено */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <GlassCard
            radius={26}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}
            onPress={() => nav.navigate("Статистика")}
          >
            <View style={[styles.statIconBox, { backgroundColor: "rgba(52,211,153,0.14)" }]}>
              <Ionicons name="arrow-up" size={15} color={colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statTileLabel}>Отправлено</Text>
              <Text style={styles.statTileValue}>{formatBytes(todayStat.tx)}</Text>
            </View>
          </GlassCard>
          <GlassCard
            radius={26}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}
            onPress={() => nav.navigate("Статистика")}
          >
            <View style={[styles.statIconBox, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="arrow-down" size={15} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statTileLabel}>Получено</Text>
              <Text style={styles.statTileValue}>{formatBytes(todayStat.rx)}</Text>
            </View>
          </GlassCard>
        </View>
        <SubscriptionUpdatedLabel style={{ marginTop: 12 }} />
      </ScrollView>

      <ConnectionFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />
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
        selectedId={selectedNodeId}
        onSelect={async (id) => {
          if (id === AUTO_SERVER_ID) {
            selectNode(id);
            setPickerOpen(false);
            if (vpnRunning) {
              setBusy(true);
              try {
                await disconnect();
                const best = await resolveConnectNode(nodes, id);
                if (!best) throw new Error("Нет доступных серверов");
                await connect(best, { isSponsor: me?.is_sponsor === true });
                setVpnRunning(true);
              } catch (e: any) {
                showToast(e?.message || "Ошибка умного режима");
                setVpnRunning(false);
              } finally {
                setBusy(false);
              }
            }
            return;
          }
          const node = allVisible.find((n) => n.id === id);
          if (node) chooseNode(node);
        }}
      />
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  headerLogo: { width: 32, height: 32, borderRadius: 8 },
  headerTitle: {
    color: BRAND_PURPLE,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginLeft: 8,
  },
  headerVersion: { color: colors.green, fontSize: 12, fontWeight: "500", marginLeft: 8, marginTop: 8 },
  headerIconBox: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  status: { fontSize: 14, fontWeight: "600" },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  statTileLabel: { color: colors.textFaint, fontSize: 10 },
  statTileValue: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 1 },
  plusBtn: {
    width: 20,
    height: 18,
    borderRadius: 6,
    backgroundColor: "rgba(139,92,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
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
