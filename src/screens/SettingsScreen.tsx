import React, { useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import * as Haptics from "expo-haptics";
import { Card, Row, Screen, Title } from "../components/UI";
import { PressableScale } from "../components/PressableScale";
import {
  colors,
  THEME_LABELS,
  THEME_ORDER,
  isFlutterStyleTheme,
  themeUsesMode,
  withAlpha,
  useTheme,
  useThemeSwitcher,
  type ThemeName,
} from "../theme";
import {
  getSelectedCore,
  getSetting,
  getThemeMode,
  getThemeName,
  setSetting,
  setThemeMode,
  type CoreName,
  type ThemeMode,
} from "../settings";
import { getLauncherIcon, restartApp, setLauncherIcon, type AppIcon } from "../appIcon";
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

const ICONS: Array<{ key: AppIcon; label: string; source: any }> = [
  { key: "ghostcloud", label: "GhostCloud", source: require("../../assets/icon.png") },
  { key: "ghostvpn", label: "GhostVPN", source: require("../../assets/ghostvpn-icon.png") },
];

export default function SettingsScreen() {
  useTheme();
  const styles = makeStyles();
  const switchTheme = useThemeSwitcher();
  const [theme, setTheme] = useState<ThemeName>(getThemeName());
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const [appIcon, setAppIcon] = useState<AppIcon>(getLauncherIcon());
  const [core, setCore] = useState<CoreName>(getSelectedCore());
  const [xrayVersion, setXrayVersion] = useState("");
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [confirmCore, setConfirmCore] = useState<(typeof CORES)[number] | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [sunrise, setSunrise] = useState(getSetting("theme_sunrise", "06:00"));
  const [sunset, setSunset] = useState(getSetting("theme_sunset", "20:00"));

  const saveTime = (key: string, value: string, setter: (v: string) => void) => {
    const clean = value.replace(/[^\d:]/g, "").slice(0, 5);
    setter(clean);
    if (/^\d{2}:\d{2}$/.test(clean)) setSetting(key, clean);
  };

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

  const changeTheme = (next: ThemeName) => {
    setTheme(next);
    setSetting("theme", next);
    switchTheme(next);
  };

  const changeMode = (next: ThemeMode) => {
    setMode(next);
    setThemeMode(next);
    switchTheme(theme); // перерисовать с учётом нового режима
  };

  const changeAppIcon = (next: AppIcon) => {
    if (next === appIcon) return;
    Alert.alert(
      "Смена иконки",
      next === "ghostvpn"
        ? "Иконка GhostVPN будет установлена. Приложение перезапустится."
        : "Стандартная иконка GhostCloud будет восстановлена. Приложение перезапустится.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Применить",
          onPress: () => {
            if (!setLauncherIcon(next)) {
              Alert.alert("Ошибка", "Не удалось сменить иконку");
              return;
            }
            setAppIcon(next);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            Alert.alert(
              "Иконка применена",
              "Лаунчер обновит иконку после перезапуска приложения.",
              [{ text: "Перезапустить", onPress: () => restartApp() }]
            );
          },
        },
      ]
    );
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
    <Screen style={{ paddingTop: 64 }}>
      <Title>Настройки</Title>

      <Card>
        <Text style={styles.sectionTitle}>Тема оформления</Text>
        <PressableScale style={styles.dropdown} onPress={() => setThemeOpen(true)}>
          <Ionicons
            name={themeIcon(theme)}
            size={18}
            color={colors.accent}
          />
          <Text style={[styles.dropdownText, { color: colors.text }]}>{THEME_LABELS[theme]}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textDim} />
        </PressableScale>

        {themeUsesMode(theme) && (
          <View style={styles.modeRow}>
            {(
              [
                { key: "auto", label: "Авто", icon: "time-outline" },
                { key: "light", label: "Светлая", icon: "sunny-outline" },
                { key: "dark", label: "Тёмная", icon: "moon-outline" },
              ] as Array<{ key: ThemeMode; label: string; icon: any }>
            ).map((m) => (
              <PressableScale
                key={m.key}
                style={[styles.modeBtn, mode === m.key && styles.modeBtnOn]}
                onPress={() => changeMode(m.key)}
              >
                <Ionicons
                  name={m.icon}
                  size={15}
                  color={mode === m.key ? colors.accent : colors.textDim}
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: mode === m.key ? colors.accent : colors.textDim },
                  ]}
                >
                  {m.label}
                </Text>
              </PressableScale>
            ))}
          </View>
        )}

        {(theme === "auto" || (themeUsesMode(theme) && mode === "auto")) && (
          <View style={styles.autoRow}>
            <Text style={styles.autoLabel}>Светлая с</Text>
            <TextInput
              style={styles.autoInput}
              value={sunrise}
              onChangeText={(v) => saveTime("theme_sunrise", v, setSunrise)}
              placeholder="06:00"
              placeholderTextColor={colors.textFaint}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
            <Text style={styles.autoLabel}>до</Text>
            <TextInput
              style={styles.autoInput}
              value={sunset}
              onChangeText={(v) => saveTime("theme_sunset", v, setSunset)}
              placeholder="20:00"
              placeholderTextColor={colors.textFaint}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        )}
        <Text style={styles.hint}>
          {theme === "auto" || (themeUsesMode(theme) && mode === "auto")
            ? "Светлая тема включается автоматически в выбранное время"
            : themeUsesMode(theme)
              ? "Стандартная тема поддерживает светлый и тёмный варианты"
              : "Тема применяется сразу, без перезагрузки"}
        </Text>

        <Modal visible={themeOpen} transparent animationType="fade" onRequestClose={() => setThemeOpen(false)}>
          <PressableScale style={styles.modalBackdrop} onPress={() => setThemeOpen(false)}>
            <PressableScale style={styles.themeSheet} onPress={() => {}}>
              <Text style={styles.themeSheetTitle}>Тема оформления</Text>
              {THEME_ORDER.map((t: ThemeName) => (
                <PressableScale
                  key={t}
                  style={[styles.themeOption, theme === t && styles.themeOptionOn]}
                  onPress={() => {
                    changeTheme(t);
                    setThemeOpen(false);
                  }}
                >
                  <Ionicons name={themeIcon(t)} size={18} color={theme === t ? colors.accent : colors.textDim} />
                  <Text style={[styles.themeOptionText, { color: theme === t ? colors.accent : colors.text }]}>
                    {THEME_LABELS[t]}
                  </Text>
                  <View style={[styles.radio, theme === t && styles.radioOn]} />
                </PressableScale>
              ))}
            </PressableScale>
          </PressableScale>
        </Modal>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Иконка на рабочем столе</Text>
        <View style={styles.iconRow}>
          {ICONS.map((ic) => {
            const active = appIcon === ic.key;
            return (
              <PressableScale
                key={ic.key}
                style={[styles.iconChoice, active && styles.iconChoiceOn]}
                onPress={() => changeAppIcon(ic.key)}
              >
                <Image source={ic.source} style={styles.iconPreview} resizeMode="contain" />
                <Text
                  style={[styles.iconChoiceText, { color: active ? colors.accent : colors.text }]}
                >
                  {ic.label}
                </Text>
                <View style={[styles.radio, active && styles.radioOn]} />
              </PressableScale>
            );
          })}
        </View>
        <Text style={styles.hint}>
          На некоторых оболочках иконка обновится после возврата на главный экран.
        </Text>
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
                >
                  <Text style={styles.downloadBtnText}>↓</Text>
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
              <Text style={{ fontSize: 30 }}>⬇️</Text>
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
  // простая заглушка ошибки через консоль — ошибки загрузки показываются в UI прогресса
  console.warn("core download:", msg);
}

