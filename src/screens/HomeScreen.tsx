import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "../components/PressableScale";
import { PowerButton } from "../components/PowerButton";
import { ConnectionFilterModal } from "../components/ConnectionFilterModal";
import { BalanceSheet } from "../components/BalanceSheet";
import { AnnouncementsArea } from "../components/AnnouncementsArea";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context";
import { connect, disconnect } from "../vpn/manager";
import * as pingStore from "../vpn/pingStore";
import { useVpnTimerSeconds, formatElapsed } from "../vpn/timer";
import * as appFilterMod from "../vpn/appFilter";
import { computeBypassForNetwork, loadFilterSettings } from "../vpn/connectionFilter";
import { getNetworkType } from "../vpn/native";
import { resolveNodeCountry } from "../vpn/geoIp";
import { transportLabel } from "../utils/transportLabel";
import * as stats from "../stats";
import { colors, splitNameFlag, formatBytes, useTheme, pingColor, pingFailLabel, isLightPalette, countryFromName, countryFromFlag, BRAND_PURPLE } from "../theme";
import { WorldMap, type MapMarker } from "../components/worldMap/WorldMap";
import { buildMapMarkers } from "../components/worldMap/markers";

export default function HomeScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();

  const nav = useNavigation<any>();
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, subscriptionActive, reloadNodes } = useApp();
  const [busy, setBusy] = useState(false);
  // Таймер считается от абсолютной метки подключения (vpn/timer) — не обнуляется
  // при ремаунте экрана и поддерживает дни/недели.
  const seconds = useVpnTimerSeconds(vpnRunning);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [allowedCount, setAllowedCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [activeFilters, setActiveFilters] = useState(0);
  const [bypassSummary, setBypassSummary] = useState("");
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
      // Активные профили фильтра соединения
      try {
        const s = loadFilterSettings();
        setActiveFilters(s.active.length);
        const bypass = computeBypassForNetwork(s, getNetworkType());
        const parts: string[] = [];
        if (bypass.domains.length) parts.push(`${bypass.domains.length} сайтов мимо`);
        if (bypass.packages.length) parts.push(`${bypass.packages.length} приложений мимо`);
        setBypassSummary(parts.join(", "));
      } catch {}
      if (!vpnRunning) return;
      const t = setInterval(loadStats, 15000);
      return () => clearInterval(t);
    }, [vpnRunning, loadStats])
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null,
    [nodes, selectedNodeId]
  );

  // Маркеры стран на карте — общий билдер (src/components/worldMap/markers.ts):
  // страна из ФЛАГА имени сервера, фолбэк по тексту; «Лучший сервер» (⚡)
  // исключён из текстового цикла — его страна резолвится по IP ниже.
  const mapMarkers = useMemo<MapMarker[]>(() => buildMapMarkers(nodes), [nodes]);

  // Страна «Лучшего сервера» (⚡) по IP его адреса: резолвим домен и спрашиваем
  // geo-IP API. Результат кэшируется в ref на время жизни экрана.
  const [bestCountry, setBestCountry] = useState<{ name: string; flag: string } | null>(null);
  useEffect(() => {
    const best = nodes.find((n) => /лучш/i.test(n.name) && n.source !== "lte");
    if (!best) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await resolveNodeCountry(best.address);
        if (!cancelled && c) setBestCountry(c);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [nodes]);

  // Активная страна = страна выбранного узла: флаг из имени → текст имени →
  // (для «Лучшего сервера») страна по IP.
  const activeMarker = useMemo<MapMarker | null>(() => {
    if (!selectedNode) return null;
    const info = splitNameFlag(selectedNode.name);
    if (/лучш/i.test(info.name)) {
      // «Лучший сервер» — агрегатор; показываем страну его фактического адреса
      if (!bestCountry) return null;
      return mapMarkers.find((m) => m.country === bestCountry.name) || null;
    }
    const c = countryFromFlag(info.flag) || countryFromName(info.name);
    if (!c) return null;
    return mapMarkers.find((m) => m.country === c.name) || null;
  }, [selectedNode, mapMarkers, bestCountry]);

  // Пульсация, вращение колец и частицы — внутри общего <PowerButton />

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
        const target = selectedNode;
        if (!target) throw new Error("Нет доступных серверов");
        await connect(target, { isSponsor: me?.is_sponsor === true });
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
    // Плавающий таб-бар не занимает место в потоке — возвращаем контенту
    // нижний отступ под меню (как у остальных вкладок через Screen),
    // чтобы кнопка питания и нижние блоки не уходили под круги меню.
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 116 }]}>
      {/* Объявления с сервера — над шапкой с балансом */}
      <AnnouncementsArea style={{ marginHorizontal: 20, marginBottom: 10 }} />

      <View style={styles.header}>
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
        {/* Дни подписки + баланс — без сплошного овала: два лёгких мини-блока */}
        <PressableScale style={styles.hdrStats} onPress={() => setBalanceOpen(true)} accessibilityRole="button" accessibilityLabel={`Подписка: ${daysLeft} ${pluralDays(daysLeft)}, баланс ${((me?.balance || 0) / 100).toFixed(0)} рублей. Подробнее`}>
          <View style={styles.miniStat}>
            <View style={[styles.miniIcon, { backgroundColor: "rgba(52,211,153,0.12)" }]}>
              <Ionicons name="hourglass-outline" size={12} color={colors.green} />
            </View>
            <View>
              <Text style={styles.miniValue}>{daysLeft}</Text>
              <Text style={styles.miniLabel}>{pluralDays(daysLeft)}</Text>
            </View>
          </View>
          <View style={styles.miniStat}>
            <View style={[styles.miniIcon, { backgroundColor: colors.accentSoft }]}>
              <Text style={styles.miniRub}>₽</Text>
            </View>
            <View>
              <Text style={styles.miniValue}>{((me?.balance || 0) / 100).toFixed(0)}</Text>
              <Text style={styles.miniLabel}>баланс</Text>
            </View>
          </View>
        </PressableScale>
      </View>

      {/* Живая карта мира: точки-страны, наезд камеры при подключении,
          дуга перелёта и прорисовка достопримечательности выбранной страны */}
      <WorldMap
        markers={mapMarkers}
        active={activeMarker}
        connected={connected}
        light={isLightPalette()}
        style={{ marginBottom: 6 }}
      />

      <View style={styles.powerArea}>
        <PowerButton connected={connected} busy={busy} onToggle={toggle} />
        {!!connected && (
          <Text style={styles.timer} numberOfLines={1}>
            {formatElapsed(seconds)}
          </Text>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.serverCard}>
        <PressableScale
          style={styles.serverRow}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            selectedNode && selectedInfo
              ? `Выбранный сервер: ${selectedInfo.name}. ${transportLabel(selectedNode)}. Нажмите, чтобы изменить`
              : "Сервер не выбран. Нажмите, чтобы выбрать локацию"
          }
        >
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
          <PressableScale
            style={styles.infoBtn}
            onPress={refreshNodes}
            disabled={refreshingNodes}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Обновить список серверов"
          >
            {refreshingNodes ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh" size={16} color={colors.textDim} />
            )}
          </PressableScale>
        </PressableScale>

        <View style={styles.cardDivider} />

        <PressableScale
          style={styles.serverRow}
          onPress={() => setAppsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Фильтр соединения: профили обхода и фильтр приложений"
        >
          <View style={styles.serverIcon}>
            <Ionicons name="shield-half-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.serverName}>Фильтр соединения</Text>
            <Text style={styles.serverSub} numberOfLines={1}>
              {activeFilters > 0
                ? `Активные профили: ${activeFilters}${bypassSummary ? ` · ${bypassSummary}` : ""}`
                : allowedCount > 0
                  ? `Приложения: через VPN ${allowedCount} (белый список)`
                  : blockedCount > 0
                    ? `Приложения: мимо VPN ${blockedCount}`
                    : "Всё через VPN"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </PressableScale>
      </View>

      <View style={styles.statsRow}>
        <PressableScale
          style={styles.statCard}
          onPress={() => nav.navigate("Статистика")}
          accessibilityRole="button"
          accessibilityLabel={`Отправлено сегодня: ${formatBytes(todayStat.tx)}. Открыть статистику`}
        >
          <View style={[styles.statIcon, { backgroundColor: "rgba(52,211,153,0.12)" }]}>
            <Ionicons name="arrow-up" size={15} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Отправлено</Text>
            <Text style={styles.statValue}>{formatBytes(todayStat.tx)}</Text>
          </View>
        </PressableScale>
        <PressableScale
          style={styles.statCard}
          onPress={() => nav.navigate("Статистика")}
          accessibilityRole="button"
          accessibilityLabel={`Получено сегодня: ${formatBytes(todayStat.rx)}. Открыть статистику`}
        >
          <View style={[styles.statIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="arrow-down" size={15} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Получено</Text>
            <Text style={styles.statValue}>{formatBytes(todayStat.rx)}</Text>
          </View>
        </PressableScale>
      </View>

      {appsOpen && <ConnectionFilterModal
        visible={appsOpen}
        onClose={() => {
          setAppsOpen(false);
          // обновляем сводку на карточке после закрытия
          try {
            const s = loadFilterSettings();
            setActiveFilters(s.active.length);
            const bypass = computeBypassForNetwork(s, getNetworkType());
            const parts: string[] = [];
            if (bypass.domains.length) parts.push(`${bypass.domains.length} сайтов мимо`);
            if (bypass.packages.length) parts.push(`${bypass.packages.length} приложений мимо`);
            setBypassSummary(parts.join(", "));
          } catch {}
          appFilterMod.loadFilter().then((f) => {
            setAllowedCount(f.allowed.length);
            setBlockedCount(f.blocked.length);
          }).catch(() => {});
        }}
      />}

      {balanceOpen && <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={(me?.balance || 0) / 100}
        daysLeft={daysLeft}
      />}

      {pickerOpen && <ServerPicker
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
              setBusy(true);
              setError(null);
              try {
                await disconnect();
                const node = nodes.find((n) => n.id === id) || null;
                if (!node) {
                  setVpnRunning(false);
                  return;
                }
                await connect(node, { isSponsor: me?.is_sponsor === true });
                setVpnRunning(true);
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
      />}
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
          bounces={false}
          overScrollMode="never"
            data={filtered}
            extraData={pings}
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
                  </View>
                  {ping?.status === "pending" && (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                  {ping?.status === "done" &&
                    (ping.error ? (
                      // Не удалось проверить — красным текстом там же, где значение пинга
                      <Text style={{ color: colors.red, fontWeight: "700", fontSize: 11 }}>
                        {pingFailLabel(ping.error)}
                      </Text>
                    ) : (
                      <Text
                        style={{
                          color: pingColor(ping.delay),
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {ping.delay} мс
                      </Text>
                    ))}
                  {item.protocol === "hysteria2" && !ping && (
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

function pluralDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
  return "дней";
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
  clientName: { color: BRAND_PURPLE, fontSize: 15, fontWeight: "800" },
  hdrStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  miniStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  miniRub: { color: colors.accent, fontSize: 13, fontWeight: "900" },
  miniValue: { color: colors.text, fontSize: 12.5, fontWeight: "800", lineHeight: 14 },
  miniLabel: { color: colors.textDim, fontSize: 9, marginTop: 1 },
  powerArea: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
