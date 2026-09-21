import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import * as Haptics from "expo-haptics";
import { Button, Card, Screen, Title, useScreenTopPad } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { useNavigation } from "@react-navigation/native";
import { SponsorBenefitsSheet } from "../components/SponsorBenefits";
import { SponsorHeart } from "../components/Badges";
import { showToast } from "../components/Toast";
import { useApp } from "../context";
import { colors, THEME_LABELS, THEME_ORDER, SIMPLE_UNLOCK_CODE, useTheme, useThemeSwitcher, sheetSurfaceBg, type ThemeName } from "../theme";
import { getAntiDpi, getAutoConnect, getAutoConnectBoot, getKillSwitch, getPingMethod, getSelectedCore, getSetting, getThemeName, getThemeMode, setAntiDpi, setAutoConnect, setAutoConnectBoot, setKillSwitch, setPingMethod, setSetting, type CoreName, type PingMethod, type ThemeMode } from "../settings";
import { DNS_PROVIDERS, getDnsProvider } from "../vpn/dns";
import { disconnect, isVpnRunning } from "../vpn/manager";
import {
  downloadCore,
  getCpuAbi,
  getCoreStatus,
  getLauncherIcon,
  getXrayVersion,
  loadLibCore,
  onCoreDownloadProgress,
  openVpnSettings,
  setLauncherIcon,
} from "../vpn/native";

const CORES_REPO_MANIFEST = "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/manifest.json";

const CORES: Array<{ key: CoreName; label: string; file: string; lib: "singbox" | "uwuray" | null; note: string; mb: number }> = [
  { key: "xray", label: "Xray", file: "", lib: null, note: "встроен · VLESS, VMess, Trojan, SS", mb: 0 },
  { key: "sing-box", label: "Sing-box", file: "libsingbox.so", lib: "singbox", note: "+ Hysteria2", mb: 36 },
  { key: "uwuray", label: "UwuRay", file: "libuwuray.so", lib: "uwuray", note: "форк Xray · расширенный BT-снаффер", mb: 34 },
];

// Фолбэк, если манифест недоступен
const FALLBACK: Record<string, Record<string, { url: string; sha256: string; size: number }>> = {
  "sing-box": {
    "arm64-v8a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/arm64-v8a/libsingbox.so",
      sha256: "4e2c79b5b1d721ba957afd9815868f95439e7e1ea989cfded49de09f234ff286",
      size: 35185576,
    },
    "armeabi-v7a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/armeabi-v7a/libsingbox.so",
      sha256: "e775d76a702a90e0d0285d07bcb388d09d9fab0b199afbff793aed7f07509a65",
      size: 33308520,
    },
    x86_64: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/x86_64/libsingbox.so",
      sha256: "100ce32a90b74f98156ad3406ee099ff6359188c1042efa4917c420b385d40e3",
      size: 37628544,
    },
  },
  uwuray: {
    "arm64-v8a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/arm64-v8a/libuwuray.so",
      sha256: "2935fd14447311507cf36338c20a316888f6ca7a2111aa0fc1fcefe88b46ed81",
      size: 35512232,
    },
    "armeabi-v7a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/armeabi-v7a/libuwuray.so",
      sha256: "c205b43ee8d6b70af450e363054397d2c2759c87352e4e6c75cfa1d398a6653f",
      size: 33888592,
    },
    x86_64: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/x86_64/libuwuray.so",
      sha256: "a06c60c05b4803e0c81fa8a6d4a00433a16edebb8a1dde454884e2baab08792d",
      size: 37804136,
    },
    x86: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/x86/libuwuray.so",
      sha256: "50b096cb48e9c7e03834664a69ba3a744853a980449c38049a92c6d086747524",
      size: 34312536,
    },
  },
};

type CoreMeta = { url: string; sha256: string; size: number; version: string };

async function fetchCoreMeta(core: string, abi: string): Promise<CoreMeta | null> {
  try {
    const res = await fetch(CORES_REPO_MANIFEST);
    const manifest = await res.json();
    const entry = manifest?.cores?.[core];
    const file = entry?.files?.[abi];
    if (!file?.path) return null;
    return {
      url: `https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/${file.path}`,
      sha256: String(file.sha256 || ""),
      size: Number(file.size || 0),
      version: String(entry.version || ""),
    };
  } catch {
    return null;
  }
}

/** Стили, доступные только спонсорам — как во Flutter-версии */
const SPONSOR_STYLES: ThemeName[] = ["v2ray", "happ"];

/** Секретная тема «Простой»: не видна в списке, пока не ввести код.
 *  Код вводится после 5 нажатий на заголовок «Стиль темы». */
const SIMPLE_UNLOCK_KEY = "simple_theme_unlocked";

