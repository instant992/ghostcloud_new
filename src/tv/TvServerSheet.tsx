import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as pingStore from "../vpn/pingStore";
import { connect, disconnect, resolveConnectNode } from "../vpn/manager";
import { useApp } from "../context";
import { colors, pingColor, pingFailLabel, splitNameFlag } from "../theme";
import { transportLabel } from "../utils/transportLabel";
import type { VpnNode } from "../vpn/parse";
import { AUTO_SERVER_ID } from "../vpn/autoSelect";
import { isBestServerAggregate } from "../vpn/serverGrouping";
import { TvFocusable } from "./TvFocusable";

const ROW_H = 74;
const ROW_GAP = 12;
const SHEET_H = 424;

/** Выезжающая снизу панель списка серверов (Android TV).
 *  Открывается «ОК» по чипу сервера на главной: выбор узла, повторная проверка
 *  пинга. Закрытие — «Назад» на пульте, крестик или выбор сервера.
 *  LTE OPEN на TV не показываем: список ограничен обычными серверами. */
export function TvServerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { nodes, selectedNodeId, selectNode, vpnRunning, setVpnRunning, me, reloadNodes } = useApp();
  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rendered, setRendered] = useState(visible);
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const listRef = useRef<FlatList<VpnNode>>(null);

  // Только обычные серверы: LTE OPEN на ТВ скрыт.
  const shown = useMemo(() => nodes.filter((n) => n.source !== "lte" && !isBestServerAggregate(n)), [nodes]);

  // Холодный старт: узлы могли ещё не загрузиться — подтягиваем при открытии.
  useEffect(() => {
    if (!visible || nodes.length > 0) return;
    reloadNodes().catch(() => {});
  }, [visible, nodes.length, reloadNodes]);

  // Пинг — только по кнопке «Пинг» в панели выбора серверов, без автопроверки

  // Анимация выезда/скрытия
  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // «Назад» с пульта закрывает панель
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // При открытии прокручиваем к выбранному серверу
  useEffect(() => {
    if (!visible) return;
    const idx = shown.findIndex((n) => n.id === selectedNodeId);
    if (idx <= 0) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.5 });
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const choose = async (node: VpnNode) => {
    if (busyId) return;
    selectNode(node.id);
    onClose();
    if (!vpnRunning || node.id === selectedNodeId) return;
    // Переподключение на лету (та же логика, что в телефонных темах)
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

  const chooseSmartMode = async () => {
    if (busyId) return;
    selectNode(AUTO_SERVER_ID);
    onClose();
    if (!vpnRunning) return;
    setBusyId(AUTO_SERVER_ID);
    try {
      await disconnect();
      const target = await resolveConnectNode(nodes, AUTO_SERVER_ID);
      if (!target) throw new Error("Нет доступных серверов");
      await connect(target, { isSponsor: me?.is_sponsor === true });
      setVpnRunning(true);
    } catch {
      setVpnRunning(false);
    } finally {
      setBusyId(null);
    }
  };

  if (!rendered && !visible) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [SHEET_H + 40, 0] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[s.scrim, { opacity: anim }]} pointerEvents="auto" />
      <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
        <View style={s.headRow}>
          <Text style={s.title}>Серверы</Text>
          <View style={s.countPill}>
            <Text style={s.countText}>{shown.length}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <TvFocusable
            onPress={() => pingStore.pingAll(shown).catch(() => {})}
            style={s.headBtn}
            borderRadius={14}
            scale={1.04}
            accessibilityLabel="Проверить пинг"
          >
            <View style={s.headBtnInner}>
              {pingStore.isRunning() ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="speedometer-outline" size={18} color={colors.text} />
              )}
              <Text style={s.headBtnText}>Пинг</Text>
            </View>
          </TvFocusable>
          <TvFocusable
            onPress={onClose}
            style={s.headBtn}
            borderRadius={14}
            scale={1.04}
            accessibilityLabel="Закрыть список серверов"
          >
            <View style={[s.headBtnInner, s.closeBtnInner]}>
              <Ionicons name="close" size={20} color={colors.text} />
            </View>
          </TvFocusable>
        </View>

        <FlatList
          ref={listRef}
          data={shown}
          ListHeaderComponent={
            <TvFocusable
              onPress={chooseSmartMode}
              style={s.cell}
              borderRadius={18}
              scale={1.035}
              accessibilityLabel="Умный режим"
            >
              <View style={[s.cellInner, selectedNodeId === AUTO_SERVER_ID && s.cellSelected]}>
                {busyId === AUTO_SERVER_ID ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="sparkles" size={26} color={colors.accent} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.cellName}>Умный режим</Text>
                  <Text style={s.cellSub}>Лучший доступный сервер</Text>
                </View>
              </View>
            </TvFocusable>
          }
          // Пинги живут во внешнем сторе — без extraData ячейки не перерисуются
          extraData={pings}
          keyExtractor={(n) => n.id}
          numColumns={2}
          columnWrapperStyle={s.gridRow}
          contentContainerStyle={s.gridContent}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: ROW_H + ROW_GAP,
            offset: Math.floor(index / 2) * (ROW_H + ROW_GAP),
            index,
          })}
          ListEmptyComponent={
            <View style={s.empty}>
              {nodes.length === 0 ? (
                <ActivityIndicator color={colors.accent} size="large" />
              ) : (
                <>
                  <Ionicons name="cloud-offline-outline" size={44} color={colors.textFaint} />
                  <Text style={s.emptyText}>Серверов пока нет</Text>
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
                // Начальный фокус — первая карточка списка
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
                      <Text style={[s.cellPing, { color: colors.red }]}>{pingFailLabel(ping.error)}</Text>
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
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(5,2,12,0.62)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_H,
    backgroundColor: "#160F2B",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#2E2150",
    paddingHorizontal: 26,
    paddingTop: 18,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  countPill: {
    backgroundColor: "#251A42",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: { color: "#9C93B8", fontSize: 13, fontWeight: "800" },
  headBtn: {},
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
  closeBtnInner: { paddingHorizontal: 12 },
  headBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  gridRow: { gap: ROW_GAP },
  gridContent: { gap: ROW_GAP, paddingBottom: 26 },
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
    height: ROW_H,
  },
  cellSelected: { borderColor: "#7C3AED", backgroundColor: "#251A42" },
  cellFlag: { fontSize: 26 },
  cellName: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  cellSub: { color: "#8F84AC", fontSize: 10.5, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  cellRight: { alignItems: "flex-end", gap: 3 },
  cellPing: { fontSize: 13, fontWeight: "800" },
  cellCheckRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cellCheck: { color: "#A855F7", fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 14 },
  emptyText: { color: "#9C93B8", fontSize: 17 },
});
