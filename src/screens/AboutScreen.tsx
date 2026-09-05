import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import * as Linking from "expo-linking";
import { Screen, Card } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import * as update from "../update";
import { getXrayVersion } from "../vpn/native";
import { colors, useTheme } from "../theme";
import { showToast } from "../components/Toast";

const REPO_URL = "https://github.com/instant992/ghostcloud_new";

type Person = { avatar: any; name: string; subtitle: string; url?: string };

const CONTRIBUTORS: Person[] = [
  {
    avatar: require("../../assets/avatars/instant992.jpg"),
    name: "instant992",
    subtitle: "Разработчик",
    url: "https://github.com/instant992",
  },
];

const TESTERS: Person[] = [
  {
    avatar: require("../../assets/avatars/cottonbunny.jpg"),
    name: "CottonBunny",
    subtitle: "@CottonBunnyDPR · Windows, Android, Linux",
  },
  {
    avatar: require("../../assets/avatars/shitpost.jpg"),
    name: "Илья",
    subtitle: "@shitpost_with_legs · Windows, Android",
  },
  {
    avatar: require("../../assets/avatars/ruslan.jpg"),
    name: "Руслан",
    subtitle: "@RusIan1382 · Android",
  },
];

/** Раздел «О программе» (перенесено из старого приложения):
 *  иконка/версии, участники, тестировщики, проверка обновлений, ссылки.
 *  Пасхалка: 10 тапов по иконке за секунду. */
export default function AboutScreen() {
  useTheme();
  const styles = makeStyles();
  const updateState = useSyncExternalStore(update.subscribe, update.getSnapshot);
  const [xrayVersion] = useState(() => getXrayVersion());

  // Пасхалка как в старом приложении — 10 быстрых тапов по иконке
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIconTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1000);
    if (tapCount.current >= 10) {
      tapCount.current = 0;
      showToast("REMNAFAMILY ONE LOVE ❤️");
      Linking.openURL("https://docs.rw").catch(() => {});
    }
  };

  useEffect(() => {
    return () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
  }, []);

  const checking = updateState.status === "checking";
  const downloading = updateState.status === "downloading";
  const info =
    updateState.status === "available"
      ? updateState.info
      : updateState.status === "downloading"
        ? updateState.info
        : null;

  const checkNow = () => {
    update.checkForUpdate().catch(() => {});
  };

  const updateRowValue = (() => {
    if (downloading) {
      const pct =
        updateState.status === "downloading" && updateState.progress >= 0
          ? ` — ${Math.round(updateState.progress * 100)}%`
          : "";
      return `Скачивание v${info?.version}${pct}`;
    }
    if (info) return `Доступна v${info.version}`;
    if (updateState.status === "up-to-date") return "Актуальная версия";
    if (updateState.status === "error") return updateState.message;
    return checking ? "Проверка…" : "Проверить обновление";
  })();

  const personTile = (p: Person) => (
    <PressableScale
      key={p.name}
      style={styles.person}
      onPress={p.url ? () => Linking.openURL(p.url as string).catch(() => {}) : undefined}
      disabled={!p.url}
    >
      <Image source={p.avatar} style={styles.avatar} />
      <Text style={styles.personName} numberOfLines={1}>
        {p.name}
      </Text>
      <Text style={styles.personSub} numberOfLines={2}>
        {p.subtitle}
      </Text>
    </PressableScale>
  );

  return (
    <Screen scroll={false}>
      <ScrollView
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Шапка: иконка, название, версии */}
        <View style={styles.hero}>
          <Pressable onPress={onIconTap} hitSlop={12}>
            <Image source={{ uri: "app_icon" }} style={styles.heroIcon} resizeMode="cover" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroApp}>GhostCloud</Text>
            <Text style={styles.heroVersion}>
              v{Application.nativeApplicationVersion || "?"} (сборка{" "}
              {Application.nativeBuildVersion || "?"})
            </Text>
            {!!xrayVersion && <Text style={styles.heroCore}>Ядро Xray: {xrayVersion}</Text>}
          </View>
        </View>

        <Text style={styles.desc}>
          Приватный VPN-клиент на ядрах Xray, Sing-box и Mihomo: VLESS REALITY, Trojan,
          VMess, Shadowsocks, Hysteria2. Простой и удобный, с автовыбором лучшего сервера.
        </Text>

        {/* Обновление приложения */}
        <Card>
          <PressableScale
            style={styles.rowBtn}
            onPress={() => {
              if (info && !downloading) update.downloadAndInstall(info);
              else if (!downloading) checkNow();
            }}
            disabled={downloading}
          >
            <Ionicons name="cloud-download-outline" size={17} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {info && !downloading ? `Обновить до v${info.version}` : "Обновление приложения"}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {updateRowValue}
              </Text>
            </View>
            {downloading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : info ? (
              <View style={styles.updatePill}>
                <Text style={styles.updatePillText}>Обновить</Text>
              </View>
            ) : (
              <Ionicons name="refresh" size={17} color={colors.textDim} />
            )}
          </PressableScale>
          {!!info?.changelog && (
            <Text style={styles.changelog} numberOfLines={6}>
              {info.changelog}
            </Text>
          )}
        </Card>

        {/* Команда */}
        <Card>
          <Text style={styles.sectionTitle}>Команда</Text>
          <View style={styles.peopleRow}>{CONTRIBUTORS.map(personTile)}</View>
        </Card>

        {/* Тестировщики */}
        <Card>
          <Text style={styles.sectionTitle}>Тестировщики</Text>
          <View style={styles.peopleRow}>{TESTERS.map(personTile)}</View>
        </Card>

        {/* Ссылки */}
        <Card>
          <PressableScale
            style={styles.rowBtn}
            onPress={() => Linking.openURL(REPO_URL).catch(() => {})}
          >
            <Ionicons name="logo-github" size={17} color={colors.text} />
            <Text style={styles.rowTitle}>Репозиторий проекта</Text>
            <Ionicons name="open-outline" size={16} color={colors.textDim} />
          </PressableScale>
          <PressableScale
            style={styles.rowBtn}
            onPress={() => Linking.openURL("https://t.me/vpnrouting").catch(() => {})}
          >
            <Ionicons name="paper-plane-outline" size={17} color={colors.accent} />
            <Text style={styles.rowTitle}>Telegram-канал</Text>
            <Ionicons name="open-outline" size={16} color={colors.textDim} />
          </PressableScale>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    hero: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    heroIcon: { width: 64, height: 64, borderRadius: 16 },
    heroApp: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 2 },
    heroVersion: { color: colors.textDim, fontSize: 13, marginTop: 2 },
    heroCore: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
    desc: {
      color: colors.textDim,
      fontSize: 12.5,
      lineHeight: 18,
      marginHorizontal: 20,
      marginBottom: 12,
    },
    sectionTitle: {
      color: colors.textDim,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    peopleRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    person: { alignItems: "center", width: 92 },
    avatar: { width: 52, height: 52, borderRadius: 26 },
    personName: { color: colors.text, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
    personSub: { color: colors.textFaint, fontSize: 10, textAlign: "center", marginTop: 2 },
    rowBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
    },
    rowTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
    rowSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    changelog: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: 8 },
    updatePill: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    updatePillText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  });
