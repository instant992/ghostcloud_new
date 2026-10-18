import { BrandName } from "../../components/BrandName";
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Image, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Divider, Text, TouchableRipple, useTheme, type MD3Theme } from "react-native-paper";
import { AnnouncementsArea } from "../../components/AnnouncementsArea";
import { PowerButton } from "../../components/PowerButton";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useApp } from "../../context";
import { ConnectionFilterModal } from "../../components/ConnectionFilterModal";
import { connect, disconnect, isVpnRunning, resolveSavedNode, resolveConnectNode } from "../../vpn/manager";
import { formatElapsed, useVpnTimerSeconds } from "../../vpn/timer";
import * as pingStore from "../../vpn/pingStore";
import * as stats from "../../stats";
import { formatBytes, splitNameFlag, pingColor, pingFailLabel } from "../../theme";
import { transportLabel } from "../../utils/transportLabel";
import { AUTO_SERVER_ID } from "../../vpn/autoSelect";
import { ServerSheet } from "./ServerSheet";

type Operation = "connect" | "disconnect" | "switch" | null;
const errorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && error.message.trim()) return error.message;
  return fallback;
};
const dayWord = (days: number) => days % 10 === 1 && days % 100 !== 11 ? "день" : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14) ? "дня" : "дней";

/** Paper's MD3 palette is supplied by the parent; navigation tabs live there too. */
export default function MaterialScreen() {
  const theme = useTheme<MD3Theme>();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { loading, nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, subscriptionActive, reloadNodes, subscriptionUpdatedAt } = useApp();
  const selected = useMemo(() => selectedNodeId === AUTO_SERVER_ID ? null : resolveSavedNode(selectedNodeId, nodes), [selectedNodeId, nodes]);
  const info = selected
    ? splitNameFlag(selected.name)
    : selectedNodeId === AUTO_SERVER_ID
      ? { name: "Умный режим", flag: "✨" }
      : null;
  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);
  const ping = selected ? pings[selected.id] : undefined;
  const seconds = useVpnTimerSeconds(vpnRunning);
  const [operation, setOperation] = useState<Operation>(null);
  const operationLock = useRef(false);
  const refreshLock = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [today, setToday] = useState<stats.DayStat | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [now, setNow] = useState(Date.now());

  const mounted = useRef(true);
  const updatedAtRef = useRef(subscriptionUpdatedAt);
  updatedAtRef.current = subscriptionUpdatedAt;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Only read persisted, real traffic; no speed estimates or fabricated chart.
  useFocusEffect(useCallback(() => {
    let active = true;
    let reading = false;
    const read = async () => {
      if (reading || AppState.currentState === "background") return;
      reading = true;
      setNow(Date.now());
      try {
        const value = await stats.sumDays(1);
        if (active) { setToday(value); setStatsError(false); }
      } catch {
        if (active) setStatsError(true);
      } finally { reading = false; }
    };
    void read();
    const interval = setInterval(() => { void read(); }, vpnRunning ? 5000 : 60000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void read(); });
    return () => { active = false; clearInterval(interval); listener.remove(); };
  }, [vpnRunning]));

  const expiry = me?.expire_at ? new Date(me.expire_at) : null;
  const expiryValid = expiry !== null && Number.isFinite(expiry.getTime());
  const days = expiryValid ? Math.max(0, Math.ceil((expiry!.getTime() - now) / 86400000)) : null;
  const canConnect = subscriptionActive && (!expiryValid || expiry!.getTime() > now);
  const busy = operation !== null;
  const powerDisabled = busy || loading || (!vpnRunning && !canConnect);
  const reportConnectionError = async (cause: unknown, fallback: string) => {
    // A reconnect may have stopped the old tunnel before failing. Query native truth.
    try {
      const running = await isVpnRunning();
      if (mounted.current) setVpnRunning(running);
    } catch { /* Shared native state listener remains authoritative. */ }
    if (mounted.current) setError(errorMessage(cause, fallback));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  };
  const toggle = async () => {
    if (operationLock.current || loading) return;
    if (!vpnRunning && !canConnect) { setError("Подписка неактивна. Продлите её в разделе «Тарифы»."); return; }
    if (!vpnRunning && !selected && selectedNodeId !== AUTO_SERVER_ID) { setPickerOpen(true); return; }
    operationLock.current = true;
    setOperation(vpnRunning ? "disconnect" : "connect");
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      if (vpnRunning) { await disconnect(); if (mounted.current) setVpnRunning(false); }
      else if (!vpnRunning) {
        const target = await resolveConnectNode(nodes, selectedNodeId);
        if (!target) throw new Error("Нет доступных серверов");
        await connect(target, { isSponsor: me?.is_sponsor === true });
        if (mounted.current) setVpnRunning(true);
      }
    } catch (cause) { await reportConnectionError(cause, "Не удалось изменить состояние VPN. Попробуйте ещё раз."); }
    finally { operationLock.current = false; if (mounted.current) setOperation(null); }
  };
  const chooseNode = async (id: string) => {
    if (operationLock.current || loading) return;
    const node = id === AUTO_SERVER_ID ? null : nodes.find(item => item.id === id);
    if (id === AUTO_SERVER_ID) {
      selectNode(id);
      setPickerOpen(false);
      if (vpnRunning) {
        operationLock.current = true;
        setOperation("switch");
        try {
          await disconnect();
          if (mounted.current) setVpnRunning(false);
          const best = await resolveConnectNode(nodes, id);
          if (!best) throw new Error("Нет доступных серверов");
          await connect(best, { isSponsor: me?.is_sponsor === true });
          if (mounted.current) setVpnRunning(true);
        } catch (cause) {
          await reportConnectionError(cause, "Не удалось подключиться в умном режиме.");
        } finally {
          operationLock.current = false;
          if (mounted.current) setOperation(null);
        }
      }
      return;
    }
    if (!node) { setError("Этот сервер больше недоступен. Обновите список."); return; }
    setPickerOpen(false);
    if (selected?.id === id) return;
    selectNode(id);
    void Haptics.selectionAsync().catch(() => {});
    if (!vpnRunning) { setError(null); return; }
    operationLock.current = true;
    setOperation("switch");
    setError(null);
    try {
      await disconnect();
      if (mounted.current) setVpnRunning(false);
      await connect(node, { isSponsor: me?.is_sponsor === true });
      if (mounted.current) setVpnRunning(true);
    } catch (cause) { await reportConnectionError(cause, "Не удалось подключиться к выбранному серверу."); }
    finally { operationLock.current = false; if (mounted.current) setOperation(null); }
  };
  const refresh = async () => {
    if (refreshLock.current || operationLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    setRefreshNote(null);
    const before = updatedAtRef.current;
    try {
      const result = await reloadNodes();
      if (mounted.current) setRefreshNote(result?.length ? "Список загружен. Дата ниже — последнее успешное обновление подписки; при отсутствии сети используется сохранённая копия." : "Не удалось загрузить серверы. Проверьте интернет и повторите.");
      // The context alone advances the timestamp; never stamp a cache fallback as fresh.
      if (mounted.current && updatedAtRef.current !== before) setRefreshNote(null);
    } catch (cause) {
      if (mounted.current) setRefreshNote(errorMessage(cause, "Не удалось обновить серверы. Сохранённый список остаётся доступен."));
    } finally { refreshLock.current = false; if (mounted.current) setRefreshing(false); }
  };
  const timestamp = subscriptionUpdatedAt ? new Date(subscriptionUpdatedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ещё не обновлялась";
  const status = loading ? "Загружаем профиль" : operation === "switch" ? "Меняем сервер" : operation === "connect" ? "Подключаемся" : operation === "disconnect" ? "Отключаемся" : vpnRunning ? "Соединение защищено" : !canConnect ? "Подписка неактивна" : "Готовы к подключению";
  const hint = busy ? "Дождитесь завершения операции" : vpnRunning ? `В сети · ${formatElapsed(seconds)}` : !canConnect ? "Продлите подписку, чтобы включить VPN" : selected ? "Нажмите, чтобы включить VPN" : "Сначала выберите сервер";
  const icon = (name: React.ComponentProps<typeof Ionicons>["name"], color = c.primary, size = 22) => <Ionicons name={name} color={color} size={size} />;

  return (
    <View style={[s.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* One viewport lets long/scaled announcements grow without a 220dp clip. */}
      <ScrollView showsVerticalScrollIndicator={false}>
      <AnnouncementsArea style={{ marginHorizontal: 20, marginTop: 8 }} />
      <Appbar.Header statusBarHeight={0} style={{ backgroundColor: c.background }}>
        <Image source={{ uri: "app_icon" }} style={s.logo} accessibilityIgnoresInvertColors accessibilityLabel="" />
        <View style={{ flex: 1 }}><BrandName style={s.brand} /></View>
        <Appbar.Action icon={() => icon("headset-outline", c.onSurface)} accessibilityLabel="Открыть поддержку" onPress={() => nav.navigate("Support")} />
      </Appbar.Header>
      <View style={[s.content, { paddingBottom: insets.bottom + 28 }]}>
        <View style={s.hero}>
          <View style={[s.statusPill, { backgroundColor: vpnRunning ? c.primaryContainer : c.surfaceVariant }]}>
            {icon(vpnRunning ? "shield-checkmark-outline" : "shield-outline", vpnRunning ? c.onPrimaryContainer : c.onSurfaceVariant, 17)}
            <Text variant="labelLarge" style={{ color: vpnRunning ? c.onPrimaryContainer : c.onSurfaceVariant }}>{busy ? "Соединение" : vpnRunning ? "VPN включён" : "VPN выключен"}</Text>
          </View>
          <View style={s.power}>
            <View style={s.powerScaled}>
              <PowerButton connected={vpnRunning} busy={powerDisabled} onToggle={toggle} />
            </View>
          </View>
          <Text variant="titleLarge" style={s.headline} accessibilityLiveRegion="polite">{status}</Text>
          <Text variant="bodyMedium" style={[s.hint, { color: c.onSurfaceVariant }]}>{hint}</Text>
        </View>

        {!!error && <View style={[s.notice, { backgroundColor: c.errorContainer }]}>
          <Text variant="bodyMedium" style={{ color: c.onErrorContainer }} accessibilityLiveRegion="assertive">{error}</Text>
          <Button textColor={c.onErrorContainer} onPress={() => setError(null)}>Понятно</Button>
        </View>}

        <View style={[s.serverSurface, { backgroundColor: c.secondaryContainer }]}>
          <TouchableRipple onPress={() => setPickerOpen(true)} disabled={busy || loading} accessibilityRole="button" accessibilityLabel={`Выбор сервера. ${info?.name || "Сервер не выбран"}`} accessibilityState={{ disabled: busy || loading }}>
            <View style={s.serverBody}>
              <View style={s.row}>
                <Text variant="labelMedium" style={{ color: c.onSecondaryContainer }}>ВАШ МАРШРУТ</Text>
                {icon("chevron-forward", c.onSecondaryContainer, 20)}
              </View>
              <View style={[s.row, { justifyContent: "flex-start", gap: 12 }]}>
                {!!info?.flag && <Text style={s.flag} accessibilityElementsHidden>{info.flag}</Text>}
                <Text variant="titleMedium" style={[s.grow, { color: c.onSecondaryContainer }]}>{loading ? "Загружаем серверы…" : info?.name || "Выберите сервер"}</Text>
              </View>
              <View style={s.serverMeta}>
                <Text variant="bodySmall" style={{ color: c.onSecondaryContainer }}>{selected ? `${selected.source === "lte" ? "LTE OPEN · " : ""}${transportLabel(selected)}` : nodes.length ? "Доступные локации и LTE OPEN" : "Список пуст — обновите подписку"}</Text>
                {ping?.status === "pending" && <ActivityIndicator size={16} color={c.onSecondaryContainer} accessibilityLabel="Измеряем задержку" />}
                {ping?.status === "done" && <Text variant="labelMedium" style={{ color: ping.error || ping.delay <= 0 ? c.error : pingColor(ping.delay) }}>{ping.error || ping.delay <= 0 ? pingFailLabel(ping.error) : `${ping.delay} мс`}</Text>}
              </View>
            </View>
          </TouchableRipple>
        </View>

        <View style={s.refreshArea}>
          <View style={s.grow}>
            <Text variant="labelMedium" style={{ color: c.onSurfaceVariant }}>Подписка обновлена</Text>
            <Text variant="bodySmall" style={{ color: c.onSurfaceVariant }}>{timestamp}</Text>
          </View>
          <Button mode="text" compact icon={() => icon("refresh", c.primary, 18)} loading={refreshing} disabled={refreshing || busy || loading} onPress={refresh} accessibilityLabel="Обновить подписку и все серверы" contentStyle={s.buttonContent}>Обновить</Button>
        </View>
        {!!refreshNote && <Text variant="bodySmall" style={[s.refreshNote, { color: c.onSurfaceVariant }]} accessibilityLiveRegion="polite">{refreshNote}</Text>}

        <Divider style={{ backgroundColor: c.outlineVariant }} />
        <View style={s.sectionHeading}>
          <Text variant="titleMedium">Трафик сегодня</Text>
          <Button compact onPress={() => nav.navigate("Статистика")} contentStyle={s.buttonContent}>Подробнее</Button>
        </View>
        <View style={s.traffic}>
          {([{ key: "rx", label: "Получено", glyph: "arrow-down-outline" }, { key: "tx", label: "Отправлено", glyph: "arrow-up-outline" }] as const).map(metric => <View key={metric.key} style={[s.metric, { backgroundColor: c.surfaceVariant }]}>
            <View style={s.metricLabel}>{icon(metric.glyph, c.onSurfaceVariant, 18)}<Text variant="labelMedium" style={{ color: c.onSurfaceVariant }}>{metric.label}</Text></View>
            <Text variant="titleLarge" style={s.metricValue}>{today ? formatBytes(today[metric.key]) : "—"}</Text>
          </View>)}
        </View>
        {statsError && <Text variant="bodySmall" style={{ color: c.error }}>Статистика временно недоступна. Повторим чтение автоматически.</Text>}

        <TouchableRipple onPress={() => nav.navigate("Тарифы")} style={s.subscription} accessibilityRole="button" accessibilityLabel="Подписка. Открыть тарифы">
          <View style={[s.row, { justifyContent: "flex-start", gap: 12 }]}>
            {icon("calendar-outline", canConnect ? c.primary : c.error, 24)}
            <View style={s.grow}>
              <Text variant="titleMedium">{loading ? "Загружаем подписку…" : !canConnect ? "Нужно продлить подписку" : days !== null ? `Ещё ${days} ${dayWord(days)}` : "Подписка активна"}</Text>
              <Text variant="bodySmall" style={{ color: c.onSurfaceVariant }}>{expiryValid ? `До ${expiry!.toLocaleDateString("ru-RU")}` : "Дата окончания недоступна"}</Text>
            </View>
            {icon("chevron-forward", c.onSurfaceVariant, 20)}
          </View>
        </TouchableRipple>
        <Divider style={{ backgroundColor: c.outlineVariant }} />
        <TouchableRipple onPress={() => setAppsOpen(true)} disabled={busy} style={s.split} accessibilityRole="button" accessibilityLabel="Раздельное туннелирование: выбрать приложения для VPN" accessibilityState={{ disabled: busy }}>
          <View style={[s.row, { justifyContent: "flex-start", gap: 12 }]}>
            {icon("git-branch-outline", c.primary, 24)}
            <View style={s.grow}><Text variant="titleMedium">Раздельный туннель</Text><Text variant="bodySmall" style={{ color: c.onSurfaceVariant }}>Какие приложения идут через VPN</Text></View>
            {icon("chevron-forward", c.onSurfaceVariant, 20)}
          </View>
        </TouchableRipple>
      </View>
      </ScrollView>
      <ServerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} nodes={nodes} selectedId={selectedNodeId}
 onSelect={id => { void chooseNode(id); }} />
      <ConnectionFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  logo: { width: 34, height: 34, borderRadius: 11, marginLeft: 20, marginRight: 6 },
  brand: { fontWeight: "700", letterSpacing: -0.5 },
  content: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20 },
  hero: { alignItems: "center", paddingTop: 4, paddingBottom: 14 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 18, marginBottom: 6 },
  power: { width: 200, height: 200 },
  powerScaled: { position: "absolute", left: -52, top: -52, width: 304, height: 304, transform: [{ scale: 200 / 304 }] },
  headline: { marginTop: 6, textAlign: "center", fontWeight: "600" },
  hint: { marginTop: 6, textAlign: "center" },
  notice: { borderRadius: 20, padding: 16, marginBottom: 16, alignItems: "flex-start" },
  serverSurface: { borderRadius: 20, overflow: "hidden" },
  serverBody: { padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  grow: { flex: 1 },
  flag: { fontSize: 24 },
  serverMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  refreshArea: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 8 },
  refreshNote: { marginBottom: 14 },
  buttonContent: { minHeight: 48 },
  sectionHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 4 },
  traffic: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: 120, borderRadius: 16, padding: 12, gap: 5 },
  metricLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  metricValue: { fontWeight: "600" },
  subscription: { paddingVertical: 14, borderRadius: 12 },
  split: { paddingVertical: 14, borderRadius: 12 },
});
