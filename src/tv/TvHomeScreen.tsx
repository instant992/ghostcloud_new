import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../context";
import { connect, disconnect } from "../vpn/manager";
import { getTrafficSnapshot } from "../vpn/native";
import * as pingStore from "../vpn/pingStore";
import { useVpnTimerSeconds, formatElapsed } from "../vpn/timer";
import { colors, formatBytes, pingColor, splitNameFlag, useTheme } from "../theme";
import { transportLabel } from "../utils/transportLabel";
import * as stats from "../stats";
import { TvFocusable } from "./TvFocusable";
import { TvServerSheet } from "./TvServerSheet";
import { TvSettingsTab } from "./TvSettingsTab";
import { TvProfileTab } from "./TvProfileTab";
import * as Haptics from "expo-haptics";

type TabKey = "home" | "profile" | "settings";

// «Серверы» — не вкладка: список открывается выезжающей панелью по чипу
// сервера на главной.
const TABS: Array<{ key: TabKey; icon: string; iconActive: string; label: string }> = [
  { key: "home", icon: "home-outline", iconActive: "home", label: "Главная" },
  { key: "profile", icon: "person-outline", iconActive: "person", label: "Профиль" },
  { key: "settings", icon: "settings-outline", iconActive: "settings", label: "Настройки" },
];

/** Домашний экран Android TV: боковое меню-рельс + крупная кнопка питания
 *  по центру и чип текущего сервера снизу (открывает панель списка серверов). */
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
        {tab === "home" ? <TvDashboardTab /> : null}
        {tab === "profile" ? <TvProfileTab /> : null}
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

/** Аккаунт внизу рельса — всегда на виду. Статус VPN дублировать не нужно:
 *  он крупно показан в центре главной. */
