import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { colors, useTheme } from "../theme";
import {
  accessLogPath,
  errorLogPath,
  readTextFileTail,
  truncateTextFile,
} from "../vpn/native";
import { getSelectedCore } from "../settings";

/** Экран «Запросы» — как в старом приложении (Flutter, «Просмотр последних
 *  записей запросов»): список последних сетевых запросов через VPN.
 *  Источник — access-лог ядра Xray/UwuRay (пишется в filesDir/gc_access.log).
 *  Вторая вкладка — журнал ядра (error-лог, диагностика). */

type RequestEntry = {
  id: string;
  time: string;
  source: string;
  network: "tcp" | "udp" | "?";
  dest: string;
  tag: string;
};

/** Строка access-лога Xray (реальный формат):
 *  `2026-09-25 01:36:12.803855 from udp:26.26.26.1:45638 accepted udp:8.8.8.8:443 [tun-in >> proxy]`
 *  `2026-09-25 01:36:13.003673 from DNS accepted https://8.8.8.8/dns-query [xray.system… >> proxy]` */
function parseAccessLine(line: string): RequestEntry | null {
  const m = line.match(
    /^(?:\d{4}[/-]\d{2}[/-]\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s+from\s+(\S+)\s+accepted\s+(\S+)(?:\s+\[([^\]]+)\])?/
  );
  if (!m) return null;
  const [, time, src, dest, route] = m;
  const netM = dest.match(/^(tcp|udp):/i);
  const network = (netM ? netM[1].toLowerCase() : "?") as "tcp" | "udp" | "?";
  const cleanDest = dest.replace(/^(tcp|udp):/i, "");
  // маршрут «tun-in >> proxy» — берём outbound (часть после >> / ->)
  const tag = (route || "")
    .split(/>>|->/)
    .pop()!
    .trim();
  return {
    id: `${time}|${src}|${cleanDest}|${Math.random().toString(36).slice(2, 7)}`,
    time,
    source: src,
    network,
    dest: cleanDest,
    tag,
  };
}

/** Метка outbound-тега по-русски */
function tagLabel(tag: string): { text: string; color: string } {
  if (tag === "proxy") return { text: "через VPN", color: colors.accent };
  if (tag === "direct") return { text: "напрямую", color: "#4CAF50" };
  if (tag === "block") return { text: "заблокировано", color: "#EF5350" };
  if (tag === "dns-out") return { text: "DNS", color: "#29B6F6" };
  return { text: tag || "—", color: colors.textFaint };
}

const MAX_ENTRIES = 300;

export default function RequestsScreen({
  route,
}: {
  route?: { params?: { tab?: "requests" | "core" } };
}) {
  useTheme();
  const [tab, setTab] = useState<"requests" | "core">(route?.params?.tab === "core" ? "core" : "requests");
  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [coreLog, setCoreLog] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const core = getSelectedCore();
  const xrayCore = core === "xray" || core === "uwuray";

  const load = useCallback(async () => {
    const access = await readTextFileTail(accessLogPath(), 512 * 1024);
    if (access) {
      const parsed: RequestEntry[] = [];
      for (const line of access.split("\n")) {
        if (!line.trim()) continue;
        const e = parseAccessLine(line);
        if (!e) continue;
        // служебный трафик ядра (внутренний DNS туннеля) — не пользовательские запросы
        if (e.dest.startsWith("10.111.222.3")) continue;
        parsed.push(e);
      }
      // последние сверху, cap на MAX_ENTRIES
      setEntries(parsed.slice(-MAX_ENTRIES).reverse());
    } else {
      setEntries([]);
    }
    const err = await readTextFileTail(errorLogPath(), 128 * 1024);
    setCoreLog(
      err
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .slice(-200)
        .reverse()
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
      // автообновление, пока экран открыт
      const t = setInterval(load, 3000);
      return () => clearInterval(t);
    }, [load])
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.dest.toLowerCase().includes(q) || e.tag.toLowerCase().includes(q)
    );
  }, [entries, query]);

  const clearLog = () => {
    truncateTextFile(accessLogPath());
    truncateTextFile(errorLogPath());
    setEntries([]);
    setCoreLog([]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Переключатель вкладок */}
      <View style={styles.tabsRow}>
        {(
          [
            ["requests", "Запросы"],
            ["core", "Журнал ядра"],
          ] as Array<["requests" | "core", string]>
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tabPill, tab === key && { backgroundColor: colors.accent }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Text style={[styles.tabText, tab === key && { color: "#fff", fontWeight: "700" }]}>
              {label}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable onPress={clearLog} hitSlop={8} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel="Очистить журнал">
          <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {tab === "requests" && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={15} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск по адресу…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
          />
        </View>
      )}

      {tab === "requests" ? (
        !xrayCore ? (
          <EmptyState
            icon="alert-circle-outline"
            text="Журнал запросов доступен только на ядре Xray или UwuRay. Сейчас выбрано другое ядро — запросы не записываются."
          />
        ) : shown.length === 0 && !loading ? (
          <EmptyState
            icon="pulse-outline"
            text="Пока нет записей. Включите VPN и пользуйтесь приложениями — последние запросы появятся здесь."
          />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(e) => e.id}
            initialNumToRender={20}
            windowSize={7}
            renderItem={({ item }) => {
              const tag = tagLabel(item.tag);
              return (
                <View style={styles.reqRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reqDest} numberOfLines={1}>
                      {item.dest}
                    </Text>
                    <View style={styles.reqMetaRow}>
                      <View style={[styles.chip, { borderColor: item.network === "udp" ? "#FF9800" : colors.border }]}>
                        <Text style={[styles.chipText, { color: item.network === "udp" ? "#FF9800" : colors.textFaint }]}>
                          {item.network.toUpperCase()}
                        </Text>
                      </View>
                      <View style={[styles.chip, { borderColor: tag.color }]}>
                        <Text style={[styles.chipText, { color: tag.color }]}>{tag.text}</Text>
                      </View>
                      {!!item.time && <Text style={styles.reqTime}>{item.time}</Text>}
                    </View>
                  </View>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )
      ) : coreLog.length === 0 && !loading ? (
        <EmptyState icon="checkmark-circle-outline" text="Журнал ядра пуст — ошибок нет." />
      ) : (
        <FlatList
          data={coreLog}
          keyExtractor={(l, i) => `${i}|${l.slice(0, 24)}`}
          initialNumToRender={20}
          windowSize={7}
          renderItem={({ item }) => (
            <View style={styles.coreRow}>
              <Text style={styles.coreText} selectable>
                {item}
              </Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.textFaint} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabText: { color: colors.textDim, fontSize: 13 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 13, padding: 0 },
  reqRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 9 },
  reqDest: { color: colors.text, fontSize: 14, fontWeight: "600" },
  reqMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  chipText: { fontSize: 10, fontWeight: "600" },
  reqTime: { color: colors.textFaint, fontSize: 11, marginLeft: 2 },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 16 },
  coreRow: { paddingHorizontal: 16, paddingVertical: 8 },
  coreText: { color: colors.textDim, fontSize: 11, fontFamily: "monospace" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 90, paddingHorizontal: 40 },
  emptyText: { color: colors.textFaint, fontSize: 13, textAlign: "center", marginTop: 14, lineHeight: 19 },
});
