import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../../context";
import { connect, disconnect, pickBestNode } from "../../vpn/manager";
import * as pingStore from "../../vpn/pingStore";
import { AUTO_SERVER_ID } from "../../vpn/autoSelect";
import type { VpnNode } from "../../vpn/parse";
import { getSetting, setSetting, getJsonList, setJsonList } from "../../settings";
import { colors, splitNameFlag, formatBytes, useTheme, isLightPalette, powerButtonColors, pingColor } from "../../theme";
import { transportLabel } from "../../utils/transportLabel";
import { ConnectionFilterModal } from "../../components/ConnectionFilterModal";
import { BalanceSheet } from "../../components/BalanceSheet";
import { AnnouncementsArea } from "../../components/AnnouncementsArea";
import { showToast } from "../../components/Toast";
import * as stats from "../../stats";
import {
  BASE_URL,
  BOT_USERNAME,
  applyPromo,
  telegramLink,
  updateDisplayName,
  updateLogin,
  uploadAvatar,
} from "../../api";

const PURPLE = "#7C3AED";
const PURPLE_BADGE = "#6C63FF";
const TITLE_PURPLE = "#8B5CF6";

function formatTimer(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Неоморфная карточка: фон = фону экрана, пара мягких теней + светлая обводка */
function neu(radius: number, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.bg,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: "rgba(190,183,216,0.72)",
    elevation: 5,
    shadowColor: "#9090B8",
    shadowOpacity: 0.3,
    shadowRadius: 9,
    shadowOffset: { width: 4, height: 4 },
    ...extra,
  };
}

/** Главный экран темы Happ — один экран без нижней навигации:
 *  неоморфная кнопка подключения, панель аккаунта и серверов,
 *  избранное, LTE OPEN и шторка профиля «Стандарт». */