function themeIcon(t: ThemeName): any {
  switch (t) {
    case "standard": return "sparkles-outline";
    case "standardOld": return "palette-outline" as any;
    case "auto": return "time-outline";
    case "light": return "sunny-outline";
    case "dark": return "moon-outline";
    case "default": return "sparkles-outline";
    case "minimalist": return "brightness-2-outline";
    case "v2ray": return "hub-outline";
    case "glass": return "blur-on-outline";
    case "foxcloud": return "local-fire-department-outline" as any;
    case "pickme": return "heart-outline";
    case "happ": return "sunny-sharp";
    default: return "sparkles-outline";
  }
}

const makeStyles = () => {
  const fl = isFlutterStyleTheme();
  return StyleSheet.create({
  sectionTitle: fl
    ? {
        color: withAlpha(colors.accent, 0.85),
        fontWeight: "600",
        fontSize: 13,
        letterSpacing: 0.5,
        marginBottom: 8,
      }
    : {
        color: colors.text,
        fontWeight: "800",
        fontSize: 15,
        marginBottom: 12,
      },
  themeRow: {
    flexDirection: "row",
    gap: 8,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgSoft,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: {
    flex: 1,
    fontWeight: "700",
    fontSize: 15,
  },
  themeSheet: {
    width: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    maxHeight: "75%",
  },
  themeSheetTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  themeOptionOn: {
    backgroundColor: colors.accentSoft,
  },
  themeOptionText: {
    flex: 1,
    fontWeight: "600",
    fontSize: 15,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  modeBtnOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  modeBtnText: {
    fontWeight: "700",
    fontSize: 13,
  },
  iconRow: {
    flexDirection: "row",
    gap: 10,
  },
  iconChoice: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  iconChoiceOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  iconPreview: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  iconChoiceText: {
    fontWeight: "700",
    fontSize: 13,
  },
  autoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  autoLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  autoInput: {
    backgroundColor: colors.bgSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    width: 64,
    textAlign: "center",
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
};
