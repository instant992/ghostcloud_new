import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../context";
import { connect, disconnect } from "../vpn/manager";
import { getTrafficSnapshot } from "../vpn/native";
import { useVpnTimerSeconds, formatElapsed } from "../vpn/timer";
import { colors, countryFromFlag, countryFromName, formatBytes, isLightPalette, splitNameFlag, useTheme } from "../theme";
import { transportLabel } from "../utils/transportLabel";
import { resolveNodeCountry } from "../vpn/geoIp";
import { buildMapMarkers } from "../components/worldMap/markers";
import { WorldMap, type MapMarker } from "../components/worldMap/WorldMap";
import { TvFocusable } from "./TvFocusable";
import { TvServersTab } from "./TvServersTab";
import { TvSettingsTab } from "./TvSettingsTab";
import * as Haptics from "expo-haptics";

type TabKey = "home" | "servers" | "settings";

const TABS: Array<{ key: TabKey; icon: string; iconActive: string; label: string }> = [
  { key: "home", icon: "home-outline", iconActive: "home", label: "Главная" },
  { key: "servers", icon: "server-outline", iconActive: "server", label: "Серверы" },
  { key: "settings", icon: "settings-outline", iconActive: "settings", label: "Настройки" },
];

/** Домашний экран Android TV: боковое меню-рельс + крупная приборная панель
 *  (карта мира, кнопка питания, сервер/скорость/подписка) в стиле основной темы. */
