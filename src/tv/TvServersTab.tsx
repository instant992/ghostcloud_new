import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as pingStore from "../vpn/pingStore";
import { connect, disconnect } from "../vpn/manager";
import { useApp } from "../context";
import { colors, pingColor, splitNameFlag, useTheme } from "../theme";
import { transportLabel } from "../utils/transportLabel";
import type { VpnNode } from "../vpn/parse";
import { TvFocusable } from "./TvFocusable";

/** Вкладка «Серверы» для Android TV: сетка карточек с флагами, пингом и
 *  типом транспорта. Выбор узла — «ОК»: если VPN поднят, переподключение
 *  на новый сервер (та же логика, что в темах телефона). */
export function TvServersTab() {
  useTheme();
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, reloadNodes } = useApp();
  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);
  const [tab, setTab] = useState<"regular" | "lte">("regular");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<VpnNode>>(null);

  const regularNodes = useMemo(() => nodes.filter((n) => n.source !== "lte"), [nodes]);
  const lteNodes = useMemo(() => nodes.filter((n) => n.source === "lte"), [nodes]);
  const shown = tab === "lte" ? lteNodes : regularNodes;

  // Стартовая волна пинга — один раз на сессию экрана
  const didPing = useRef(false);
  useEffect(() => {
    if (didPing.current || nodes.length === 0) return;
    didPing.current = true;
    pingStore.pingAll(nodes).catch(() => {});
  }, [nodes]);

  useEffect(() => {
    if (tab === "regular") return;
    if (lteNodes.length > 0) return;
    setRefreshing(true);
    reloadNodes()
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [tab, lteNodes.length, reloadNodes]);

  const choose = async (node: VpnNode) => {
    if (busyId) return;
    if (node.id === selectedNodeId && !vpnRunning) {
      selectNode(node.id);
      return;
    }
    selectNode(node.id);
    if (!vpnRunning) return;
    // Переподключение на лету (disconnect → connect, как в телефонных темах)
    setBusyId(node.id);
    try {
      await disconnect();
      await connect(node, { isSponsor: me?.is_sponsor === true });
      setVpnRunning(true);
    } catch {
      setVpnRunning(false);
    } finally {
      setBusyId(null);
    }
  };

  const rerunPing = () => {
    pingStore.pingAll(shown).catch(() => {});
  };

  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <Text style={s.title}>Серверы</Text>
        <View style={{ flex: 1 }} />
        <TvFocusable onPress={rerunPing} style={s.headBtn} borderRadius={14} scale={1.04}>
          <View style={s.headBtnInner}>
            {pingStore.isRunning() ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="speedometer-outline" size={18} color={colors.text} />
            )}
            <Text style={s.headBtnText}>Пинг</Text>
          </View>
        </TvFocusable>
      </View>

      {/* Вкладки списка */}
      <View style={s.tabRow}>
        <TvFocusable
          autoFocus
          onPress={() => setTab("regular")}
          style={s.tab}
          borderRadius={13}
          scale={1.03}
          accessibilityLabel="Основные серверы"
        >
          <View style={[s.tabInner, tab === "regular" && s.tabInnerActive]}>
            <Text style={[s.tabText, tab === "regular" && s.tabTextActive]}>Основные · {regularNodes.length}</Text>
          </View>
        </TvFocusable>
        {lteNodes.length > 0 || tab === "lte" ? (
          <TvFocusable
            onPress={() => setTab("lte")}
            style={s.tab}
            borderRadius={13}
            scale={1.03}
            accessibilityLabel="Серверы LTE OPEN"
          >
            <View style={[s.tabInner, tab === "lte" && s.tabInnerActive]}>
              <Text style={[s.tabText, tab === "lte" && s.tabTextActive]}>
                LTE OPEN · {lteNodes.length}
              </Text>
            </View>
          </TvFocusable>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={shown}
        // Пинги живут во внешнем сторе — без extraData ячейки не перерисуются
        extraData={pings}
        keyExtractor={(n) => n.id}
        numColumns={3}
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={s.gridContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            {refreshing ? (
              <ActivityIndicator color={colors.accent} size="large" />
            ) : (
              <>
                <Ionicons name="cloud-offline-outline" size={48} color={colors.textFaint} />
                <Text style={s.emptyText}>
                  {tab === "lte" ? "Нет серверов LTE OPEN" : "Серверов пока нет"}
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const info = splitNameFlag(item.name);
          const ping = pings[item.id];
          const selected = item.id === selectedNodeId;
          const isBusy = busyId === item.id;
          return (
            <TvFocusable
              // Начальный фокус — первая карточка вкладки
              autoFocus={index === 0}
              onPress={() => choose(item)}
              disabled={!!busyId}
              style={s.cell}
              borderRadius={18}
              scale={1.035}
              accessibilityLabel={`${info.name}${selected ? ", выбран" : ""}`}
            >
              <View style={[s.cellInner, selected && s.cellSelected]}>
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={s.cellFlag}>{info.flag || "🌐"}</Text>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cellName} numberOfLines={1}>
                    {info.name}
                  </Text>
                  <Text style={s.cellSub} numberOfLines={1}>
                    {transportLabel(item)}
                  </Text>
                </View>
                <View style={s.cellRight}>
                  {ping?.status === "pending" ? (
                    <ActivityIndicator size="small" color={colors.textDim} />
                  ) : ping?.status === "done" && ping.delay > 0 ? (
                    <Text style={[s.cellPing, { color: pingColor(ping.delay) }]}>{ping.delay} ms</Text>
                  ) : ping?.status === "done" ? (
                    <Text style={[s.cellPing, { color: colors.red }]}>недоступен</Text>
                  ) : (
                    <Text style={[s.cellPing, { color: colors.textFaint }]}>—</Text>
                  )}
                  {selected && (
                    <View style={s.cellCheckRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                      <Text style={s.cellCheck}>выбран</Text>
                    </View>
                  )}
                </View>
              </View>
            </TvFocusable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  headRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 12 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  headBtn: { marginLeft: 4 },
  headBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1C1433",
    borderWidth: 1,
    borderColor: "#2E2150",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 42,
  },
  headBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  tabRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  tab: {},
  tabInner: {
    backgroundColor: "#160F2B",
    borderWidth: 1,
    borderColor: "#2E2150",
    borderRadius: 13,
    paddingHorizontal: 18,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tabInnerActive: { backgroundColor: "#7C3AED", borderColor: "#7C3AED" },
  tabText: { color: "#9C93B8", fontSize: 14, fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  gridRow: { gap: 12 },
  gridContent: { gap: 12, paddingBottom: 24 },
  cell: { flex: 1 },
  cellInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1C1433",
    borderWidth: 1,
    borderColor: "#2E2150",
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 74,
  },
  cellSelected: { borderColor: "#7C3AED", backgroundColor: "#251A42" },
  cellFlag: { fontSize: 26 },
  cellName: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  cellSub: { color: "#8F84AC", fontSize: 10.5, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  cellRight: { alignItems: "flex-end", gap: 3 },
  cellPing: { fontSize: 13, fontWeight: "800" },
  cellCheckRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cellCheck: { color: "#A855F7", fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 14 },
  emptyText: { color: "#9C93B8", fontSize: 17 },
});