export default function SettingsScreen() {
  useTheme();
  const styles = makeStyles();
  const switchTheme = useThemeSwitcher();
  const nav = useNavigation<any>();
  const { me, vpnRunning, setVpnRunning, isFoxcloud, signOut } = useApp();
  const [style, setStyle] = useState<ThemeName>(getThemeName());
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const [core, setCore] = useState<CoreName>(getSelectedCore());
  const [antiDpi, setAntiDpiState] = useState(getAntiDpi());
  const [xrayVersion, setXrayVersion] = useState("");
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [confirmCore, setConfirmCore] = useState<(typeof CORES)[number] | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [sunrise, setSunrise] = useState(getSetting("theme_sunrise", "06:00"));
  const [sunset, setSunset] = useState(getSetting("theme_sunset", "20:00"));
  const [scheduleMode, setScheduleMode] = useState<"sun" | "custom">(() =>
    getSetting("theme_schedule_mode", "sun") === "custom" ? "custom" : "sun"
  );
  const [customRise, setCustomRise] = useState(() => getSetting("theme_custom_rise", "07:00"));
  const [customSet, setCustomSet] = useState(() => getSetting("theme_custom_set", "21:00"));
  const [sunBusy, setSunBusy] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(false);
  const [dnsId, setDnsId] = useState(() => getSetting("dns_provider", "auto"));
  const [stopBusy, setStopBusy] = useState(false);
  const [killSwitch, setKillSwitchState] = useState(getKillSwitch());
  const [autoConnect, setAutoConnectState] = useState(getAutoConnect());
  const [autoBoot, setAutoBootState] = useState(getAutoConnectBoot());
  const [pingMethod, setPingMethodState] = useState<PingMethod>(getPingMethod());
  const [pingOpen, setPingOpen] = useState(false);

  /** Сворачиваемые группы настроек — по умолчанию всё свёрнуто, экран короткий */
  const [grpOpen, setGrpOpen] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    setGrpOpen((g) => ({ ...g, [k]: !g[k] }));
  };
  /** Подтверждение выхода из аккаунта (кнопка перенесена из профиля) */
  const [logoutOpen, setLogoutOpen] = useState(false);

  /** Иконка приложения на рабочем столе: "default" (призрак) / "foxcloud" (лиса) */
  const [appIcon, setAppIcon] = useState<string>(() => getLauncherIcon());

  const changeAppIcon = (type: "default" | "foxcloud") => {
    if (type === appIcon) return;
    if (!isSponsor) {
      setBenefitsOpen(true);
      return;
    }
    const prev = appIcon;
    setAppIcon(type);
    const ok = setLauncherIcon(type);
    if (ok) {
      showToast(
        type === "foxcloud"
          ? "Иконка FoxCloud применена"
          : "Стандартная иконка восстановлена",
        "top"
      );
    } else {
      setAppIcon(prev);
      showToast("Не удалось сменить иконку", "top");
    }
  };

  /** Мгновенная остановка VPN — без подтверждения, по одному нажатию */
  const stopVpnNow = async () => {
    if (stopBusy) return;
    setStopBusy(true);
    try {
      await disconnect();
      setVpnRunning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast("VPN остановлен", "top");
    } catch (e: any) {
      showToast(e?.message || "Не удалось остановить VPN");
    } finally {
      setStopBusy(false);
    }
  };

  /** Смена DNS-провайдера (только спонсорам) */
  const changeDns = (id: string) => {
    setDnsId(id);
    setSetting("dns_provider", id);
    const p = getDnsProvider(id);
    Haptics.selectionAsync().catch(() => {});
    showToast(`DNS: ${p.name}. Применится при следующем подключении`, "top");
  };

  // Секретная тема «Простой»
  const [simpleUnlocked, setSimpleUnlocked] = useState(() => getSetting(SIMPLE_UNLOCK_KEY, "0") === "1");
  const [styleTaps, setStyleTaps] = useState(0);
  const tapReset = useRef<any>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");

  const saveTime = (key: string, value: string, setter: (v: string) => void) => {
    const clean = value.replace(/[^\d:]/g, "").slice(0, 5);
    setter(clean);
    if (/^\d{2}:\d{2}$/.test(clean)) {
      setSetting(key, clean);
      if (mode === "auto") switchTheme({ mode: "auto" });
    }
  };

  /** «По солнцу»: запрашиваем рассвет/закат для Москвы и сохраняем как интервал авто-темы */
  const fetchSunTimes = async () => {
    setSunBusy(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(
        "https://api.sunrise-sunset.org/json?lat=55.7558&lng=37.6173&formatted=0",
        { signal: ctrl.signal }
      );
      const j = await r.json();
      const toLocal = (iso: string) => {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      };
      const rise = toLocal(j?.results?.sunrise);
      const setT = toLocal(j?.results?.sunset);
      if (/^\d{2}:\d{2}$/.test(rise) && /^\d{2}:\d{2}$/.test(setT)) {
        setSunrise(rise);
        setSunset(setT);
        setSetting("theme_sunrise", rise);
        setSetting("theme_sunset", setT);
        if (mode === "auto") switchTheme({ mode: "auto" });
      }
    } catch {
      // сеть недоступна — оставляем текущие значения
    } finally {
      clearTimeout(t);
      setSunBusy(false);
    }
  };

  /** Режим темы: тёмная/светлая/авто — стиль при этом не меняется */
  const changeMode = (m: ThemeMode) => {
    setMode(m);
    setSetting("theme_mode", m);
    setSetting("theme_schedule_enabled", m === "auto" ? "1" : "0");
    switchTheme({ mode: m });
  };

  const changeScheduleMode = (m: "sun" | "custom") => {
    setScheduleMode(m);
    setSetting("theme_schedule_mode", m);
    if (mode === "auto") switchTheme({ mode: "auto" });
  };

  const isSponsor = me?.is_sponsor === true;
  const visibleStyles = THEME_ORDER.filter((t) => {
    if (!SPONSOR_STYLES.includes(t)) return true;
    // спонсорские стили скрыты, если не выбраны (как во Flutter-версии)
    return isSponsor || style === t;
  });
  // Секретная тема «Простой»: видна только после разблокировки (или если уже активна)
  if ((simpleUnlocked || style === "simple") && !visibleStyles.includes("simple")) {
    visibleStyles.splice(1, 0, "simple");
  }

  useEffect(() => {
    setXrayVersion(getXrayVersion());
    setDownloaded({
      "libsingbox.so": getCoreStatus("libsingbox.so").downloaded,
      "libuwuray.so": getCoreStatus("libuwuray.so").downloaded,
    });
    const off = onCoreDownloadProgress((e) => {
      setProgress((p) => ({ ...p, [e.name]: e.progress }));
    });
    return off;
  }, []);

  /** Стиль темы: меняет дизайн, режим (тёмный/светлый) сохраняется */
  const changeStyle = (next: ThemeName) => {
    setStyle(next);
    setSetting("theme", next);
    switchTheme({ style: next });
  };

  /** 5 нажатий на заголовок «Стиль темы» → диалог ввода кода секретной темы */
  const handleStyleTitleTap = () => {
    if (simpleUnlocked || isFoxcloud) return;
    clearTimeout(tapReset.current);
    const next = styleTaps + 1;
    if (next >= 5) {
      setStyleTaps(0);
      setCodeOpen(true);
    } else {
      setStyleTaps(next);
      tapReset.current = setTimeout(() => setStyleTaps(0), 2000);
    }
  };

  const submitUnlockCode = () => {
    if (codeInput.trim().toLowerCase() === SIMPLE_UNLOCK_CODE) {
      setSetting(SIMPLE_UNLOCK_KEY, "1");
      setSimpleUnlocked(true);
      setCodeOpen(false);
      setCodeInput("");
      changeStyle("simple");
      showToast("Тема «Простой» открыта");
    } else {
      showToast("Неверный код");
    }
  };

  const changeCore = (next: CoreName) => {
    const meta = CORES.find((c) => c.key === next);
    if (meta?.file && !downloaded[meta.file]) return;
    const prev = core;
    setCore(next);
    setSetting("core", next);
    // Скачиваемые ядра (sing-box/uwuray) содержат собственный Go-рантайм:
    // в одном процессе может жить только одно. Если в этой сессии уже
    // подключались другим скачиваемым ядром — нужен перезапуск приложения.
    const prevLib = CORES.find((c) => c.key === prev)?.lib;
    const nextLib = meta?.lib;
    if (prevLib && nextLib && prevLib !== nextLib) {
      showToast("Ядро изменено — перезапустите приложение перед подключением", "top");
    }
  };

  const startDownload = (c: (typeof CORES)[number]) => {
    const lib = c.lib as "singbox" | "uwuray";
    const abi = getCpuAbi();
    setConfirmCore(null);
    setProgress((p) => ({ ...p, [c.file]: 0 }));
    (async () => {
      try {
        const meta = (await fetchCoreMeta(c.key, abi)) || FALLBACK[c.key]?.[abi];
        if (!meta) throw new Error("Не удалось получить данные ядра");
        await downloadCore(c.file, meta.url, meta.sha256, meta.size);
        setDownloaded((d) => ({ ...d, [c.file]: true }));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const v = await loadLibCore(lib).catch(() => "");
        if (v) setVersions((vv) => ({ ...vv, [c.key]: v }));
      } catch (e: any) {
        AlertFallback(e?.message || "Не удалось скачать ядро");
      } finally {
        setProgress((p) => {
          const n = { ...p };
          delete n[c.file];
          return n;
        });
      }
    })();
  };

  return (
    <Screen style={useScreenTopPad()}>
      <Title>Настройки</Title>

      {/* ─── Группа «Внешний вид»: тема + иконка приложения ─── */}
      {/* FoxCloud (вход через Telegram): тема закреплена — режим темы
          (тёмная/авто/светлая), смена темы по времени и выбор стиля скрыты
          целиком, чтобы нельзя было уйти из FoxCloud или включить авто-смену. */}
      {!isFoxcloud && (
      <SettingsGroup
        open={!!grpOpen.appearance}
        onToggle={() => toggleGroup("appearance")}
        icon="color-palette-outline"
        title="Внешний вид"
        sub="Тема, режим, иконка приложения"
      >
      <Card>
        <Text style={styles.sectionTitle}>Тема</Text>

        {/* Режим темы: Тёмная / Авто / Светлая — меняет вариацию текущего стиля */}
        <View style={styles.themeRowLine}>
          <Ionicons name="sunny-outline" size={20} color={colors.accent} />
          <Text style={styles.themeRowTitle}>Режим темы</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.themeRowSub}>стиль сохраняется</Text>
        </View>
        <View style={styles.modePill}>
          {(
            [
              ["dark", "moon-outline", "Тёмная"],
              ["auto", "contrast", "Авто"],
              ["light", "sunny-outline", "Светлая"],
            ] as Array<[ThemeMode, any, string]>
          ).map(([m, icon, label]) => {
            const autoLocked = m === "auto" && !isSponsor;
            return (
              <PressableScale
                key={m}
                style={[styles.modeSeg, mode === m && styles.modeSegOn, autoLocked && { opacity: 0.6 }]}
                onPress={() => {
                  if (autoLocked) {
                    setBenefitsOpen(true);
                    return;
                  }
                  changeMode(m);
                }}
                accessibilityRole="radio"
                accessibilityLabel={`Режим темы: ${label}${autoLocked ? " — преимущество спонсоров" : ""}`}
                accessibilityState={{ selected: mode === m }}
              >
                <Ionicons name={icon} size={14} color={mode === m ? "#fff" : autoLocked ? colors.textFaint : colors.textDim} />
                <Text style={[styles.modeSegText, mode === m && { color: "#fff" }]}>{label}</Text>
                {autoLocked && (
                  <>
                    <Ionicons name="lock-closed" size={10} color={colors.textFaint} />
                    <SponsorHeart size={9} />
                  </>
                )}
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.themeDivider} />

        {/* Смена темы по времени — преимущество спонсоров */}
        {isSponsor ? (
          <View style={styles.themeRowLine}>
            <Ionicons name="time-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.themeRowTitle}>Смена темы по времени</Text>
              <Text style={styles.themeRowSub}>Светлая днём, тёмная ночью</Text>
            </View>
            <Switch
              value={mode === "auto"}
              onValueChange={(v) => changeMode(v ? "auto" : "dark")}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        ) : (
          <Pressable
            style={styles.themeRowLine}
            onPress={() => setBenefitsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Смена темы по времени — преимущество спонсоров. Нажмите, чтобы узнать подробнее"
          >
            <Ionicons name="time-outline" size={20} color={colors.textFaint} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.themeRowTitle, { color: colors.textDim }]}>Смена темы по времени</Text>
              <Text style={styles.themeRowSub}>Преимущество спонсоров</Text>
            </View>
            <View style={styles.lockWrap}>
              <SponsorHeart size={13} />
              <View style={styles.lockBadge}>
                <Ionicons name="lock-closed" size={14} color="#FF9800" />
              </View>
            </View>
          </Pressable>
        )}
        {mode === "auto" && (
          <View style={{ marginTop: 10 }}>
            <View style={styles.segRow}>
              <PressableScale
                style={[styles.segBtn, scheduleMode === "sun" && styles.segBtnOn]}
                onPress={() => changeScheduleMode("sun")}
              >
                <Ionicons
                  name="sunny-outline"
                  size={15}
                  color={scheduleMode === "sun" ? "#fff" : colors.textDim}
                />
                <Text
                  style={[styles.segBtnText, scheduleMode === "sun" && { color: "#fff" }]}
                >
                  По солнцу
                </Text>
              </PressableScale>
              <PressableScale
                style={[styles.segBtn, scheduleMode === "custom" && styles.segBtnOn]}
                onPress={() => changeScheduleMode("custom")}
              >
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={scheduleMode === "custom" ? "#fff" : colors.textDim}
                />
                <Text
                  style={[styles.segBtnText, scheduleMode === "custom" && { color: "#fff" }]}
                >
                  Своё время
                </Text>
              </PressableScale>
            </View>
            {scheduleMode === "sun" ? (
              <View style={styles.sunRow}>
                <Text style={styles.sunText}>
                  Сегодня: светлая {sunrise}–{sunset}
                </Text>
                <PressableScale style={styles.sunRefreshBtn} onPress={fetchSunTimes} disabled={sunBusy}>
                  {sunBusy ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>
                      Обновить
                    </Text>
                  )}
                </PressableScale>
              </View>
            ) : (
              <View style={styles.timeTilesRow}>
                <View style={styles.timeTile}>
                  <Text style={styles.timeTileLabel}>Светло с</Text>
                  <TextInput
                    style={styles.timeTileInput}
                    value={customRise}
                    onChangeText={(v) => saveTime("theme_custom_rise", v, setCustomRise)}
                    placeholder="07:00"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
                <View style={styles.timeTile}>
                  <Text style={styles.timeTileLabel}>Темно с</Text>
                  <TextInput
                    style={styles.timeTileInput}
                    value={customSet}
                    onChangeText={(v) => saveTime("theme_custom_set", v, setCustomSet)}
                    placeholder="21:00"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.themeDivider} />

        {/* Стиль темы: дропдаун с превью */}
        <View style={styles.themeRowLine}>
          <Ionicons name="color-palette-outline" size={20} color={colors.accent} />
          <Pressable
            onPress={handleStyleTitleTap}
            hitSlop={8}
            style={{ flexShrink: 1 }}
            accessibilityLabel="Стиль темы. Секретная подсказка: пять нажатий открывают скрытую тему"
          >
            <Text style={styles.themeRowTitle}>Стиль темы</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {isFoxcloud ? (
            <View style={styles.styleDropdownBtn}>
              <Ionicons name="sparkles" size={13} color={colors.accent} />
              <Text style={styles.styleDropdownText}>{THEME_LABELS[style]}</Text>
              <Ionicons name="lock-closed" size={12} color={colors.textFaint} />
            </View>
          ) : (
            <PressableScale
              style={styles.styleDropdownBtn}
              onPress={() => setThemeOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Стиль темы: ${THEME_LABELS[style]}. Нажмите, чтобы выбрать`}
            >
              <Ionicons name="sparkles" size={13} color={colors.accent} />
              <Text style={styles.styleDropdownText}>{THEME_LABELS[style]}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.accent} />
            </PressableScale>
          )}
        </View>
        <Text style={styles.hint}>
          {isFoxcloud
            ? "Вход через Telegram — тема FoxCloud закреплена"
            : mode === "auto"
              ? "Светлая вариация включается автоматически по расписанию"
              : "Применяется сразу, без перезагрузки"}
        </Text>

        {themeOpen && <Modal visible={themeOpen} transparent animationType="fade" onRequestClose={() => setThemeOpen(false)}>
          <PressableScale style={styles.modalBackdrop} onPress={() => setThemeOpen(false)}>
            <PressableScale style={styles.stylePanel} onPress={() => {}}>
              <Text style={styles.themeSheetTitle}>Стиль темы</Text>
              {visibleStyles.map((t: ThemeName) => (
                <PressableScale
                  key={t}
                  style={[styles.styleItem, style === t && styles.styleItemOn]}
                  onPress={() => {
                    changeStyle(t);
                    setThemeOpen(false);
                  }}
                >
                  <View style={[styles.stylePreviewBox, style === t && styles.stylePreviewBoxOn]}>
                    <ThemeGlyph t={t} size={16} />
                  </View>
                  <Text
                    style={[
                      styles.styleItemText,
                      style === t && { color: colors.accent, fontWeight: "700" },
                    ]}
                  >
                    {THEME_LABELS[t]}
                  </Text>
                  {SPONSOR_STYLES.includes(t) && (
                    <SponsorHeart size={12} />
                  )}
                  <View style={{ flex: 1 }} />
                  {style === t && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                </PressableScale>
              ))}
              {!isSponsor && (
                <Text style={styles.hint}>
                  Темы с переливающимся сердечком доступны спонсорам (пополнение от 444 ₽ за 24 ч)
                </Text>
              )}
            </PressableScale>
          </PressableScale>
        </Modal>}

        {/* Секретная тема: диалог ввода кода */}
        {codeOpen && <Modal visible={codeOpen} transparent animationType="fade" onRequestClose={() => setCodeOpen(false)}>
          <PressableScale style={styles.modalBackdrop} onPress={() => setCodeOpen(false)}>
            <PressableScale style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Секретная тема</Text>
              <Text style={{ color: colors.textDim, fontSize: 13, textAlign: "center", marginBottom: 14 }}>
                Введите код, чтобы открыть тему «Простой»
              </Text>
              <TextInput
                style={styles.coreInput}
                value={codeInput}
                onChangeText={setCodeInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Код"
                placeholderTextColor={colors.textFaint}
                secureTextEntry
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <PressableScale style={styles.modalBtnGhost} onPress={() => { setCodeOpen(false); setCodeInput(""); }}>
                    <Text style={styles.modalBtnGhostText}>Отмена</Text>
                  </PressableScale>
                </View>
                <View style={{ flex: 1 }}>
                  <PressableScale style={styles.modalBtnPrimary} onPress={submitUnlockCode}>
                    <Text style={styles.modalBtnPrimaryText}>Открыть</Text>
                  </PressableScale>
                </View>
              </View>
            </PressableScale>
          </PressableScale>
        </Modal>}
      </Card>

      {/* Иконка приложения на рабочем столе (как в старом приложении).
          Для Telegram-авторизации (FoxiCloud) спонсорские фичи скрыты. */}
      <Card>
        <Text style={styles.sectionTitle}>Иконка приложения</Text>
        <View style={styles.themeRowLine}>
          <Ionicons name="phone-portrait-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.themeRowTitle}>Иконка на рабочем столе</Text>
            <Text style={styles.themeRowSub}>
              {isSponsor ? "Меняется сразу" : "Преимущество спонсоров"}
            </Text>
          </View>
          {!isSponsor && (
            <View style={styles.lockWrap}>
              <SponsorHeart size={13} />
              <View style={styles.lockBadge}>
                <Ionicons name="lock-closed" size={14} color="#FF9800" />
              </View>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12, opacity: isSponsor ? 1 : 0.55 }}>
          {(
            [
              ["default", "app_icon", "GhostCloud"],
              ["foxcloud", "icon_fox", "FoxCloud"],
            ] as Array<[string, string, string]>
          ).map(([type, preview, label]) => {
            const active = appIcon === type;
            return (
              <PressableScale
                key={type}
                style={[styles.iconOption, active && { borderColor: colors.accent }]}
                onPress={() => changeAppIcon(type as "default" | "foxcloud")}
                accessibilityRole="radio"
                accessibilityLabel={`Иконка приложения: ${label}`}
                accessibilityState={{ selected: active }}
              >
                <Image source={{ uri: preview }} style={styles.iconPreview} resizeMode="cover" />
                <Text style={[styles.iconOptionText, active && { color: colors.accent }]}>{label}</Text>
                {active && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ position: "absolute", top: 6, right: 6 }} />}
              </PressableScale>
            );
          })}
        </View>
        <Text style={styles.hint}>
          На некоторых оболочках подпись под иконкой обновится после возврата на главный экран.
        </Text>
      </Card>
      </SettingsGroup>
      )}

      {/* ─── Группа «VPN и сеть»: ядро, подключение, безопасность, DNS ─── */}
      <SettingsGroup
        open={!!grpOpen.vpn}
        onToggle={() => toggleGroup("vpn")}
        icon="shield-checkmark-outline"
        title="VPN и сеть"
        sub="Ядро, маскировка, Kill Switch, DNS"
      >
      <Card>
        <Text style={styles.sectionTitle}>Ядро VPN</Text>
        {CORES.map((c) => {
          const active = core === c.key;
          const needDownload = !!c.file && !downloaded[c.file];
          const pct = c.file ? progress[c.file] : undefined;
          const busy = pct !== undefined;
          return (
            <PressableScale
              key={c.key}
              disabled={needDownload || busy}
              style={[styles.coreItem, active && styles.coreItemOn, needDownload && { opacity: 0.85 }]}
              onPress={() => changeCore(c.key)}
              accessibilityRole="radio"
              accessibilityLabel={`Ядро ${c.label}${needDownload ? ", не установлено" : ""}`}
              accessibilityState={{ selected: active }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.coreName}>
                  {c.label}
                  {c.key === "xray" && xrayVersion ? (
                    <Text style={styles.coreVersion}> · {xrayVersion}</Text>
                  ) : null}
                  {versions[c.key] ? (
                    <Text style={styles.coreVersion}> · {versions[c.key]}</Text>
                  ) : null}
                </Text>
                <Text style={styles.coreNote}>
                  {c.file
                    ? downloaded[c.file]
                      ? "установлено"
                      : `не установлено · ~${c.mb} МБ`
                    : c.note}
                </Text>
                {busy && (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                )}
              </View>
              {needDownload && !busy && (
                <PressableScale
                  style={styles.downloadBtn}
                  hitSlop={6}
                  onPress={() => setConfirmCore(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Скачать ядро ${c.label}`}
                >
                  <Ionicons name="download" size={18} color="#fff" />
                </PressableScale>
              )}
              {busy && <Text style={styles.progressPct}>{pct}%</Text>}
              {!needDownload && !busy && <View style={[styles.radio, active && styles.radioOn]} />}
            </PressableScale>
          );
        })}
        <Text style={styles.hint}>
          Xray встроен в приложение. Sing-box докачивается с GitLab при первом использовании.
        </Text>

        {/* Маскировка трафика (анти-DPI) — fragment/tlshello ядра Xray */}
        <View style={[styles.themeRowLine, { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={core === "xray" || core === "uwuray" ? colors.accent : colors.textFaint} />
          <View style={{ flex: 1 }}>
            <Text style={styles.themeRowTitle}>Маскировка трафика</Text>
            <Text style={styles.themeRowSub}>
              {core === "xray" || core === "uwuray"
                ? "Дробит TLS-рукопожатие — обход блокировок по DPI"
                : "Только на ядрах Xray/UwuRay"}
            </Text>
          </View>
          <Switch
            value={antiDpi}
            disabled={core !== "xray" && core !== "uwuray"}
            onValueChange={(v) => {
              setAntiDpiState(v);
              setAntiDpi(v);
              Haptics.selectionAsync().catch(() => {});
              showToast(v ? "Маскировка включена — применится при подключении" : "Маскировка выключена", "top");
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
            accessibilityLabel="Маскировка трафика (анти-DPI)"
          />
        </View>
      </Card>

      {/* ─── Подключение ─── */}
      <Card>
        <Text style={styles.sectionTitle}>Подключение</Text>
        <PressableScale
          style={[styles.stopVpnBtn, !vpnRunning && { opacity: 0.45 }]}
          onPress={stopVpnNow}
          disabled={!vpnRunning || stopBusy}
          accessibilityRole="button"
          accessibilityLabel="Мгновенно остановить VPN"
        >
          {stopBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="stop-circle-outline" size={20} color="#fff" />
          )}
          <Text style={styles.stopVpnText}>
            {stopBusy ? "Остановка…" : vpnRunning ? "Мгновенно остановить VPN" : "VPN не подключён"}
          </Text>
        </PressableScale>
        <Text style={styles.hint}>
          Выключает туннель сразу, без ожидания и подтверждения.
        </Text>
      </Card>

      {/* ─── Безопасность и автоподключение ─── */}
      <Card>
        <Text style={styles.sectionTitle}>Безопасность и автоподключение</Text>

        {/* Kill Switch */}
        <View style={styles.themeRowLine}>
          <Ionicons name="shield-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.themeRowTitle}>Kill Switch</Text>
            <Text style={styles.themeRowSub}>
              {killSwitch
                ? "При обрыве туннеля интернет блокируется — трафик не уйдёт напрямую"
                : "При обрыве туннеля трафик пойдёт напрямую (утечка)"}
            </Text>
          </View>
          <Switch
            value={killSwitch}
            onValueChange={(v) => {
              setKillSwitchState(v);
              setKillSwitch(v);
              Haptics.selectionAsync().catch(() => {});
              showToast(v ? "Kill Switch включён — применится при подключении" : "Kill Switch выключен", "top");
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
            accessibilityLabel="Kill Switch — блокировать интернет при обрыве VPN"
          />
        </View>

        {/* Автоподключение при запуске */}
        <View style={[styles.themeRowLine, { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }]}>
          <Ionicons name="play-circle-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.themeRowTitle}>Подключать при запуске</Text>
            <Text style={styles.themeRowSub}>
              VPN включается сам при открытии приложения
            </Text>
          </View>
          <Switch
            value={autoConnect}
            onValueChange={(v) => {
              setAutoConnectState(v);
              setAutoConnect(v);
              Haptics.selectionAsync().catch(() => {});
              showToast(v ? "Автоподключение при запуске включено" : "Автоподключение при запуске выключено", "top");
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
            accessibilityLabel="Автоподключение VPN при запуске приложения"
          />
        </View>

        {/* Автоподключение при загрузке устройства */}
        <View style={[styles.themeRowLine, { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }]}>
          <Ionicons name="power-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.themeRowTitle}>Подключать при загрузке устройства</Text>
            <Text style={styles.themeRowSub}>
              {autoBoot
                ? "После включения телефона VPN поднимется автоматически"
                : "После включения телефона VPN нужно включить вручную"}
            </Text>
          </View>
          <Switch
            value={autoBoot}
            onValueChange={(v) => {
              setAutoBootState(v);
              setAutoConnectBoot(v);
              Haptics.selectionAsync().catch(() => {});
              showToast(v ? "Автоподключение при загрузке включено" : "Автоподключение при загрузке выключено", "top");
            }}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
            accessibilityLabel="Автоподключение VPN при загрузке устройства"
          />
        </View>
        <PressableScale
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingVertical: 6 }}
          onPress={() => openVpnSettings()}
          accessibilityRole="button"
          accessibilityLabel="Открыть системные настройки VPN для включения постоянной VPN"
        >
          <Ionicons name="settings-outline" size={15} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: "600", flex: 1 }}>
            Полная автоматика: включите «Постоянная VPN» в системных настройках — Android будет сам поднимать GhostCloud при загрузке и обрыве, без единого окна
          </Text>
          <Ionicons name="open-outline" size={14} color={colors.accent} />
        </PressableScale>

        {/* Метод проверки пинга */}
        <View style={[styles.themeRowLine, { marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }]}>
          <Ionicons name="speedometer-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.themeRowTitle}>Метод проверки пинга</Text>
            <Text style={styles.themeRowSub}>
              {pingMethod === "url"
                ? "URL-тест: полный протокол через прокси — точнее, но дольше и не работает при включённом VPN"
                : "TCP: рукопожатие с сервером — быстро, работает всегда"}
            </Text>
          </View>
          <PressableScale
            style={styles.styleDropdownBtn}
            onPress={() => setPingOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Метод проверки пинга: ${pingMethod === "url" ? "URL-тест" : "TCP"}. Нажмите, чтобы выбрать`}
          >
            <Text style={styles.styleDropdownText}>{pingMethod === "url" ? "URL-тест" : "TCP"}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.accent} />
          </PressableScale>
        </View>
        <Text style={styles.hint}>
          UDP/ICMP-пинг на Android недоступен приложениям без root — поэтому методы два: TCP и URL-тест.
        </Text>
      </Card>

      {/* Модал выбора метода пинга */}
      {pingOpen && <Modal visible={pingOpen} transparent animationType="fade" onRequestClose={() => setPingOpen(false)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setPingOpen(false)}>
          <PressableScale style={styles.stylePanel} onPress={() => {}}>
            <Text style={styles.themeSheetTitle}>Метод проверки пинга</Text>
            {([
              { key: "tcp" as PingMethod, title: "TCP", sub: "Рукопожатие с портом сервера. Быстро, работает при включённом VPN." },
              { key: "url" as PingMethod, title: "URL-тест", sub: "Полный тест протоколом через прокси (VLESS/REALITY + HTTP 204). Точнее, но дольше; при включённом VPN автоматически используется TCP." },
            ]).map((o) => (
              <PressableScale
                key={o.key}
                style={[styles.styleItem, pingMethod === o.key && styles.styleItemOn]}
                onPress={() => {
                  setPingMethodState(o.key);
                  setPingMethod(o.key);
                  setPingOpen(false);
                  Haptics.selectionAsync().catch(() => {});
                  showToast(o.key === "url" ? "Метод: URL-тест" : "Метод: TCP", "top");
                }}
                accessibilityRole="button"
                accessibilityLabel={`${o.title}: ${o.sub}`}
              >
                <View style={[styles.stylePreviewBox, pingMethod === o.key && styles.stylePreviewBoxOn]}>
                  <Ionicons name={o.key === "url" ? "globe-outline" : "swap-vertical-outline"} size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.styleItemText, pingMethod === o.key && { color: colors.accent, fontWeight: "700" }]}>
                    {o.title}
                  </Text>
                  <Text style={styles.dnsBenefit}>{o.sub}</Text>
                </View>
                {pingMethod === o.key && <Ionicons name="checkmark" size={16} color={colors.accent} />}
              </PressableScale>
            ))}
            <Text style={styles.hint}>
              UDP/ICMP-пинг на Android недоступен приложениям без root — поэтому методы два: TCP и URL-тест.
            </Text>
          </PressableScale>
        </PressableScale>
      </Modal>}

      {/* ─── DNS-серверы (преимущество спонсоров) ───
          FoxCloud (вход через Telegram): скрыто — DNS остаётся «Автоматически». */}
      {!isFoxcloud && (
      <Card>
        <View style={styles.themeRowLine}>
          <Ionicons name="globe-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.themeRowTitle}>DNS-сервер</Text>
            <Text style={styles.themeRowSub} numberOfLines={1}>
              {getDnsProvider(dnsId).name}
            </Text>
          </View>
          {isSponsor ? (
            <PressableScale
              style={styles.styleDropdownBtn}
              onPress={() => setDnsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`DNS-сервер: ${getDnsProvider(dnsId).name}. Нажмите, чтобы выбрать`}
            >
              <Text style={styles.styleDropdownText}>Выбрать</Text>
              <Ionicons name="chevron-down" size={14} color={colors.accent} />
            </PressableScale>
          ) : (
            <PressableScale
              style={styles.lockBadge}
              onPress={() => setBenefitsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Выбор DNS-сервера — преимущество спонсоров. Нажмите, чтобы узнать подробнее"
            >
              <Ionicons name="lock-closed" size={14} color="#FF9800" />
            </PressableScale>
          )}
        </View>
        {!isSponsor && (
          <Text style={styles.hint}>
            Выбор популярных DNS-серверов — преимущество спонсоров
          </Text>
        )}
      </Card>
      )}
      </SettingsGroup>

      {/* ─── Группа «Прочее»: игра, о программе, выход из аккаунта ─── */}
      <SettingsGroup
        open={!!grpOpen.other}
        onToggle={() => toggleGroup("other")}
        icon="apps-outline"
        title="Прочее"
        sub="Игра, о программе, выход из аккаунта"
      >
      <Card>
        <PressableScale
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 }}
          onPress={() => nav.navigate("Game")}
          accessibilityRole="button"
          accessibilityLabel="GhostCloud Run. Мини-игра"
        >
          <Ionicons name="game-controller-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
              GhostCloud Run
            </Text>
            <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 1 }}>
              Мини-игра: собери 500 монет — получи +1 день подписки
            </Text>
          </View>
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>BETA</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </PressableScale>
      </Card>

      <Card>
        <PressableScale
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 }}
          onPress={() => nav.navigate("About")}
          accessibilityRole="button"
          accessibilityLabel="О программе. Проверить обновления и посмотреть версию"
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: "600" }}>
            О программе
          </Text>
          <Text style={{ color: colors.textFaint, fontSize: 12 }}>
            v{Application.nativeApplicationVersion || "?"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </PressableScale>
      </Card>

      {/* Выход из аккаунта (перенесён из профиля) */}
      <Card>
        <PressableScale
          style={styles.logoutRow}
          onPress={() => setLogoutOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Выйти из аккаунта"
        >
          <Ionicons name="log-out-outline" size={18} color="#FF4D4D" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </PressableScale>
      </Card>
      </SettingsGroup>

      {/* Подтверждение выхода из аккаунта */}
      {logoutOpen && <Modal visible={logoutOpen} transparent animationType="fade" onRequestClose={() => setLogoutOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setLogoutOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Выйти из аккаунта?</Text>
            <Text style={styles.modalText}>
              Вы будете перенаправлены на экран входа. Для повторного входа потребуется авторизация.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Button title="Отмена" variant="ghost" onPress={() => setLogoutOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Выйти" variant="danger" onPress={signOut} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>}

      {/* Стилизованное подтверждение загрузки ядра */}
        {confirmCore !== null && <Modal visible={!!confirmCore} transparent animationType="fade" onRequestClose={() => setConfirmCore(null)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setConfirmCore(null)}>
          <PressableScale style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}>
              <Ionicons name="download-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.modalTitle}>
              Скачать ядро {confirmCore?.label}
            </Text>
            <Text style={styles.modalText}>
              Ядро будет скачано с GitLab и установлено в память приложения.
            </Text>
            <View style={styles.modalSizeBadge}>
              <Text style={styles.modalSizeText}>≈ {confirmCore?.mb} МБ на устройстве</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <View style={{ flex: 1 }}>
                <PressableScale style={styles.modalBtnGhost} onPress={() => setConfirmCore(null)}>
                  <Text style={styles.modalBtnGhostText}>Отмена</Text>
                </PressableScale>
              </View>
              <View style={{ flex: 1 }}>
                <PressableScale style={styles.modalBtnPrimary} onPress={() => confirmCore && startDownload(confirmCore)}>
                  <Text style={styles.modalBtnPrimaryText}>Скачать</Text>
                </PressableScale>
              </View>
            </View>
          </PressableScale>
        </PressableScale>
      </Modal>}

      {/* Выбор DNS-сервера (спонсорам) */}
      {dnsOpen && <Modal visible={dnsOpen} transparent animationType="fade" onRequestClose={() => setDnsOpen(false)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setDnsOpen(false)}>
          <PressableScale style={styles.stylePanel} onPress={() => {}}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <SponsorHeart size={16} />
              <Text style={styles.themeSheetTitle}>DNS-сервер</Text>
            </View>
            {DNS_PROVIDERS.map((p) => (
              <PressableScale
                key={p.id}
                style={[styles.styleItem, dnsId === p.id && styles.styleItemOn]}
                onPress={() => {
                  changeDns(p.id);
                  setDnsOpen(false);
                }}
              >
                <View style={[styles.stylePreviewBox, dnsId === p.id && styles.stylePreviewBoxOn]}>
                  <Ionicons name="globe-outline" size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.styleItemText,
                      dnsId === p.id && { color: colors.accent, fontWeight: "700" },
                    ]}
                  >
                    {p.name}
                  </Text>
                  <Text style={styles.dnsBenefit}>{p.benefit}</Text>
                </View>
                {dnsId === p.id && <Ionicons name="checkmark" size={16} color={colors.accent} />}
              </PressableScale>
            ))}
            <Text style={styles.hint}>
              DNS-запросы шифруются (DoH), когда это поддерживает сервер. Применяется при подключении.
            </Text>
          </PressableScale>
        </PressableScale>
      </Modal>}

      {/* Шторка преимуществ спонсора */}
      {benefitsOpen && <SponsorBenefitsSheet visible={benefitsOpen} onClose={() => setBenefitsOpen(false)} />}
    </Screen>
  );
}

function AlertFallback(msg: string) {
  // Ошибки загрузки ядра показываем пользователю через тост
  showToast(msg);
}

function themeIcon(t: ThemeName): any {
  switch (t) {
    case "default": return "sparkles-outline";
    case "minimalist": return "brightness-2-outline";
    case "v2ray": return "hub-outline";
    case "glass": return "blur-on-outline";
    case "foxcloud": return "flame-outline";
    case "pickme": return "heart-outline";
    case "happ": return "sunny-sharp";
    default: return "sparkles-outline";
  }
}

/** Специальные PNG-иконки тем — как в списке выбора темы Flutter-версии */
function themeIconAsset(t: ThemeName): string | null {
  switch (t) {
    case "default": return "theme_default";
    case "glass": return "theme_liquid";
    case "minimalist": return "theme_minimal";
    case "pickme": return "theme_pickme";
    case "v2ray": return "theme_v2ray";
    case "happ": return "theme_happ";
    default: return null;
  }
}

function ThemeGlyph({ t, size = 18 }: { t: ThemeName; size?: number }) {
  const asset = themeIconAsset(t);
  if (asset) {
    return <Image source={{ uri: asset }} style={{ width: size, height: size, borderRadius: 5 }} resizeMode="cover" />;
  }
  return <Ionicons name={themeIcon(t)} size={size} color={colors.accent} />;
}

/** Сворачиваемая группа настроек: заголовок-карточка + содержимое (дочерние
 *  карточки рендерятся под ним без лишней рамки, чтобы не было «карточки в карточке»). */
function SettingsGroup({
  open,
  onToggle,
  icon,
  title,
  sub,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const styles = makeStyles();
  return (
    <>
      <PressableScale
        style={styles.groupHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${title}${sub ? ` — ${sub}` : ""}`}
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name={icon} size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.groupTitle}>{title}</Text>
          {!open && sub ? (
            <Text style={styles.groupSub} numberOfLines={1}>{sub}</Text>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textFaint} />
      </PressableScale>
      {open ? children : null}
    </>
  );
}

const makeStyles = () => StyleSheet.create({
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 10,
  },
  logoutText: {
    color: "#FF4D4D",
    fontSize: 14,
    fontWeight: "700",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  groupTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  groupSub: {
    color: colors.textFaint,
    fontSize: 11.5,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 12,
  },
  themeRowLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  themeRowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
    marginLeft: 2,
  },
  themeRowSub: {
    color: colors.textDim,
    fontSize: 12,
    opacity: 0.8,
    marginTop: 1,
    marginLeft: 2,
  },
  scheduleNote: {
    color: colors.textFaint,
    fontSize: 11,
    marginLeft: 4,
    flex: 1,
    textAlign: "right",
  },
  modePill: {
    flexDirection: "row",
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  modeSeg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  modeSegOn: { backgroundColor: colors.accentDeep },
  modeSegText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  themeDivider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.5,
    marginVertical: 14,
  },
  lockWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lockBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FF980026",
    borderWidth: 1,
    borderColor: "#FF980059",
    alignItems: "center",
    justifyContent: "center",
  },
  iconOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 8,
    alignItems: "center",
    gap: 6,
  },
  iconPreview: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  iconOptionText: { fontSize: 12, fontWeight: "600", color: colors.textDim },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtnOn: { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep },
  segBtnText: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  sunRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  sunText: { color: colors.textDim, fontSize: 13 },
  sunRefreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  timeTilesRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  timeTile: {
    flex: 1,
    backgroundColor: colors.bgSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  timeTileLabel: { color: colors.textDim, fontSize: 11, marginBottom: 3 },
  timeTileInput: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: "700",
    padding: 0,
  },
  styleDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderWidth: 0.8,
    borderColor: colors.accent + "4D",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  styleDropdownText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  stylePanel: {
    width: "100%",
    backgroundColor: sheetSurfaceBg(),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    maxHeight: "75%",
  },
  themeSheetTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  styleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  styleItemOn: { backgroundColor: colors.accentSoft },
  stylePreviewBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.bgSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stylePreviewBoxOn: { backgroundColor: colors.accentSoft },
  styleItemText: {
    fontWeight: "500",
    fontSize: 14,
    color: colors.text,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 10,
  },
  dnsBenefit: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
    opacity: 0.85,
  },
  stopVpnBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.red,
  },
  stopVpnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  coreItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
    marginBottom: 8,
  },
  coreItemOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  coreName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  coreVersion: {
    color: colors.textFaint,
    fontWeight: "500",
    fontSize: 12,
  },
  coreNote: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 4,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.card,
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressPct: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    width: 42,
    textAlign: "right",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: sheetSurfaceBg(),
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: "center",
  },
  coreInput: {
    width: "100%",
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
    marginBottom: 14,
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  modalText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  modalSizeBadge: {
    marginTop: 12,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  modalSizeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  modalBtnGhost: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnGhostText: {
    color: colors.textDim,
    fontWeight: "700",
    fontSize: 14,
  },
  modalBtnPrimary: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: colors.accentDeep,
  },
  modalBtnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