function RailFooter() {
  const { me } = useApp();
  const daysLeft = useMemo(() => {
    if (!me?.expire_at) return 0;
    const d = new Date(String(me.expire_at)).getTime();
    if (Number.isNaN(d)) return 0;
    return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  }, [me]);
  return (
    <View style={s.railFooter}>
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

/** Главная вкладка: крупная кнопка питания по центру + строка чипов снизу. */
function TvDashboardTab() {
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, subscriptionActive } = useApp();
  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const seconds = useVpnTimerSeconds(vpnRunning);
  const [speed, setSpeed] = useState({ rx: 0, tx: 0 });
  const [todayStat, setTodayStat] = useState<stats.DayStat>({ rx: 0, tx: 0 });

  // Трафик за сегодня: контекст пишет дельты в stats каждые 3 с при активном
  // VPN — перечитываем файл периодически, чтобы цифры росли на глазах.
  useEffect(() => {
    let stopped = false;
    const load = () => {
      stats
        .sumDays(1)
        .then((v) => {
          if (!stopped) setTodayStat(v);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, vpnRunning ? 5000 : 60000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [vpnRunning]);

  // Только обычные серверы: LTE OPEN на ТВ скрыт.
  const visibleNodes = useMemo(() => nodes.filter((n) => n.source !== "lte"), [nodes]);

  const selectedNode = useMemo(
    () => visibleNodes.find((n) => n.id === selectedNodeId) || visibleNodes[0] || null,
    [visibleNodes, selectedNodeId]
  );

  // Пинг выбранного сервера для чипа на главной: если результата ещё нет —
  // разово измеряем (например, после перезапуска приложения).
  const selectedPing = selectedNode ? pings[selectedNode.id] : undefined;
  useEffect(() => {
    if (!selectedNode) return;
    if (selectedPing) return;
    if (pingStore.isRunning()) return;
    pingStore.pingOne(selectedNode).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, selectedPing, nodes.length]);

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
    // Минималистичный «hero»-экран: одна крупная кнопка питания по центру,
    // снизу строка чипов (сервер · скорость). Карта убрана намеренно — на
    // телевизоре она размывала фокус внимания; география видна в чипе сервера.
    <View style={s.dash}>
      <View style={s.dashTop}>
        <TvFocusable
          autoFocus
          onPress={toggle}
          disabled={busy}
          style={s.powerFocusable}
          borderRadius={132}
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

      {/* Трафик за сегодня — блок над списком серверов */}
      <View style={s.trafficRow}>
        <View style={s.trafficCard}>
          <View style={[s.trafficIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="arrow-down" size={16} color={colors.accent} />
          </View>
          <View>
            <Text style={s.trafficValue} numberOfLines={1}>
              {formatBytes(todayStat.rx)}
            </Text>
            <Text style={s.trafficLabel}>скачано сегодня</Text>
          </View>
        </View>
        <View style={s.trafficCard}>
          <View style={[s.trafficIcon, { backgroundColor: "rgba(52,211,153,0.12)" }]}>
            <Ionicons name="arrow-up" size={16} color={colors.green} />
          </View>
          <View>
            <Text style={s.trafficValue} numberOfLines={1}>
              {formatBytes(todayStat.tx)}
            </Text>
            <Text style={s.trafficLabel}>отдано сегодня</Text>
          </View>
        </View>
      </View>

      {/* Нижняя строка: чип сервера (открывает выезжающий список) + скорость */}
      <View style={s.chipRow}>
        <TvFocusable
          onPress={() => setSheetOpen(true)}
          style={s.serverChip}
          contentStyle={s.serverChipContent}
          borderRadius={20}
          scale={1.015}
          accessibilityLabel="Выбрать другой сервер"
        >
          <View style={s.chipInner}>
            {/* Пинг выбранного сервера — слева от флага */}
            <View style={s.chipPingBox}>
              {selectedPing?.status === "pending" ? (
                <ActivityIndicator size="small" color={colors.textDim} />
              ) : selectedPing?.status === "done" && selectedPing.delay > 0 ? (
                <Text style={[s.chipPing, { color: pingColor(selectedPing.delay) }]}>
                  {selectedPing.delay} ms
                </Text>
              ) : selectedPing?.status === "done" ? (
                <Text style={[s.chipPing, { color: colors.red }]}>—</Text>
              ) : (
                <Text style={[s.chipPing, { color: colors.textFaint }]}>…</Text>
              )}
            </View>
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

      {/* Выезжающий список серверов */}
      <TvServerSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

/** Кнопка питания для TV: крупные кольца под большой экран, только иконка —
 *  без текстовой подписи внутри (состояние читается из заголовка под кнопкой). */
function TvPowerButton({ connected, busy }: { connected: boolean; busy: boolean }) {
  return (
    <View style={s.powerWrap}>
      <View style={[s.powerHalo, connected && s.powerHaloOn]} />
      <View style={[s.powerRing, connected && { borderColor: colors.accentDeep }]} />
      <View style={[s.powerCircle, connected ? s.powerCircleOn : s.powerCircleOff, busy && { opacity: 0.75 }]}>
        {busy ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Ionicons name={connected ? "pause" : "power"} size={76} color="#fff" />
        )}
      </View>
    </View>
  );
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
  railLogin: { color: "#9C93B8", fontSize: 13 },
  railDays: { fontSize: 12 },
  content: { flex: 1, paddingVertical: 14, paddingRight: 24, paddingLeft: 20 },

  // Минималистичный «hero»-экран: крупная кнопка питания по центру, блок
  // трафика за сегодня и строка чипов снизу. Подписка/аккаунт — в футере рельса.
  dash: { flex: 1, gap: 14 },
  dashTop: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },

  // Блок трафика за сегодня (фикс. высота: Yoga иначе может смерить ряд в 0)
  trafficRow: { flexDirection: "row", gap: 12, height: 76 },
  trafficCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1C1433",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2E2150",
    paddingHorizontal: 20,
  },
  trafficIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  trafficValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  trafficLabel: { color: "#8F84AC", fontSize: 12, marginTop: 1 },

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
  chipPingBox: { minWidth: 62, alignItems: "flex-start" },
  chipPing: { fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
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

  // alignSelf перебивает «flex-start» из TvFocusable.wrap — иначе кнопка
  // прижмётся к левому краю вместо центрирования в dashTop.
  powerFocusable: { marginBottom: 4, alignSelf: "center" },
  powerWrap: { width: 280, height: 280, alignItems: "center", justifyContent: "center" },
  powerHalo: { position: "absolute", width: 272, height: 272, borderRadius: 136, backgroundColor: "rgba(124,58,237,0.10)" },
  powerHaloOn: { backgroundColor: "rgba(124,58,237,0.22)" },
  powerRing: { position: "absolute", width: 232, height: 232, borderRadius: 116, borderWidth: 1, borderColor: "#2E2150" },
  powerCircle: {
    width: 188,
    height: 188,
    borderRadius: 94,
    alignItems: "center",
    justifyContent: "center",
  },
  powerCircleOff: { backgroundColor: "#251A42" },
  powerCircleOn: { backgroundColor: "#7C3AED" },
  powerState: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", textAlign: "center" },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 7,
    backgroundColor: "#1C1433",
    borderWidth: 1,
    borderColor: "#2E2150",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  timerText: { color: "#34D399", fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dashError: { color: "#F87171", fontSize: 14, textAlign: "center", paddingHorizontal: 20 },
  dashHint: { color: "#8F84AC", fontSize: 13, textAlign: "center" },
});
