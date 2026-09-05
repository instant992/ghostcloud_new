import React, { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as pingStore from "../../vpn/pingStore";
import { AUTO_SERVER_ID } from "../../vpn/autoSelect";
import type { VpnNode } from "../../vpn/parse";
import { transportLabel } from "../../utils/transportLabel";
import { colors, splitNameFlag, sheetSurfaceBg, useTheme, pingColor as pingColorFor } from "../../theme";

/** Шторка выбора сервера для тем minimalist / liquid glass.
 *  Кнопка «Пинг» всегда прижата вправо к кнопке закрытия (как в основной теме).
 *  Разделение «Обычные» / «LTE Open» — как в основной теме. */
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
  const [tab, setTab] = useState<"regular" | "lte">("regular");

  const regularNodes = nodes.filter((n) => n.source !== "lte");
  const lteNodes = nodes.filter((n) => n.source === "lte");
  const shown = tab === "lte" ? lteNodes : regularNodes;

  const pingBtn = (
    <Pressable onPress={() => pingStore.pingAll(shown)} hitSlop={8} style={{ padding: 6 }}>
      {pingStore.isRunning() ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>Пинг</Text>
      )}
    </Pressable>
  );
  const closeBtn = (
    <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
      <Ionicons name="close" size={18} color={colors.textFaint} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Выбор сервера</Text>
            {/* Пинг и закрытие — единой группой у правого края */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              {pingBtn}
              {closeBtn}
            </View>
          </View>

          {/* Вкладки Обычные / LTE Open — как в основной теме */}
          {lteNodes.length > 0 && (
            <View style={styles.tabRow}>
              {(
                [
                  { key: "regular", label: `Обычные (${regularNodes.length})` },
                  { key: "lte", label: `LTE OPEN (${lteNodes.length})` },
                ] as const
              ).map((t) => (
                <Pressable
                  key={t.key}
                  style={[styles.tabBtn, tab === t.key && styles.tabBtnOn]}
                  onPress={() => setTab(t.key)}
                >
                  <Text style={[styles.tabBtnText, tab === t.key && { color: "#fff" }]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <FlatList
            bounces={false}
            overScrollMode="never"
            data={shown}
            keyExtractor={(n) => n.id}
            style={{ maxHeight: 400 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListHeaderComponent={
              tab === "regular" ? (
                <Pressable
                  style={[styles.item, selectedId === AUTO_SERVER_ID && styles.itemOn]}
                  onPress={() => onSelect(AUTO_SERVER_ID)}
                >
                  <Text style={{ fontSize: 22 }}>✨</Text>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text
                      style={[styles.itemName, selectedId === AUTO_SERVER_ID && { color: colors.accent }]}
                      numberOfLines={1}
                    >
                      Автовыбор
                    </Text>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      Лучший обычный сервер по пингу · авто-переключение при обрыве
                    </Text>
                  </View>
                  {selectedId === AUTO_SERVER_ID && (
                    <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  )}
                </Pressable>
              ) : null
            }
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
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {transportLabel(item)}
                    </Text>
                  </View>
                  {ping?.status === "pending" && (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                  {ping?.status === "done" &&
                    (ping.error ? (
                      // Не удалось проверить пинг — красный прочерк там же, где значение пинга
                      <Text style={{ color: colors.red, fontWeight: "700", fontSize: 12 }}>—</Text>
                    ) : ping.delay > 0 ? (
                      <Text
                        style={{
                          color: pingColorFor(ping.delay),
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {ping.delay} мс
                      </Text>
                    ) : null)}
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
    backgroundColor: sheetSurfaceBg(),
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
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabBtnOn: { backgroundColor: colors.accent },
  tabBtnText: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
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
