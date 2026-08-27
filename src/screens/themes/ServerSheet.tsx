import React, { useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as pingStore from "../../vpn/pingStore";
import type { VpnNode } from "../../vpn/parse";
import { transportLabel } from "../../utils/transportLabel";
import { colors, splitNameFlag, useTheme } from "../../theme";

/** Шторка выбора сервера для тем minimalist / liquid glass */
export function ServerSheet({
  visible,
  onClose,
  nodes,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  nodes: VpnNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  useTheme();
  const styles = makeStyles();
  const pings = useSyncExternalStore(pingStore.subscribe, pingStore.getSnapshot);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Выбор сервера</Text>
            <Pressable onPress={() => pingStore.pingAll(nodes)} hitSlop={8} style={{ padding: 6 }}>
              {pingStore.isRunning() ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>Пинг</Text>
              )}
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.textFaint} />
            </Pressable>
          </View>
          <FlatList
            data={nodes}
            keyExtractor={(n) => n.id}
            style={{ maxHeight: 440 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => {
              const info = splitNameFlag(item.name);
              const selected = item.id === selectedId;
              const ping = pings[item.id];
              return (
                <Pressable
                  style={[styles.item, selected && styles.itemOn]}
                  onPress={() => onSelect(item.id)}
                >
                  <Text style={{ fontSize: 22 }}>{info.flag}</Text>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.itemName, selected && { color: colors.accent }]} numberOfLines={1}>
                      {info.name}
                    </Text>
                    {item.source === "lte" ? (
                      <Text style={styles.itemSub}>
                        {transportLabel(item)} · LTE OPEN
                      </Text>
                    ) : (
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {transportLabel(item)}
                      </Text>
                    )}
                  </View>
                  {ping?.status === "pending" && (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                  {ping?.status === "done" && ping.delay > 0 && (
                    <Text
                      style={{
                        color: ping.delay < 120 ? colors.green : ping.delay < 260 ? colors.orange : colors.red,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {ping.delay} мс
                    </Text>
                  )}
                  {ping?.status === "done" && !!ping.error && (
                    <Text style={{ color: colors.red, fontSize: 11 }}>⚠</Text>
                  )}
                  {selected && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: colors.textFaint, textAlign: "center", paddingVertical: 24 }}>
                Список пуст — обновите подписку
              </Text>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: "80%",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSoft,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  itemOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  itemName: { color: colors.text, fontWeight: "700", fontSize: 14 },
  itemSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, marginLeft: 8 },
});
