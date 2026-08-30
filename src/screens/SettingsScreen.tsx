import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import * as Haptics from "expo-haptics";
import { Card, Row, Screen, Title, useScreenTopPad } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import { showToast } from "../components/Toast";
import { useApp } from "../context";
import { colors, THEME_LABELS, THEME_ORDER, SIMPLE_UNLOCK_CODE, useTheme, useThemeSwitcher, type ThemeName } from "../theme";
import { getSelectedCore, getSetting, getThemeName, getThemeMode, setSetting, type CoreName, type ThemeMode } from "../settings";
import {
  downloadCore,
  getCpuAbi,
  getCoreStatus,
  getXrayVersion,
  loadLibCore,
  onCoreDownloadProgress,
} from "../vpn/native";

const CORES_REPO_MANIFEST = "https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/manifest.json";

const CORES: Array<{ key: CoreName; label: string; file: string; lib: "mihomo" | "singbox" | null; note: string; mb: number }> = [
  { key: "xray", label: "Xray", file: "", lib: null, note: "встроен · VLESS, VMess, Trojan, SS", mb: 0 },
  { key: "sing-box", label: "Sing-box", file: "libsingbox.so", lib: "singbox", note: "+ Hysteria2", mb: 36 },
  { key: "mihomo", label: "Mihomo", file: "libclash.so", lib: "mihomo", note: "все протоколы", mb: 53 },
];

// Фолбэк, если манифест недоступен
const FALLBACK: Record<string, Record<string, { url: string; sha256: string; size: number }>> = {
  "sing-box": {
    "arm64-v8a": {
      url: "https://github.com/instant992/ghostcloudcore_new/raw/main/cores/sing-box-2/arm64-v8a/libsingbox.so",
      sha256: "4e2c79b5b1d721ba957afd9815868f95439e7e1ea989cfded49de09f234ff286",
      size: 35185576,
    },
    "armeabi-v7a": {
      url: "https://github.com/instant992/ghostcloudcore_new/raw/main/cores/sing-box-2/armeabi-v7a/libsingbox.so",
      sha256: "e775d76a702a90e0d0285d07bcb388d09d9fab0b199afbff793aed7f07509a65",
      size: 33308520,
    },
    x86_64: {
      url: "https://github.com/instant992/ghostcloudcore_new/raw/main/cores/sing-box-2/x86_64/libsingbox.so",
      sha256: "100ce32a90b74f98156ad3406ee099ff6359188c1042efa4917c420b385d40e3",
      size: 37628544,
    },
  },
  mihomo: {
    "arm64-v8a": {
      url: "https://github.com/instant992/ghostcloudcore_new/raw/main/cores/mihomo-2/arm64-v8a/libclash.so",
      sha256: "1b2525cbe98835f988a1d12720662398d2e670136a449e72ce7af70cc6893609",
      size: 53232248,
    },
    "armeabi-v7a": {
      url: "https://github.com/instant992/ghostcloudcore_new/raw/main/cores/mihomo-2/armeabi-v7a/libclash.so",
      sha256: "8d4d9a0b01a208faaf4544c41967297461728723b8185b1986a2e49108eb6fd9",
      size: 50100396,
    },
    x86_64: {
      url: "https://github.com/instant992/ghostcloudcore_new/raw/main/cores/mihomo-2/x86_64/libclash.so",
      sha256: "2c43e6ee318f5e5b0ae7e253ff954764f3c58fbfceadb5c05424f73d529867d8",
      size: 57588760,
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
      url: `https://github.com/instant992/ghostcloudcore_new/raw/main/${file.path}`,
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
  const { me } = useApp();
  const [style, setStyle] = useState<ThemeName>(getThemeName());
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const [core, setCore] = useState<CoreName>(getSelectedCore());
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
      "libclash.so": getCoreStatus("libclash.so").downloaded,
      "libsingbox.so": getCoreStatus("libsingbox.so").downloaded,
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
    if (simpleUnlocked) return;
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
    setCore(next);
    setSetting("core", next);
  };

  const startDownload = (c: (typeof CORES)[number]) => {
    const lib: "mihomo" | "singbox" = c.lib as any;
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
          ).map(([m, icon, label]) => (
            <PressableScale
              key={m}
              style={[styles.modeSeg, mode === m && styles.modeSegOn]}
              onPress={() => changeMode(m)}
              accessibilityRole="radio"
              accessibilityLabel={`Режим темы: ${label}`}
              accessibilityState={{ selected: mode === m }}
            >
              <Ionicons name={icon} size={14} color={mode === m ? "#fff" : colors.textDim} />
              <Text style={[styles.modeSegText, mode === m && { color: "#fff" }]}>{label}</Text>
            </PressableScale>
          ))}
        </View>

        <View style={styles.themeDivider} />

        {/* Смена темы по времени */}
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
        </View>
        <Text style={styles.hint}>
          {mode === "auto"
            ? "Светлая вариация включается автоматически по расписанию"
            : "Применяется сразу, без перезагрузки"}
        </Text>

        <Modal visible={themeOpen} transparent animationType="fade" onRequestClose={() => setThemeOpen(false)}>
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
                    <Ionicons name="heart" size={12} color="#FF5F93" />
                  )}
                  <View style={{ flex: 1 }} />
                  {style === t && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                </PressableScale>
              ))}
              {!isSponsor && (
                <Text style={styles.hint}>
                  Темы со значком ♥ доступны спонсорам (пополнение от 444 ₽ за 24 ч)
                </Text>
              )}
            </PressableScale>
          </PressableScale>
        </Modal>

        {/* Секретная тема: диалог ввода кода */}
        <Modal visible={codeOpen} transparent animationType="fade" onRequestClose={() => setCodeOpen(false)}>
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
        </Modal>
      </Card>

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
          Xray встроен в приложение. Sing-box и Mihomo докачиваются с GitHub при первом использовании.
        </Text>
      </Card>

      <Card>
        <Row label="Версия приложения" value={`${Application.nativeApplicationVersion || "?"} (${Application.nativeBuildVersion || "?"})`} />
        {!!xrayVersion && <Row label="Ядро Xray" value={xrayVersion} />}
      </Card>

      {/* Стилизованное подтверждение загрузки ядра */}
      <Modal visible={!!confirmCore} transparent animationType="fade" onRequestClose={() => setConfirmCore(null)}>
        <PressableScale style={styles.modalBackdrop} onPress={() => setConfirmCore(null)}>
          <PressableScale style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalIcon}>
              <Ionicons name="download-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.modalTitle}>
              Скачать ядро {confirmCore?.label}
            </Text>
            <Text style={styles.modalText}>
              Ядро будет скачано с GitHub и установлено в память приложения.
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
      </Modal>
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

const makeStyles = () => StyleSheet.create({
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
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
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
