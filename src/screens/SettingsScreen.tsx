import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Updates from "expo-updates";
import * as Application from "expo-application";
import { Button, Card, Row, Screen, Title } from "../components/UI";
import { colors } from "../theme";
import { getSelectedCore, getThemeName, setSetting, type CoreName, type ThemeName } from "../settings";
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
  { key: "sing-box", label: "Sing-box", file: "libsingbox.so", lib: "singbox", note: "докачивается · + Hysteria2", mb: 36 },
  { key: "mihomo", label: "Mihomo", file: "libclash.so", lib: "mihomo", note: "докачивается · все протоколы", mb: 53 },
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

export default function SettingsScreen() {
  const [theme, setTheme] = useState<ThemeName>(getThemeName());
  const [core, setCore] = useState<CoreName>(getSelectedCore());
  const [xrayVersion, setXrayVersion] = useState("");
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});

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
    if (next === theme) return;
    Alert.alert("Сменить тему", "Приложение перезагрузится, чтобы применить тему", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Продолжить",
        style: "default",
        onPress: () => {
          setSetting("theme", next);
          Updates.reloadAsync().catch(() => {});
        },
      },
    ]);
  };

  const changeCore = (next: CoreName) => {
    const meta = CORES.find((c) => c.key === next);
    if (meta?.file && !downloaded[meta.file]) return;
    setCore(next);
    setSetting("core", next);
    // Ядро загружается в процесс один раз — перезагружаем для чистого состояния
    if (next !== "xray") {
      Alert.alert("Ядро выбрано", "Перезагрузить приложение для применения?", [
        { text: "Позже", style: "cancel" },
        { text: "Перезагрузить", onPress: () => Updates.reloadAsync().catch(() => {}) },
      ]);
    }
  };

  const downloadCoreFile = (c: (typeof CORES)[number]) => {
    if (!c.lib || !c.file) return;
    const lib: "mihomo" | "singbox" = c.lib;
    const abi = getCpuAbi();
    Alert.alert(
      `Скачать ядро ${c.label}`,
      `Ядро будет скачано с GitHub и установлено в память приложения. Учтите: это займёт около ${c.mb} МБ на устройстве.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Скачать",
          onPress: async () => {
            setProgress((p) => ({ ...p, [c.file]: 0 }));
            try {
              const meta = (await fetchCoreMeta(c.key, abi)) || FALLBACK[c.key]?.[abi];
              if (!meta) throw new Error("Не удалось получить данные ядра");
              await downloadCore(c.file, meta.url, meta.sha256, meta.size);
              setDownloaded((d) => ({ ...d, [c.file]: true }));
              const v = await loadLibCore(lib).catch(() => "");
              if (v) setVersions((vv) => ({ ...vv, [c.key]: v }));
              Alert.alert("Готово", `Ядро ${c.label} установлено`);
            } catch (e: any) {
              Alert.alert("Ошибка", e?.message || "Не удалось скачать ядро");
            } finally {
              setProgress((p) => {
                const n = { ...p };
                delete n[c.file];
                return n;
              });
            }
          },
        },
      ]
    );
  };

  return (
    <Screen style={{ paddingTop: 64 }}>
      <Title>Настройки</Title>

      <Card>
        <Text style={styles.sectionTitle}>Тема оформления</Text>
        <View style={styles.themeRow}>
          {(["dark", "light"] as ThemeName[]).map((t) => (
            <Pressable
              key={t}
              style={[styles.themeBtn, theme === t && styles.themeBtnOn]}
              onPress={() => changeTheme(t)}
            >
              <Text style={[styles.themeBtnText, theme === t && { color: "#fff" }]}>
                {t === "dark" ? "Тёмная" : "Светлая"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          {theme === getThemeName()
            ? "Текущая тема применяется при запуске приложения"
            : "Изменения применятся после перезагрузки приложения"}
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Ядро VPN</Text>
        {CORES.map((c) => {
          const active = core === c.key;
          const needDownload = !!c.file && !downloaded[c.file];
          const busy = c.file ? progress[c.file] !== undefined : false;
          return (
            <View key={c.key}>
              <Pressable
                disabled={needDownload || busy}
                style={[styles.coreItem, active && styles.coreItemOn, needDownload && { opacity: 0.5 }]}
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
                        : "не установлено"
                      : c.note}
                  </Text>
                </View>
                <View style={[styles.radio, active && styles.radioOn]} />
              </Pressable>

              {c.file && needDownload && (
                <View style={{ marginBottom: 8 }}>
                  {busy ? (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress[c.file] || 0}%` }]} />
                      </View>
                      <Text style={styles.progressText}>Загрузка… {progress[c.file] || 0}%</Text>
                    </View>
                  ) : (
                    <Button
                      title={`Скачать ядро ${c.label} (~${c.mb} МБ)`}
                      variant="ghost"
                      onPress={() => downloadCoreFile(c)}
                    />
                  )}
                </View>
              )}
            </View>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 12,
  },
  themeRow: {
    flexDirection: "row",
    gap: 10,
  },
  themeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  themeBtnOn: {
    backgroundColor: colors.accentDeep,
    borderColor: colors.accent,
  },
  themeBtnText: {
    color: colors.textDim,
    fontWeight: "700",
    fontSize: 14,
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
  progressWrap: {
    paddingHorizontal: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  progressText: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
  },
});
