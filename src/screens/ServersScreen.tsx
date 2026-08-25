import React, { useCallback, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Subtitle, Title } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { useApp } from "../context";
import { colors, splitNameFlag, useTheme } from "../theme";
import { fetchNodes } from "../vpn/manager";
import * as pingStore from "../vpn/pingStore";
import { transportLabel } from "../utils/transportLabel";

export default function ServersScreen() {
  useTheme();
  const styles = makeStyles();

  const { nodes, unsupportedCount, selectedNodeId, selectNode, reloadNodes, vpnRunning } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"regular" | "lte">("regular");
  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);

  const filtered = nodes.filter((n: any) =>
    tab === "lte" ? n.source === "lte" : n.source !== "lte"
  );

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadNodes();
    } catch {}
    setRefreshing(false);
  }, [reloadNodes]);

  useFocusEffect(
    useCallback(() => {
      if (nodes.length === 0) doRefresh();
    }, [])
  );

  const pinging = pingStore.isRunning();

  const renderItem = ({ item }: { item: any }) => {
    const selected = item.id === (selectedNodeId || nodes[0]?.id);
    const info = splitNameFlag(item.name);
    const ping = pings[item.id];
    return (
      <PressableScale
        onPress={() => selectNode(item.id)}
        style={[
          styles.item,
          selected && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
        ]}
      >
        <Text style={{ fontSize: 30 }}>{info.flag}</Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name} numberOfLines={1}>
            {info.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {transportLabel(item)}
          </Text>
          {ping?.status === "done" && !!ping.error && (
            <Text style={styles.pingError} numberOfLines={1}>
              ⚠ {ping.error}
            </Text>
          )}
        </View>
        {ping?.status === "pending" && (
          <ActivityIndicator size="small" color={colors.accent} />
        )}
        {ping?.status === "done" && !ping.error && (
          <Text
            style={{
              color: ping.delay < 300 ? colors.green : colors.orange,
              fontWeight: "700",
              fontSize: 13,
            }}
          >
            {ping.delay} мс
          </Text>
        )}
        {selected && (
          <View style={[styles.checkDot, { backgroundColor: colors.accent }]} />
        )}
      </PressableScale>
    );
  };

  return (
    <Screen scroll={false} style={{ paddingTop: 60 }}>
      <Title>Серверы</Title>
      <Subtitle>
        {nodes.length > 0
          ? `Доступно локаций: ${nodes.length}${unsupportedCount ? ` · ${unsupportedCount} не поддерживается Xray` : ""}`
          : "Загрузка подписки…"}
      </Subtitle>

      <View style={{ flexDirection: "row", marginBottom: 10 }}>
        <PressableScale
          onPress={() => setTab("regular")}
          style={[styles.tabBtn, tab === "regular" && styles.tabBtnOn]}
        >
          <Text style={[styles.tabText, tab === "regular" && { color: "#fff" }]}>Обычные</Text>
        </PressableScale>
        <PressableScale
          onPress={() => setTab("lte")}
          style={[styles.tabBtn, tab === "lte" && styles.tabBtnOn]}
        >
          <Text style={[styles.tabText, tab === "lte" && { color: "#fff" }]}>LTE Open</Text>
        </PressableScale>
      </View>

      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        <PressableScale
          onPress={() => pingStore.pingAll(filtered)}
          style={styles.actionBtn}
          disabled={pinging || vpnRunning}
        >
          {pinging ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.actionBtnText}>Проверить пинг</Text>
          )}
        </PressableScale>
        <PressableScale onPress={doRefresh} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>Обновить</Text>
        </PressableScale>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          !refreshing ? (
            <Text style={{ color: colors.textFaint, textAlign: "center", marginTop: 40 }}>
              Не удалось загрузить подписку.{"\n"}Проверьте подключение и потяните вниз.
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  name: { color: colors.text, fontWeight: "700", fontSize: 15 },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  pingError: { color: colors.red, fontSize: 10, marginTop: 2 },
  checkDot: { width: 12, height: 12, borderRadius: 6, marginLeft: 10 },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginHorizontal: 4,
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 4,
  },
  tabBtnOn: { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep },
  tabText: { color: colors.textDim, fontWeight: "700", fontSize: 13 },
});
