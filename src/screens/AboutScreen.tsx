import { BrandName } from "../components/BrandName";
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
import * as Updates from "expo-updates";
import { Screen, Card } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import * as update from "../update";
import { getXrayVersion } from "../vpn/native";
import { colors, useTheme } from "../theme";
import { showToast } from "../components/Toast";

const REPO_URL = "https://github.com/instant992/ghostcloud_new";

type PlatformKey = "windows" | "android" | "linux";

const PLATFORM_ICONS: Record<PlatformKey, any> = {
  windows: "logo-windows",
  android: "logo-android",
  linux: "logo-tux",
};

type Person = {
  /** имя нативного drawable (аватарки лежат в res/drawable-nodpi) */
  avatarUri: string;
  name: string;
  /** подпись-префикс над именем (как в старом приложении) */
  prefix?: string;
  platforms?: PlatformKey[];
  /** ник Telegram без @ — тап по плитке открывает профиль */
  username?: string;
  url?: string;
};

const CONTRIBUTORS: Person[] = [
  {
    avatarUri: "avatar_instant992",
    name: "instant992",
    prefix: "Разработчик",
    url: "https://github.com/instant992",
  },
];

const TESTERS: Person[] = [
  {
    avatarUri: "avatar_lazzy2wice",
    prefix: "Тестировщик",
    name: "LAZZY2WICE",
    platforms: ["android"],
  },
  {
    avatarUri: "avatar_cottonbunny",
    prefix: "Тестировщик",
    name: "CottonBunny",
    username: "CottonBunnyDPR",
    platforms: ["windows", "android", "linux"],
  },
  {
    avatarUri: "avatar_shitpost",
    prefix: "Тестировщик",
    name: "Илья",
    username: "shitpost_with_legs",
    platforms: ["windows", "android"],
  },
  {
    avatarUri: "avatar_ruslan",
    prefix: "Тестировщик",
    name: "Руслан",
    username: "RusIan1382",
    platforms: ["android"],
  },
];

/** Статус EAS OTA (expo-updates): свежая версия / скачано и ждёт перезапуска */
type EasState =
  | { status: "checking" }
  | { status: "fresh" }
  | { status: "restart" }
  | { status: "disabled" }
  | { status: "error"; message: string };

/** Раздел «О программе» (перенесено из старого приложения):
 *  иконка/версии, участники, тестировщики, проверка обновлений, ссылки.
 *  Пасхалка: 10 тапов по иконке за секунду. */
export default function AboutScreen() {
  useTheme();
  const styles = makeStyles();
  const updateState = useSyncExternalStore(update.subscribe, update.getSnapshot);
  const [xrayVersion] = useState(() => getXrayVersion());
  const [eas, setEas] = useState<EasState>({ status: "checking" });

  // Проверка EAS OTA: скачано ли обновление, требующее перезапуска приложения
  const checkEas = () => {
    setEas({ status: "checking" });
    (async () => {
      try {
        if (!Updates.isEnabled) {
          setEas({ status: "disabled" });
          return;
        }
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          // есть новый OTA-бандл — нужно скачать и перезапустить
          await Updates.fetchUpdateAsync();
          setEas({ status: "restart" });
        } else {
          setEas({ status: "fresh" });
        }
      } catch (e: any) {
        setEas({ status: "error", message: e?.message || "Не удалось проверить" });
      }
    })();
  };

  useEffect(() => {
    checkEas();
  }, []);

  const restartApp = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      showToast("Не удалось перезапустить");
    }
  };

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

  const easText = (() => {
    switch (eas.status) {
      case "checking":
        return "Проверка…";
      case "fresh":
        return "Стоит свежая версия";
      case "restart":
        return "Скачана новая версия — перезапустите приложение";
      case "disabled":
        return "OTA отключено в этой сборке";
      case "error":
        return eas.message;
    }
  })();

  const personTile = (p: Person) => {
    const openLink = p.url || (p.username ? `https://t.me/${p.username}` : null);
    return (
      <PressableScale
        key={p.name}
        style={styles.person}
        onPress={openLink ? () => Linking.openURL(openLink).catch(() => {}) : undefined}
        disabled={!openLink}
      >
        <Image source={{ uri: p.avatarUri }} style={styles.avatar} resizeMode="cover" />
        {!!p.prefix && <Text style={styles.personPrefix}>{p.prefix}</Text>}
        <Text style={styles.personName} numberOfLines={1}>
          {p.name}
        </Text>
        {!!p.platforms?.length && (
          <View style={styles.platformRow}>
            {p.platforms.map((pl) => (
              <Ionicons
                key={pl}
                name={PLATFORM_ICONS[pl]}
                size={13}
                color={colors.textDim}
              />
            ))}
          </View>
        )}
      </PressableScale>
    );
  };

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
            <BrandName style={styles.heroApp} />
            <Text style={styles.heroVersion}>
              v{Application.nativeApplicationVersion || "?"} (сборка{" "}
              {Application.nativeBuildVersion || "?"})
            </Text>
            {!!xrayVersion && <Text style={styles.heroCore}>Ядро Xray: {xrayVersion}</Text>}
          </View>
        </View>

        <Text style={styles.desc}>
          Открытый VPN-клиент на ядрах Xray и Sing-box: VLESS REALITY, Trojan,
          VMess, Shadowsocks, Hysteria2. Простой и удобный, с автопереключением при обрыве.
        </Text>

        {/* Обновление приложения (APK) */}
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

        {/* EAS OTA — статус JS-обновления */}
        <Card>
          <PressableScale
            style={styles.rowBtn}
            onPress={() => {
              if (eas.status === "restart") restartApp();
              else if (eas.status !== "checking") checkEas();
            }}
            disabled={eas.status === "checking"}
          >
            <Ionicons
              name={eas.status === "restart" ? "refresh-circle" : "radio-outline"}
              size={17}
              color={eas.status === "restart" ? colors.orange : colors.accent}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>EAS-обновление (OTA)</Text>
              <Text style={styles.rowSub} numberOfLines={2}>
                {easText}
              </Text>
            </View>
            {eas.status === "checking" ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : eas.status === "restart" ? (
              <View style={[styles.updatePill, { backgroundColor: colors.orange }]}>
                <Text style={styles.updatePillText}>Перезапустить</Text>
              </View>
            ) : (
              <Ionicons name="refresh" size={17} color={colors.textDim} />
            )}
          </PressableScale>
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
    peopleRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
    person: { alignItems: "center", width: 88 },
    avatar: { width: 56, height: 56, borderRadius: 28 },
    personPrefix: {
      color: colors.textFaint,
      fontSize: 9,
      fontWeight: "500",
      letterSpacing: 0.5,
      marginTop: 5,
    },
    personName: { color: colors.text, fontSize: 12, marginTop: 1 },
    platformRow: { flexDirection: "row", gap: 6, marginTop: 3 },
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