export function TvHomeScreen() {
  useTheme();
  const [tab, setTab] = useState<TabKey>("home");

  return (
    <View style={s.screen}>
      {/* Боковой рельс */}
      <View style={s.rail}>
        <View style={s.railBrand}>
          <Image source={{ uri: "app_icon" }} style={s.railLogo} resizeMode="cover" />
          <Text style={s.railName}>GhostCloud</Text>
        </View>
        <View style={s.railNav}>
          {TABS.map((t, i) => (
            <TvNavItem key={t.key} item={t} active={tab === t.key} autoFocus={i === 0} onPress={() => setTab(t.key)} />
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <RailFooter />
      </View>
      <View style={s.railDivider} />

      {/* Контент вкладки */}
      <View style={s.content}>
        {tab === "home" ? <TvDashboardTab onOpenServers={() => setTab("servers")} /> : null}
        {tab === "servers" ? <TvServersTab /> : null}
        {tab === "settings" ? <TvSettingsTab /> : null}
      </View>
    </View>
  );
}

function TvNavItem({
  item,
  active,
  autoFocus,
  onPress,
}: {
  item: { icon: string; iconActive: string; label: string };
  active: boolean;
  autoFocus?: boolean;
  onPress: () => void;
}) {
  return (
    <TvFocusable
      autoFocus={autoFocus}
      onPress={onPress}
      style={s.navItem}
      borderRadius={16}
      scale={1.03}
      accessibilityLabel={item.label}
    >
      <View style={[s.navInner, active && s.navInnerActive]}>
        <Ionicons name={(active ? item.iconActive : item.icon) as any} size={24} color={active ? "#fff" : colors.textDim} />
        <Text style={[s.navLabel, active && s.navLabelActive]} numberOfLines={1}>
          {item.label}
        </Text>
        {active && <View style={s.navPip} />}
      </View>
    </TvFocusable>
  );
}

/** Статус подключения и аккаунта внизу рельса — всегда на виду. */
function RailFooter() {
  const { vpnRunning, me } = useApp();
  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me]);
  return (
    <View style={s.railFooter}>
      <View style={s.railStatusRow}>
        <View style={[s.statusDot, { backgroundColor: vpnRunning ? colors.green : colors.textFaint }]} />
        <Text style={s.railStatusText}>{vpnRunning ? "VPN активен" : "VPN выключен"}</Text>
      </View>
      {!!me?.login && (
        <Text style={s.railLogin} numberOfLines={1}>
          {me.login}
        </Text>
      )}
      <Text style={[s.railDays, { color: daysLeft <= 0 ? colors.red : daysLeft <= 3 ? colors.orange : colors.textDim }]} numberOfLines={1}>
        {daysLeft > 0 ? `Подписка: ${daysLeft} ${pluralDays(daysLeft)}` : "Подписка истекла"}
      </Text>
    </View>
  );
}

/** Главная вкладка: карта мира + кнопка питания + карточки статуса. */
function TvDashboardTab({ onOpenServers }: { onOpenServers: () => void }) {
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, subscriptionActive } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seconds = useVpnTimerSeconds(vpnRunning);
  const [bestCountry, setBestCountry] = useState<{ name: string; flag: string } | null>(null);
  const [speed, setSpeed] = useState({ rx: 0, tx: 0 });

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null,
    [nodes, selectedNodeId]
  );
  const mapMarkers = useMemo<MapMarker[]>(() => buildMapMarkers(nodes), [nodes]);

  // Страна «Лучшего сервера» (⚡) — по IP его адреса
  useEffect(() => {
    const best = nodes.find((n) => /лучш/i.test(n.name) && n.source !== "lte");
    if (!best) return;
    let cancelled = false;
    resolveNodeCountry(best.address)
      .then((c) => {
        if (!cancelled && c) setBestCountry(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nodes]);

  const activeMarker = useMemo<MapMarker | null>(() => {
    if (!selectedNode) return null;
    const info = splitNameFlag(selectedNode.name);
    if (/лучш/i.test(info.name)) {
      if (!bestCountry) return null;
      return mapMarkers.find((m) => m.country === bestCountry.name) || null;
    }
    const c = countryFromFlagSafe(info);
    if (!c) return null;
    return mapMarkers.find((m) => m.country === c.name) || null;
  }, [selectedNode, mapMarkers, bestCountry]);

  // Живая скорость: дельта счётчиков трафика раз в секунду
  const lastRef = useRef<{ tx: number; rx: number } | null>(null);
  useEffect(() => {
    if (!vpnRunning) {
      setSpeed({ rx: 0, tx: 0 });
      lastRef.current = null;
      return;
    }
    let stopped = false;
    (async () => {
      lastRef.current = await getTrafficSnapshot().catch(() => null);
      const t = setInterval(async () => {
        if (stopped) return;
        const cur = await getTrafficSnapshot().catch(() => null);
        const prev = lastRef.current;
        if (!cur || !prev) {
          lastRef.current = cur;
          return;
        }
        lastRef.current = cur;
        setSpeed({
          rx: Math.max(0, cur.rx - prev.rx),
          tx: Math.max(0, cur.tx - prev.tx),
        });
      }, 1000);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      return () => clearInterval(t);
    })();
    return () => {
      stopped = true;
    };
  }, [vpnRunning]);

  const toggle = async () => {
    if (busy) return;
    if (!vpnRunning && !subscriptionActive) {
      setError("Подписка истекла — продлите её в личном кабинете на телефоне");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (vpnRunning) {
        await disconnect();
        setVpnRunning(false);
      } else {
        const target = selectedNode;
        if (!target) throw new Error("Нет доступных серверов");
        await connect(target, { isSponsor: me?.is_sponsor === true });
        setVpnRunning(true);
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка подключения");
    } finally {
      setBusy(false);
    }
  };

  const selectedInfo = selectedNode ? splitNameFlag(selectedNode.name) : null;

  return (
    // Спокойный «hero»-экран: кнопка питания + карта занимают всё поле зрения,
    // снизу одна строка чипов (сервер · скорость). Подписка и аккаунт —
    // в футере рельса, дублировать их карточками не нужно.
    <View style={s.dash}>
      <View style={s.dashTop}>
        {/* Левая колонка: кнопка питания — герой экрана */}
        <View style={s.dashLeft}>
          <TvFocusable
            autoFocus
            onPress={toggle}
            disabled={busy}
            style={s.powerFocusable}
            borderRadius={112}
            scale={1.05}
            accessibilityLabel={vpnRunning ? "Выключить VPN" : "Включить VPN"}
          >
            <TvPowerButton connected={vpnRunning} busy={busy} />
          </TvFocusable>
          <Text style={s.powerState}>{busy ? "Подождите…" : vpnRunning ? "VPN подключён" : "VPN выключен"}</Text>
          {!!vpnRunning && (
            <View style={s.timerPill}>
              <Ionicons name="time-outline" size={15} color={colors.green} />
              <Text style={s.timerText}>{formatElapsed(seconds)}</Text>
            </View>
          )}
          {!!error && <Text style={s.dashError}>{error}</Text>}
          <Text style={s.dashHint}>«ОК» — включить или выключить VPN</Text>
        </View>

        {/* Карта мира на всю оставшуюся площадь */}
        <View style={s.mapCard}>
          <WorldMap
            markers={mapMarkers}
            active={activeMarker}
            connected={vpnRunning}
            light={isLightPalette()}
          />
          <Text style={s.mapTitle}>
            {vpnRunning ? "Вы подключены" : "География серверов"}
          </Text>
          {/* Подпись активной страны рисует сам WorldMap — не дублируем;
              строка ниже нужна только когда маркера нет. */}
          {!activeMarker && (
            <Text style={s.mapSub}>{mapMarkers.length} стран(ы) в подписке</Text>
          )}
        </View>
      </View>

      {/* Нижняя строка: чип сервера (ведёт во вкладку «Серверы») + скорость */}
      <View style={s.chipRow}>
        <TvFocusable
          onPress={onOpenServers}
          style={s.serverChip}
          contentStyle={s.serverChipContent}
          borderRadius={20}
          scale={1.015}
          accessibilityLabel="Выбрать другой сервер"
        >
          <View style={s.chipInner}>
            <Ionicons name="server-outline" size={18} color={colors.accent} />
            {selectedNode && selectedInfo ? (
              <>
                {!!selectedInfo.flag && <Text style={s.chipFlag}>{selectedInfo.flag}</Text>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.chipName} numberOfLines={1}>
                    {selectedInfo.name}
                  </Text>
                </View>
                <Text style={s.chipSub} numberOfLines={1}>
                  {transportLabel(selectedNode)}
                </Text>
              </>
            ) : (
              <Text style={s.chipName}>Сервер не выбран</Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </View>
        </TvFocusable>

        {!!vpnRunning && (
          <View style={s.speedChip}>
            <Ionicons name="arrow-down" size={14} color={colors.accent} />
            <Text style={s.speedChipText}>{formatBytes(speed.rx)}</Text>
            <View style={s.speedChipDivider} />
            <Ionicons name="arrow-up" size={14} color={colors.green} />
            <Text style={s.speedChipText}>{formatBytes(speed.tx)}</Text>
          </View>
        )}

        {!subscriptionActive && (
          <View style={[s.speedChip, s.warnChip]}>
            <Ionicons name="alert-circle" size={15} color={colors.orange} />
            <Text style={s.warnChipText}>Подписка истекла — продлите на телефоне или сайте</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Кнопка питания для TV: те же кольца-частицы и пульсация, что на телефоне,
 *  но в размере под большой экран. Отрисовка — локальная (без Pressable). */
function TvPowerButton({ connected, busy }: { connected: boolean; busy: boolean }) {
  return (
    <View style={s.powerWrap}>
      <View style={[s.powerHalo, connected && s.powerHaloOn]} />
      <View style={[s.powerRing, connected && { borderColor: colors.accentDeep }]} />
      <View style={[s.powerCircle, connected ? s.powerCircleOn : s.powerCircleOff, busy && { opacity: 0.75 }]}>
        {busy ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Ionicons name={connected ? "pause" : "power"} size={62} color="#fff" style={{ marginTop: -5 }} />
        )}
      </View>
      <Text style={s.powerLabel}>{connected ? "ВЫКЛЮЧИТЬ" : "ВКЛЮЧИТЬ"}</Text>
    </View>
  );
}

function countryFromFlagSafe(info: { flag: string; name: string }) {
  return countryFromFlag(info.flag) || countryFromName(info.name);
}

export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

const s = StyleSheet.create({
  screen: { flex: 1, flexDirection: "row", backgroundColor: "#0F0B1E" },
  rail: { width: 216, paddingTop: 26, paddingBottom: 18, paddingHorizontal: 14 },
  railBrand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, marginBottom: 26 },
  railLogo: { width: 40, height: 40, borderRadius: 11 },
  railName: { color: "#FFFFFF", fontSize: 19, fontWeight: "900", letterSpacing: -0.4 },
  railNav: { gap: 8 },
  navItem: { width: "100%" },
  navInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 54,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  navInnerActive: { backgroundColor: "#7C3AED" },
  navLabel: { color: "#9C93B8", fontSize: 16, fontWeight: "700", flex: 1 },
  navLabelActive: { color: "#fff" },
  navPip: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.85)" },
  railDivider: { width: 1, backgroundColor: "#2E2150" },
  railFooter: { paddingHorizontal: 6, gap: 4 },
  railStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  railStatusText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  railLogin: { color: "#9C93B8", fontSize: 13 },
  railDays: { fontSize: 12 },
  content: { flex: 1, paddingVertical: 14, paddingRight: 24, paddingLeft: 20 },

  // Спокойный «hero»-экран: питание + крупная карта сверху, одна строка
  // чипов снизу. Подписка/аккаунт живут в футере рельса.
  dash: { flex: 1, gap: 14 },
  dashTop: { flex: 1, flexDirection: "row", gap: 24 },
  dashLeft: { width: 260, alignItems: "center", justifyContent: "center", gap: 9 },

  // Нижняя строка чипов. Высота задана явно: при авто-высоте Yoga в ряде
  // случаев меряет ряд в 0 и dashTop (flex:1) съедает всё место, уводя чипы
  // за нижний край экрана.
  chipRow: { flexDirection: "row", gap: 12, height: 58 },
  serverChip: { flex: 1 },
  serverChipContent: { flex: 1 },
  chipInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1C1433",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2E2150",
    paddingHorizontal: 16,
    minHeight: 58,
  },
  chipFlag: { fontSize: 22 },
  chipName: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  chipSub: {
    color: "#8F84AC",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    maxWidth: 240,
  },
  speedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1C1433",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2E2150",
    paddingHorizontal: 16,
    minHeight: 58,
  },
  speedChipText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  speedChipDivider: { width: 1, height: 18, backgroundColor: "#2E2150" },
  warnChip: { borderColor: "rgba(251,191,36,0.4)" },
  warnChipText: { color: "#FBBF24", fontSize: 13, fontWeight: "700" },

  powerFocusable: { marginBottom: 2 },
  powerWrap: { width: 224, height: 224, alignItems: "center", justifyContent: "center" },
  powerHalo: { position: "absolute", width: 218, height: 218, borderRadius: 109, backgroundColor: "rgba(124,58,237,0.10)" },
  powerHaloOn: { backgroundColor: "rgba(124,58,237,0.20)" },
  powerRing: { position: "absolute", width: 188, height: 188, borderRadius: 94, borderWidth: 1, borderColor: "#2E2150" },
  powerCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: "center",
    justifyContent: "center",
  },
  powerCircleOff: { backgroundColor: "#251A42" },
  powerCircleOn: { backgroundColor: "#7C3AED" },
  powerLabel: {
    position: "absolute",
    bottom: 28,
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  powerState: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#1C1433",
    borderWidth: 1,
    borderColor: "#2E2150",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  timerText: { color: "#34D399", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dashError: { color: "#F87171", fontSize: 14, textAlign: "center", paddingHorizontal: 20 },
  dashHint: { color: "#8F84AC", fontSize: 12 },

  mapCard: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#1C1433",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2E2150",
    padding: 18,
    paddingTop: 14,
  },
  mapTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 10, textAlign: "center" },
  mapSub: { color: "#9C93B8", fontSize: 13, textAlign: "center", marginTop: 3 },
});
