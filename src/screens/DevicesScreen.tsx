import React, { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, ErrorText, Screen, Subtitle } from "../components/UI";
import { banDevice, buyDevices, deleteDevice, getDevices, unbanDevice } from "../api";
import * as deviceNames from "../deviceNames";
import { colors } from "../theme";

type Device = {
  os: string;
  model: string;
  os_ver: string;
  hwid: string;
  hwid_full: string;
  created: string;
};

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(6);
  const [extra, setExtra] = useState(0);
  const [bannedCount, setBannedCount] = useState(0);
  const [banned, setBanned] = useState<Device[]>([]);
  const [showBanned, setShowBanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [renameTarget, setRenameTarget] = useState<Device | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await getDevices();
      if (r?.success) {
        setDevices(r.devices || []);
        setCount(r.count ?? 0);
        setLimit(r.limit ?? 6);
        setExtra(r.extra_devices ?? 0);
        setBannedCount(r.banned_count ?? 0);
      }
    } catch {}
  }, []);

  const loadBanned = useCallback(async () => {
    try {
      const r = await fetch(`${require("../../api").BASE_URL}/api/auth/mobile/devices/banned`, {
        headers: await authHeaders(),
      });
      const data = await r.json();
      if (data?.success) setBanned(data.devices || []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadBanned();
      deviceNames.readAll().then(setNames).catch(() => {});
    }, [])
  );

  const saveName = async () => {
    if (!renameTarget) return;
    await deviceNames.setName(renameTarget.hwid_full, renameValue).catch(() => {});
    setNames(await deviceNames.readAll());
    setRenameTarget(null);
    setRenameValue("");
  };

  const displayName = (d: Device): string => {
    const custom = names[d.hwid_full];
    if (custom) return custom;
    return `${d.model !== "—" ? d.model : d.os}${d.os_ver ? ` · ${d.os_ver}` : ""}`;
  };

  const doRefresh = async () => {
    setRefreshing(true);
    await load();
    await loadBanned();
    setRefreshing(false);
  };

  const onBan = (d: Device) => {
    Alert.alert("Забанить устройство?", `${d.model} (${d.os})\nУстройство будет отключено от VPN.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Забанить",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          setError(null);
          try {
            const r = await banDevice(d.hwid_full, d.os, d.model);
            if (!r?.success) throw new Error(r?.error || "Ошибка");
            if (r.new_subscription_url) {
              const { saveSession, loadSession } = await import("../storage");
              const s = await loadSession();
              if (s) {
                await saveSession({ ...s, subUrl: r.new_subscription_url });
              }
            }
            await load();
            await loadBanned();
          } catch (e: any) {
            setError(e?.message || "Ошибка");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const onDelete = (d: Device) => {
    Alert.alert("Удалить устройство?", `${d.model} (${d.os}) освободит слот.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          setError(null);
          try {
            const r = await deleteDevice(d.hwid_full);
            if (!r?.success) throw new Error(r?.error || "Ошибка");
            await load();
          } catch (e: any) {
            setError(e?.message || "Ошибка");
          }
        },
      },
    ]);
  };

  const onUnban = async (hwid: string) => {
    setError(null);
    try {
      const r = await unbanDevice(hwid);
      if (!r?.success) throw new Error(r?.error || "Ошибка");
      await loadBanned();
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    }
  };

  const onBuy = () => {
    Alert.alert("Докупить устройства", "+1 устройство — 50 ₽/мес с баланса.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Купить",
        onPress: async () => {
          setError(null);
          try {
            const r = await buyDevices(1);
            if (!r?.success) throw new Error(r?.error || "Недостаточно средств на балансе");
            await load();
          } catch (e: any) {
            setError(e?.message || "Ошибка");
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <Subtitle>{`Подключено ${count} из ${limit}${extra ? ` (+${extra} доп.)` : ""}`}</Subtitle>
      <ErrorText>{error}</ErrorText>

      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        <Pressable style={styles.actionBtn} onPress={onBuy}>
          <Text style={styles.actionBtnText}>+ устройство · 50 ₽</Text>
        </Pressable>
        {!!bannedCount && (
          <Pressable style={styles.actionBtn} onPress={() => setShowBanned(!showBanned)}>
            <Text style={[styles.actionBtnText, { color: colors.red }]}>
              Бан-лист ({bannedCount})
            </Text>
          </Pressable>
        )}
      </View>

      {showBanned &&
        banned.map((d) => (
          <Card key={d.hwid_full} style={{ borderColor: colors.red + "44" }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{d.model || d.os}</Text>
            <Text style={{ color: colors.textDim, fontSize: 12 }}>
              HWID: {d.hwid} · заблокировано
            </Text>
            <Button title="Разбанить" variant="ghost" onPress={() => onUnban(d.hwid_full)} />
          </Card>
        ))}

      <FlatList
        data={devices}
        keyExtractor={(d) => d.hwid_full}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Pressable
              onPress={() => {
                setRenameTarget(item);
                setRenameValue(names[item.hwid_full] || "");
              }}
              style={{ marginRight: 12 }}
            >
              <Text style={{ fontSize: 18 }}>✏️</Text>
            </Pressable>
            <Text style={{ fontSize: 24 }}>💻</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {displayName(item)}
                {names[item.hwid_full] ? "  ·" : ""}
              </Text>
              <Text style={styles.itemSub} numberOfLines={1}>
                {names[item.hwid_full]
                  ? `${item.model !== "—" ? item.model : item.os}${item.os_ver ? ` · ${item.os_ver}` : ""} · HWID: ${item.hwid}`
                  : `HWID: ${item.hwid}`}
              </Text>
            </View>
            <Pressable onPress={() => onDelete(item)}>
              <Text style={{ color: colors.textFaint, paddingHorizontal: 8 }}>🗑</Text>
            </Pressable>
            <Pressable onPress={() => onBan(item)}>
              <Text style={{ color: colors.red, paddingHorizontal: 8 }}>🚫</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textFaint, textAlign: "center", marginTop: 30 }}>
            Пока нет подключённых устройств
          </Text>
        }
      />
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRenameTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: 12 }}>
              Название устройства
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.bgSoft,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                color: colors.text,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 14,
              }}
              placeholder="Например: Мой телефон"
              placeholderTextColor={colors.textFaint}
              value={renameValue}
              onChangeText={setRenameValue}
              maxLength={32}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button title="Отмена" variant="ghost" onPress={() => setRenameTarget(null)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Сохранить" onPress={saveName} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const { loadSession } = await import("../storage");
  const s = await loadSession();
  return s?.subUrl ? { "X-Sub-Url": s.subUrl } : {};
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  itemTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  itemSub: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center" as const,
    marginHorizontal: 4,
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
  },
});





