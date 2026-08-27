import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PressableScale } from "./PressableScale";
import * as appFilterMod from "../vpn/appFilter";
import { getInstalledApps, getAppIcon, type AppInfo } from "../vpn/native";
import { colors, useTheme } from "../theme";
import { PrivacyText } from "./PrivacyText";

type AppTab = "allow" | "block";

/** Иконка приложения в списке фильтра (грузится с PackageManager, кэш на нативной стороне) */
function AppIcon({ packageName, name }: { packageName: string; name: string }) {
  useTheme();
  const styles = makeStyles();
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getAppIcon(packageName).then((b64) => {
      if (alive && b64) setIcon(b64);
    });
    return () => {
      alive = false;
    };
  }, [packageName]);

  if (icon) {
    return (
      <View style={styles.appAvatar}>
        <Image
          source={{ uri: `data:image/png;base64,${icon}` }}
          style={{ width: 34, height: 34, borderRadius: 10 }}
        />
      </View>
    );
  }
  return (
    <View style={[styles.appAvatar, { backgroundColor: colors.accentSoft }]}>
      <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 12 }}>
        {(name[0] || "?").toUpperCase()}
      </Text>
    </View>
  );
}

/** Полноэкранная модалка «Фильтр соединения» — белые/чёрные списки приложений.
 *  Используется на главной и в боковых меню тем v2ray/happ. */
export function AppFilterModal({
  visible,
  onClose,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  onChange?: (allowed: string[], blocked: string[]) => void;
}) {
  useTheme();
  const styles = makeStyles();

  const [tab, setTab] = useState<AppTab>("block");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [search, setSearch] = useState("");
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([appFilterMod.loadFilter(), getInstalledApps(includeSystem)])
      .then(([f, list]) => {
        if (cancelled) return;
        setAllowed(f.allowed);
        setBlocked(f.blocked);
        setApps(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, includeSystem]);

  const toggleApp = (pkg: string) => {
    const inAllowed = allowed.includes(pkg);
    const inBlocked = blocked.includes(pkg);
    let nextAllowed = allowed;
    let nextBlocked = blocked;
    if (tab === "allow") {
      nextAllowed = inAllowed ? allowed.filter((p) => p !== pkg) : [...allowed, pkg];
      if (!inAllowed) nextBlocked = blocked.filter((p) => p !== pkg);
    } else {
      nextBlocked = inBlocked ? blocked.filter((p) => p !== pkg) : [...blocked, pkg];
      if (!inBlocked) nextAllowed = allowed.filter((p) => p !== pkg);
    }
    setAllowed(nextAllowed);
    setBlocked(nextBlocked);
    appFilterMod.saveAllowed(nextAllowed).catch(() => {});
    appFilterMod.saveBlocked(nextBlocked).catch(() => {});
    onChange?.(nextAllowed, nextBlocked);
    Haptics.selectionAsync().catch(() => {});
  };

  const q = search.trim().toLowerCase();
  const shown = apps.filter(
    (a) =>
      !q ||
      a.appName.toLowerCase().includes(q) ||
      a.packageName.toLowerCase().includes(q)
  );

  const whitelistMode = allowed.length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.appsScreen}>
        <View style={styles.appsHeader}>
          <PressableScale onPress={onClose} hitSlop={10}>
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700" }}>Готово</Text>
          </PressableScale>
          <PrivacyText style={styles.appsTitle}>Приложения</PrivacyText>
          <View style={{ width: 50 }} />
        </View>

        <View style={styles.tabsRow}>
          {(
            [
              ["allow", `Через VPN (${allowed.length})`],
              ["block", `Мимо VPN (${blocked.length})`],
            ] as Array<[AppTab, string]>
          ).map(([key, label]) => (
            <PressableScale
              key={key}
              style={[styles.appsTabBtn, tab === key && styles.appsTabBtnOn]}
              onPress={() => setTab(key)}
            >
              <PrivacyText
                style={{
                  color: tab === key ? "#fff" : colors.textDim,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {label}
              </PrivacyText>
            </PressableScale>
          ))}
        </View>

        <View style={styles.systemRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
              Системные приложения
            </Text>
            <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 2 }}>
              Показывать службы Android в списке
            </Text>
          </View>
          <Switch
            value={includeSystem}
            onValueChange={setIncludeSystem}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        <TextInput
          style={styles.appsSearch}
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск приложений…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
        />

        <Text style={[styles.appsHint, { color: whitelistMode ? colors.accent : colors.textFaint }]}>
          {whitelistMode
            ? "Белый список: через VPN идут только приложения из «Через VPN», список «Мимо» не действует"
            : "Все приложения идут через VPN, кроме выбранных в «Мимо VPN». Изменения применяются при подключении"}
        </Text>

        {loading && apps.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(item) => item.packageName}
            contentContainerStyle={{ paddingBottom: 30 }}
            renderItem={({ item }) => {
              const inList =
                tab === "allow" ? allowed.includes(item.packageName) : blocked.includes(item.packageName);
              return (
                <PressableScale style={styles.appRow} onPress={() => toggleApp(item.packageName)}>
                  <AppIcon packageName={item.packageName} name={item.appName} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>
                      {item.appName}
                    </Text>
                    <Text style={{ color: colors.textFaint, fontSize: 11 }} numberOfLines={1}>
                      {item.packageName}
                    </Text>
                  </View>
                  {item.system && (
                    <View style={styles.sysTag}>
                      <Text style={{ color: colors.textFaint, fontSize: 10 }}>SYS</Text>
                    </View>
                  )}
                  <Ionicons
                    name={inList ? (tab === "allow" ? "checkmark-circle" : "remove-circle") : "ellipse-outline"}
                    size={24}
                    color={
                      inList
                        ? tab === "allow"
                          ? colors.green
                          : colors.red
                        : colors.textFaint
                    }
                  />
                </PressableScale>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  appsScreen: { flex: 1, backgroundColor: colors.bg, paddingTop: 54, paddingHorizontal: 16 },
  appsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  appsTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  systemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  appsSearch: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    marginBottom: 8,
  },
  appsHint: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  appAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sysTag: {
    backgroundColor: colors.bgSoft,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginRight: 2,
  },
  appsTabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 9,
  },
  appsTabBtnOn: { backgroundColor: colors.accent },
});