export default function HappScreen() {
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
  const [favorites, setFavorites] = useState<string[]>(() => getJsonList("happ_favorite_servers"));
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [appsOpen, setAppsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });

  const mainNodes = useMemo(() => nodes.filter((n) => n.source !== "lte"), [nodes]);
  const lteNodes = useMemo(
    () => (lteEnabled ? nodes.filter((n) => n.source === "lte") : []),
    [nodes, lteEnabled]
  );

  const autoMode = selectedNodeId === AUTO_SERVER_ID;
  const selectedNode = useMemo(
    () => (autoMode ? null : nodes.find((n) => n.id === selectedNodeId) || mainNodes[0] || null),
    [nodes, selectedNodeId, mainNodes, autoMode]
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

  // Пульс кольца кнопки подключения (только пока подключено)
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!vpnRunning) {
      pulse.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [vpnRunning, pulse]);

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

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort();
      setJsonList("happ_favorite_servers", next);
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const syncAll = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      await Promise.all([reloadNodes(), refreshMe()]);
      await pingStore.pingAll(nodes);
      showToast("Профиль обновлён");
    } catch {
      showToast("Не удалось обновить профиль");
    } finally {
      setSyncBusy(false);
    }
  };

  const testDelays = async () => {
    await pingStore.pingAll(nodes);
    showToast("Проверка задержки завершена");
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
        .then(() => {
          showToast("LTE OPEN активирован");
          pingStore.pingAll(nodes).catch(() => {});
        })
        .catch(() => showToast("Ошибка активации LTE OPEN"))
        .finally(() => setLteBusy(false));
    }
  };

  const sortWithFavorites = (list: VpnNode[]) => {
    const fav = list.filter((n) => favorites.includes(n.id));
    const rest = list.filter((n) => !favorites.includes(n.id));
    return [...fav, ...rest];
  };

  const avatarUri = me?.avatar_url ? `${BASE_URL}${me.avatar_url}` : null;
  const displayName = me?.display_name || me?.login || "Пользователь";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerSide}>
          <HeaderIcon icon="settings-outline" size={24} onPress={() => nav.navigate("Настройки")} />
          <HeaderIcon icon="shield-half-outline" size={21} onPress={() => setAppsOpen(true)} />
        </View>
        <Text style={styles.appTitle}>GhostCloud</Text>
        <View style={styles.headerSide}>
          <HeaderIcon icon="headset-outline" size={22} onPress={() => nav.navigate("Support")} />
          <HeaderIcon icon="add" size={28} onPress={() => nav.navigate("Тарифы")} />
        </View>
      </View>

      <ScrollView
          bounces={false}
          overScrollMode="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 10, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Объявления с сервера — в самом верху */}
        <AnnouncementsArea style={{ marginBottom: 6 }} />

        {/* Кнопка подключения — неоморфные круги */}
        <View style={styles.powerArea}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulseRing,
              {
                borderColor: vpnRunning ? "rgba(5,150,105,0.25)" : "rgba(108,99,255,0.12)",
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) }],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.4] }),
              },
            ]}
          />
          <View
            style={[
              styles.circleMid,
              {
                shadowColor: vpnRunning ? "#059669" : "#6C63FF",
                shadowOpacity: vpnRunning ? 0.22 : 0.1,
                elevation: vpnRunning ? 12 : 8,
              },
            ]}
          >
            <View style={[styles.circleInner, { backgroundColor: vpnRunning ? powerButtonColors().on : powerButtonColors().off }]}>
              <Pressable
                onPress={toggle}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={vpnRunning ? "Выключить VPN" : "Включить VPN"}
                accessibilityState={{ busy }}
                style={{ alignItems: "center", justifyContent: "center" }}
              >
                {busy ? (
                  <ActivityIndicator size="large" color={vpnRunning ? "#fff" : colors.accent} />
                ) : vpnRunning ? (
                  <>
                    <Ionicons name="power" size={34} color="#fff" />
                    <Text style={styles.powerLabel}>Подключено</Text>
                    <Text style={styles.powerTimer}>{formatTimer(seconds)}</Text>
                  </>
                ) : (
                  <Ionicons name="power" size={54} color={isLightPalette() ? colors.accent : "rgba(255,255,255,0.5)"} />
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* LTE OPEN */}
        <View
          style={[
            styles.lteRow,
            lteEnabled
              ? { backgroundColor: "rgba(124,58,237,0.08)", borderColor: "rgba(124,58,237,0.35)" }
              : { backgroundColor: colors.bgSoft, borderColor: colors.border },
          ]}
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
              <Ionicons
                name="radio-button-off"
                size={17}
                color={lteEnabled ? PURPLE : colors.textDim}
              />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.lteTitle}>LTE OPEN</Text>
              <View style={styles.lteBetaBadge}>
                <Text style={styles.lteBetaText}>beta</Text>
              </View>
            </View>
            <Text style={styles.lteSub}>
              {lteBusy
                ? "Загружаем профили..."
                : lteEnabled
                  ? `${lteNodes.length} серверов доступно`
                  : "Нажмите для включения"}
            </Text>
          </View>
          {lteEnabled && (
            <Pressable
              style={styles.lteRefreshBtn}
              onPress={() => toggleLte(true)}
              hitSlop={6}
            >
              {lteBusy ? (
                <ActivityIndicator size="small" color={PURPLE} />
              ) : (
                <Ionicons name="refresh" size={17} color={PURPLE} />
              )}
            </Pressable>
          )}
          <Switch
            value={lteEnabled}
            onValueChange={toggleLte}
            trackColor={{ false: colors.border, true: "rgba(124,58,237,0.45)" }}
            thumbColor={lteEnabled ? PURPLE : "#fff"}
          />
        </View>

        {/* Панель аккаунта и серверов */}
        <View style={neu(14, { marginTop: 12 })}>
          <View style={styles.panelHeader}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarLetter}>{(displayName[0] || "?").toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.panelName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.panelSub}>
                Дней: {daysLeft} | Устр.: {me?.device_count ?? 0}/{me?.device_limit ?? 6}
              </Text>
            </View>
            <HeaderIcon
              icon={syncBusy ? "hourglass-outline" : "refresh"}
              size={20}
              onPress={syncAll}
            />
            <HeaderIcon icon="speedometer-outline" size={20} onPress={testDelays} />
            <HeaderIcon icon="pencil" size={19} onPress={() => setProfileOpen(true)} />
          </View>

          <Pressable style={styles.trafficStrip} onPress={() => nav.navigate("Статистика")}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.trafficText}>
              Сегодня: {formatBytes(todayStat.rx + todayStat.tx)}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.trafficDays}>Осталось: {daysLeft} дн.</Text>
          </Pressable>

          <View style={styles.divider} />

          {mainNodes.length === 0 ? (
            <Text style={styles.emptyText}>Профиль не найден</Text>
          ) : (
            <>
              {/* Автовыбор — лучший обычный сервер по пингу (только обычные серверы) */}
              <View style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
                <Pressable
                  onPress={chooseAuto}
                  style={[
                    styles.tile,
                    autoMode && {
                      backgroundColor: "#D9D2F5",
                      borderColor: "rgba(139,92,246,0.42)",
                      borderWidth: 1.35,
                    },
                  ]}
                >
                  <View style={{ width: 29, alignItems: "center" }}>
                    <Text style={{ fontSize: 18 }}>✨</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text
                      style={[styles.tileName, autoMode && { color: "#5B35C8" }]}
                      numberOfLines={1}
                    >
                      Автовыбор
                    </Text>
                    <Text style={styles.tileSub} numberOfLines={1}>
                      Лучший сервер по пингу · авто-переключение при обрыве
                    </Text>
                  </View>
                  {autoMode && (
                    <Text style={{ color: "#5B35C8", fontSize: 10, fontWeight: "700", marginRight: 6 }}>
                      активен
                    </Text>
                  )}
                </Pressable>
              </View>
              {sortWithFavorites(mainNodes).map((n, i) => (
                <HappServerTile
                  key={n.id}
                  node={n}
                  ping={pings[n.id]}
                  selected={n.id === selectedNode?.id}
                  favorite={favorites.includes(n.id)}
                  isLast={i === sortWithFavorites(mainNodes).length - 1 && lteNodes.length === 0}
                  onSelect={() => chooseNode(n)}
                  onToggleFavorite={() => toggleFavorite(n.id)}
                />
              ))}
            </>
          )}

          {lteNodes.length > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.lteSectionHeader}>
              <View style={[styles.lteBadge, { backgroundColor: "rgba(108,99,255,0.15)" }]}>
                <Text style={[styles.lteBadgeText, { color: PURPLE_BADGE }]}>LTE OPEN</Text>
              </View>
                <View style={[styles.lteBadge, { backgroundColor: "rgba(144,144,170,0.18)" }]}>
                  <Text style={[styles.lteBadgeText, { color: colors.textDim }]}>beta</Text>
                </View>
              </View>
              {lteNodes.map((n) => (
                <HappServerTile
                  key={n.id}
                  node={n}
                  ping={pings[n.id]}
                  selected={n.id === selectedNode?.id}
                  favorite={favorites.includes(n.id)}
                  onSelect={() => chooseNode(n)}
                  onToggleFavorite={() => toggleFavorite(n.id)}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <ConnectionFilterModal visible={appsOpen} onClose={() => setAppsOpen(false)} />

      <BalanceSheet
        visible={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        balance={(me?.balance || 0) / 100}
        daysLeft={daysLeft}
      />

      {/* Шторка профиля «Стандарт» */}
      <Modal visible={profileOpen} transparent animationType="slide" onRequestClose={() => setProfileOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setProfileOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Стандарт</Text>

            <View style={styles.heroCard}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarLetter}>{(displayName[0] || "?").toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.heroName} numberOfLines={1}>
                  {displayName}
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => setEditOpen(true)} hitSlop={8} style={{ padding: 6 }}>
                  <Ionicons name="pencil" size={17} color={colors.textDim} />
                </Pressable>
              </View>
              <HeroRow label="Тариф" value={me?.plan || "—"} />
              <HeroRow label="Осталось дней" value={String(daysLeft)} />
              <HeroRow
                label="Баланс"
                value={`${((me?.balance || 0) / 100).toFixed(0)} ₽`}
                icon="wallet-outline"
                onPress={() => {
                  setProfileOpen(false);
                  setBalanceOpen(true);
                }}
              />
              <HeroRow
                label="Устройства"
                value={`${me?.device_count ?? 0}/${me?.device_limit ?? 6}`}
                onPress={() => {
                  setProfileOpen(false);
                  nav.navigate("Devices");
                }}
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <ActionChip
                  icon="refresh"
                  label="Продлить"
                  onPress={() => {
                    setProfileOpen(false);
                    nav.navigate("Тарифы");
                  }}
                />
                <ActionChip icon="key-outline" label="Промокод" onPress={() => setPromoOpen(true)} />
              </View>
            </View>

            <View style={styles.menuCard}>
              <MenuRow
                icon="people-outline"
                iconColor={TITLE_PURPLE}
                title="Реферальная программа"
                sub="Приглашайте друзей и получайте скидку"
                onPress={() => {
                  setProfileOpen(false);
                  nav.navigate("Referral");
                }}
              />
              <MenuRow
                icon="trophy-outline"
                iconColor="#FFA726"
                title="Топ рефералов"
                sub="Рейтинг лучших приглашающих"
                onPress={() => {
                  setProfileOpen(false);
                  nav.navigate("Referral");
                }}
              />
              <MenuRow
                icon="paper-plane-outline"
                iconColor="#29B6F6"
                title="Привязать Telegram"
                sub={me?.telegram_linked ? "Telegram подключён" : "Быстрый вход и уведомления"}
                trailing={
                  me?.telegram_linked ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                  ) : undefined
                }
                onPress={async () => {
                  if (me?.telegram_linked) return;
                  try {
                    const r = await telegramLink();
                    if (r?.success) {
                      await WebBrowser.openBrowserAsync(
                        `https://t.me/${r.bot_username || BOT_USERNAME}?start=link_${r.code}`
                      );
                    }
                  } catch {}
                  setTimeout(() => refreshMe().catch(() => {}), 8000);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Шторка редактирования профиля */}
      <EditProfileSheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
      />

      {/* Промокод */}
      <PromoDialog visible={promoOpen} onClose={() => setPromoOpen(false)} />
    </View>
  );
}

function HeaderIcon({
  icon,
  size = 22,
  onPress,
  color,
}: {
  icon: any;
  size?: number;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={makeStyles().headerIcon}>
      <Ionicons name={icon} size={size} color={color || colors.text} />
    </Pressable>
  );
}

function HappServerTile({
  node,
  ping,
  selected,
  favorite,
  isLast,
  onSelect,
  onToggleFavorite,
}: {
  node: VpnNode;
  ping: pingStore.PingState | undefined;
  selected: boolean;
  favorite: boolean;
  isLast?: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const styles = makeStyles();
  const info = splitNameFlag(node.name);
  const delay = ping?.status === "done" && ping.delay > 0 ? ping.delay : null;

  return (
    <View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
        <Pressable
          onPress={onSelect}
          style={[
            styles.tile,
            selected && {
              backgroundColor: "#D9D2F5",
              borderColor: "rgba(139,92,246,0.42)",
              borderWidth: 1.35,
            },
          ]}
        >
          <View style={{ width: 29, alignItems: "center" }}>
            <Text style={{ fontSize: 20 }}>{info.flag}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text
              style={[styles.tileName, selected && { color: "#5B35C8" }]}
              numberOfLines={1}
            >
              {info.name}
            </Text>
            <Text style={styles.tileSub} numberOfLines={1}>
              {transportLabel(node).replace(/ · /g, " / ")}
            </Text>
          </View>
          {ping?.status === "pending" && (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 6 }} />
          )}
          {delay != null && (
            <Text style={{ color: pingColor(delay), fontSize: 10, fontWeight: "700", marginRight: 2 }}>
              {delay} мс
            </Text>
          )}
          <Pressable onPress={onToggleFavorite} hitSlop={8} style={{ padding: 3, marginLeft: 4 }}>
            <Ionicons
              name={favorite ? "heart" : "heart-outline"}
              size={19}
              color={favorite ? "#E53935" : colors.textFaint}
            />
          </Pressable>
        </Pressable>
      </View>
      {!isLast && <View style={[styles.tileDivider, { marginLeft: 58, marginRight: 12 }]} />}
    </View>
  );
}

