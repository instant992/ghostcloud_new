import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../../context";
import { connect, disconnect } from "../../vpn/manager";
import * as pingStore from "../../vpn/pingStore";
import { tcpPing } from "../../vpn/native";
import type { VpnNode } from "../../vpn/parse";
import { colors, splitNameFlag, useTheme } from "../../theme";
import { showToast } from "../../components/Toast";

function formatTimer(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Тема «Простой» — одна большая кнопка для пожилых людей.
 *  Никакого выбора серверов: тап = автовыбор лучшего сервера и подключение. */
export default function SimpleScreen() {
  useTheme();
  const styles = makeStyles();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, subscriptionActive } = useApp();

  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [serverName, setServerName] = useState<string | null>(null);

  // Авто-переключение при падении сервера
  const failCount = useRef(0);
  const failingOver = useRef(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const selectedIdRef = useRef(selectedNodeId);
  selectedIdRef.current = selectedNodeId;
  const runningRef = useRef(vpnRunning);
  runningRef.current = vpnRunning;

  useEffect(() => {
    if (!vpnRunning) {
      setSeconds(0);
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [vpnRunning]);

  const connectBest = async () => {
    // LTE-серверы в автовыбор не попадают — только обычные
    const isLte = (n: VpnNode) => n.source === "lte" || n.id.startsWith("lte-");
    const candidates = nodes.filter((n) => !isLte(n));
    if (candidates.length === 0) {
      showToast("Нет доступных серверов");
      return;
    }
    // Пингуем и выбираем лучший сервер автоматически
    let best: VpnNode | null = null;
    try {
      await pingStore.pingAll(candidates);
      const snap = pingStore.getSnapshot();
      let bestDelay = Infinity;
      for (const n of candidates) {
        const p = snap[n.id];
        if (p?.status === "done" && p.delay > 0 && p.delay < bestDelay) {
          best = n;
          bestDelay = p.delay;
        }
      }
    } catch {}
    if (!best) best = candidates.find((n) => n.supportedByXray) || candidates[0];
    if (!best) {
      showToast("Нет доступных серверов");
      return;
    }
    selectNode(best.id);
    setServerName(splitNameFlag(best.name).name);
    await connect(best);
    setVpnRunning(true);
  };

  /** Авто-переключение: текущий сервер недоступен → выбираем лучший рабочий. */
  const failover = async () => {
    if (failingOver.current) return;
    const isLte = (n: VpnNode) => n.source === "lte" || n.id.startsWith("lte-");
    const all = nodesRef.current;
    const currentId = selectedIdRef.current;
    const candidates = all.filter((n) => !isLte(n) && n.id !== currentId);
    if (candidates.length === 0) {
      showToast("Нет других доступных серверов");
      return;
    }
    failingOver.current = true;
    showToast("Сервер недоступен — переключаюсь…");
    let best: VpnNode | null = null;
    try {
      await pingStore.pingAll(candidates);
      const snap = pingStore.getSnapshot();
      let bestDelay = Infinity;
      for (const n of candidates) {
        const p = snap[n.id];
        if (p?.status === "done" && p.delay > 0 && p.delay < bestDelay) {
          best = n;
          bestDelay = p.delay;
        }
      }
    } catch {}
    if (!best) best = candidates.find((n) => n.supportedByXray) || candidates[0];
    if (!best) {
      failingOver.current = false;
      return;
    }
    try {
      selectNode(best.id);
      setServerName(splitNameFlag(best.name).name);
      await disconnect();
      await connect(best);
      setVpnRunning(true);
      setSeconds(0);
      showToast(`Подключено: ${splitNameFlag(best.name).name}`);
    } catch {
      showToast("Не удалось переключиться");
      setVpnRunning(false);
    } finally {
      failingOver.current = false;
    }
  };

  // Проверка связи: если текущий сервер несколько раз подряд недоступен — фейловер
  useEffect(() => {
    if (!vpnRunning) {
      failCount.current = 0;
      return;
    }
    const check = async () => {
      if (!runningRef.current || failingOver.current) return;
      const current = nodesRef.current.find((n) => n.id === selectedIdRef.current);
      if (!current) return;
      let ok = false;
      try {
        const delay = await tcpPing(current.address, current.port, 4000);
        ok = delay > 0;
      } catch {
        ok = false;
      }
      if (ok) {
        failCount.current = 0;
      } else {
        failCount.current += 1;
        if (failCount.current >= 3) {
          failCount.current = 0;
          failover();
        }
      }
    };
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, [vpnRunning]);

  const toggle = async () => {
    if (busy) return;
    if (!vpnRunning && !subscriptionActive) {
      showToast("Подписка истекла — продлите её");
      return;
    }
    setBusy(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (vpnRunning) {
        await disconnect();
        setVpnRunning(false);
        setServerName(null);
      } else {
        await connectBest();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showToast(e?.message || "Не удалось подключиться");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* Шапка */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appName}>GhostCloud</Text>
          <Text style={styles.modeLabel}>Простой режим</Text>
        </View>
        <Pressable onPress={() => nav.navigate("Настройки")} hitSlop={10} style={styles.gearBtn}>
          <Ionicons name="settings-outline" size={22} color={colors.textDim} />
        </Pressable>
      </View>

      {/* Большая кнопка */}
      <View style={styles.center}>
        <Pressable
          onPress={toggle}
          disabled={busy}
          style={[
            styles.bigButton,
            { backgroundColor: vpnRunning ? colors.green : colors.accent },
            busy && { opacity: 0.75 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons name="power" size={84} color="#fff" />
          )}
        </Pressable>

        <Text style={styles.bigLabel}>
          {busy ? "Подождите…" : vpnRunning ? "ВЫКЛЮЧИТЬ" : "ВКЛЮЧИТЬ"}
        </Text>

        <View style={styles.statusBox}>
          {vpnRunning ? (
            <>
              <Ionicons name="checkmark-circle" size={26} color={colors.green} />
              <Text style={[styles.statusText, { color: colors.green }]}>Защищено</Text>
            </>
          ) : (
            <Text style={[styles.statusText, { color: colors.textDim }]}>
              Нажмите кнопку — интернет будет под защитой
            </Text>
          )}
        </View>

        {!!vpnRunning && (
          <View style={styles.timerBox}>
            <Ionicons name="time-outline" size={18} color={colors.textDim} />
            <Text style={styles.timerText}>{formatTimer(seconds)}</Text>
            {!!serverName && (
              <Text style={styles.serverText} numberOfLines={1}>
                · {serverName}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  appName: { color: colors.text, fontSize: 26, fontWeight: "800" },
  modeLabel: { color: colors.textDim, fontSize: 15, marginTop: 2 },
  gearBtn: { padding: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  bigButton: {
    width: 230,
    height: 230,
    borderRadius: 115,
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  bigLabel: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800",
    marginTop: 30,
    letterSpacing: 1,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    maxWidth: 320,
  },
  statusText: { fontSize: 20, fontWeight: "600", textAlign: "center", flexShrink: 1 },
  timerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    maxWidth: 300,
  },
  timerText: { color: colors.textDim, fontSize: 18, fontWeight: "600" },
  serverText: { color: colors.textFaint, fontSize: 16, flexShrink: 1 },
});