function HeroRow({
  label,
  value,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  icon?: any;
  onPress?: () => void;
}) {
  const styles = makeStyles();
  const inner = (
    <>
      <Text style={styles.heroRowLabel}>{label}</Text>
      {!!icon && <Ionicons name={icon} size={15} color="rgba(108,99,255,0.74)" style={{ marginLeft: 5 }} />}
      <View style={{ flex: 1 }} />
      <Text style={styles.heroRowValue}>{value}</Text>
      {!!onPress && (
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={{ marginLeft: 4 }} />
      )}
    </>
  );
  if (onPress) {
    return <Pressable style={styles.heroRow} onPress={onPress}>{inner}</Pressable>;
  }
  return <View style={styles.heroRow}>{inner}</View>;
}

function ActionChip({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  const styles = makeStyles();
  return (
    <Pressable style={styles.chip} onPress={onPress}>
      <Ionicons name={icon} size={21} color={colors.accent} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function MenuRow({
  icon,
  iconColor,
  title,
  sub,
  trailing,
  onPress,
}: {
  icon: any;
  iconColor: string;
  title: string;
  sub: string;
  trailing?: React.ReactNode;
  onPress: () => void;
}) {
  const styles = makeStyles();
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={[styles.menuIconBox, { backgroundColor: `${iconColor}24` }]}>
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub}>{sub}</Text>
      </View>
      {trailing || <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />}
    </Pressable>
  );
}

function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = makeStyles();
  const { me, refreshMe } = useApp();
  const [nick, setNick] = useState("");
  const [loginStr, setLoginStr] = useState("");
  const [saving, setSaving] = useState(false);
  const avatarUri = me?.avatar_url ? `${BASE_URL}${me.avatar_url}` : null;

  useEffect(() => {
    if (visible) {
      setNick(me?.display_name || "");
      setLoginStr(me?.login || "");
    }
  }, [visible, me]);

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast("Разрешите доступ к фото в настройках");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setSaving(true);
      const r = await uploadAvatar(res.assets[0].uri);
      if (!r?.success) throw new Error(r?.error || "Ошибка загрузки");
      await refreshMe();
      showToast("Аватар обновлён");
    } catch (e: any) {
      showToast(e?.message || "Не удалось загрузить аватар");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const newNick = nick.trim();
      const newLogin = loginStr.trim();
      if (newNick && newNick !== (me?.display_name || "")) {
        const r = await updateDisplayName(newNick);
        if (!r?.success) throw new Error(r?.error || "Ошибка сохранения ника");
      }
      if (newLogin && newLogin !== (me?.login || "")) {
        const r = await updateLogin(newLogin);
        if (!r?.success) throw new Error(r?.error || "Ошибка сохранения логина");
      }
      await refreshMe();
      onClose();
      showToast("Профиль обновлён");
    } catch (e: any) {
      showToast(e?.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { fontSize: 18, textAlign: "center" }]}>
            Редактировать профиль
          </Text>
          <View style={{ alignItems: "center", marginVertical: 14 }}>
            <Pressable onPress={pickAvatar} disabled={saving}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.editAvatar} />
              ) : (
                <View style={[styles.editAvatar, styles.avatarPlaceholder]}>
                  <Text style={{ fontSize: 30, fontWeight: "800", color: colors.accent }}>
                    {((me?.display_name || me?.login || "?")[0] || "?").toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={14} color="#fff" />
                )}
              </View>
            </Pressable>
          </View>
          <Text style={styles.fieldLabel}>Отображаемое имя</Text>
          <TextInput
            style={styles.field}
            value={nick}
            onChangeText={setNick}
            maxLength={50}
            placeholder="Имя"
            placeholderTextColor={colors.textFaint}
          />
          <Text style={styles.fieldLabel}>Логин</Text>
          <TextInput
            style={styles.field}
            value={loginStr}
            onChangeText={setLoginStr}
            maxLength={32}
            autoCapitalize="none"
            placeholder="Логин"
            placeholderTextColor={colors.textFaint}
          />
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Сохранить</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PromoDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = makeStyles();
  const { refreshMe } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    try {
      const r = await applyPromo(c);
      if (!r?.success) throw new Error(r?.error || "Не удалось активировать промокод");
      setCode("");
      await refreshMe();
      onClose();
      showToast(r?.message || "Промокод активирован");
    } catch (e: any) {
      showToast(e?.message || "Не удалось активировать промокод");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dialogBackdrop} onPress={onClose}>
        <Pressable style={styles.dialogCard} onPress={() => {}}>
          <Text style={[styles.sheetTitle, { fontSize: 17 }]}>Промокод</Text>
          <TextInput
            style={styles.field}
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            placeholder="Введите промокод"
            placeholderTextColor={colors.textFaint}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.bgSoft }]} onPress={onClose}>
                <Text style={{ color: colors.textDim, fontWeight: "700" }}>Отмена</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Pressable
                style={[styles.saveBtn, busy && { opacity: 0.6 }]}
                onPress={apply}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Активировать</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = () => {
  const light = isLightPalette();
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  headerSide: { flexDirection: "row", alignItems: "center", width: 104 },
  headerIcon: { padding: 7, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  appTitle: {
    color: TITLE_PURPLE,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  powerArea: { height: 250, alignItems: "center", justifyContent: "center" },
  pulseRing: {
    position: "absolute",
    width: 214,
    height: 214,
    borderRadius: 107,
    borderWidth: 1,
  },
  circleMid: {
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: light ? "rgba(190,183,216,0.6)" : "rgba(190,183,216,0.28)",
    alignItems: "center",
    justifyContent: "center",
    shadowRadius: 18,
    shadowOffset: { width: 6, height: 6 },
  },
  circleInner: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: light ? "rgba(190,183,216,0.45)" : "rgba(190,183,216,0.22)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  powerLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "500", marginTop: 8 },
  powerTimer: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600", marginTop: 6 },
  lteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 2,
  },
  lteIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  lteTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  lteBetaBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "rgba(124,58,237,0.15)",
  },
  lteBetaText: { color: PURPLE, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  lteSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  lteRefreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(124,58,237,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingBottom: 8,
  },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  avatarPlaceholder: {
    backgroundColor: "rgba(108,99,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  panelName: { color: colors.text, fontSize: 17, fontWeight: "700" },
  panelSub: { color: colors.textFaint, fontSize: 10, marginTop: 1 },
  trafficStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  trafficText: { color: colors.textDim, fontSize: 11, fontWeight: "600" },
  trafficDays: { color: colors.textDim, fontSize: 11, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "rgba(144,144,170,0.3)", marginHorizontal: 4 },
  tileDivider: { height: 1, backgroundColor: "rgba(144,144,170,0.28)" },
  emptyText: { color: colors.textDim, textAlign: "center", paddingVertical: 18 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.cardLight,
    borderWidth: 0.85,
    borderColor: "rgba(144,144,170,0.3)",
  },
  tileName: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
  tileSub: { color: colors.textFaint, fontSize: 9, fontWeight: "600", letterSpacing: 0.15, marginTop: 1 },
  lteSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  lteBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  lteBadgeText: { fontSize: 11, fontWeight: "700" },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 30,
    maxHeight: "84%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(144,144,170,0.35)",
    marginBottom: 12,
  },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 16 },
  heroCard: {
    backgroundColor: light ? "#E8DAFF" : "#2B2B4A",
    borderRadius: 22,
    borderWidth: 1.25,
    borderColor: "rgba(108,99,255,0.5)",
    padding: 18,
    marginBottom: 12,
  },
  heroName: { color: "#FFA000", fontSize: 18, fontWeight: "800", marginLeft: 8, flex: 1 },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  heroRowLabel: { color: colors.textDim, fontSize: 14, fontWeight: "600" },
  heroRowValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
  chip: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    backgroundColor: "rgba(108,99,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  chipText: { color: colors.accent, fontSize: 11, fontWeight: "800" },
  menuCard: {
    backgroundColor: light ? "#E8DAFF" : "#2B2B4A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(108,99,255,0.16)",
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  menuSub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  editAvatar: { width: 84, height: 84, borderRadius: 42 },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: { color: colors.textDim, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  field: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
    marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: colors.accentDeep,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialogCard: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  });
};
