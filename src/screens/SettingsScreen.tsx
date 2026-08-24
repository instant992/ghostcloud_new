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
  getCoreVersion,
  getXrayVersion,
  loadMihomoCore,
  onCoreDownloadProgress,
} from "../vpn/native";

const CORES_REPO_MANIFEST = "https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/manifest.json";

const CORES: Array<{ key: CoreName; label: string; note: string }> = [
  { key: "xray", label: "Xray", note: "встроен · VLESS, VMess, Trojan, SS" },
  { key: "sing-box", label: "Sing-box", note: "встроен · + Hysteria2" },
  { key: "mihomo", label: "Mihomo", note: "скачивается с GitHub · все протоколы" },
];

const MIHOMO_FALLBACK: Record<string, { url: string; sha256: string; size: number }> = {
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
  "x86_64": {
    url: "https://github.com/instant992/ghostcloudcore_new/raw/main/cores/mihomo-2/x86_64/libclash.so",
    sha256: "2c43e6ee318f5e5b0ae7e253ff954764f3c58fbfceadb5c05424f73d529867d8",
    size: 57588760,
  },
};

type MihomoMeta = { url: string; sha256: string; size: number; version: string };

async function fetchMihomoMeta(abi: string): Promise<MihomoMeta | null> {
  try {
    const res = await fetch(CORES_REPO_MANIFEST);
    const manifest = await res.json();
    const core = manifest?.cores?.mihomo;
    const file = core?.files?.[abi];
    if (!file?.path) return null;
    return {
      url: `https://github.com/instant992/ghostcloudcore_new/raw/main/${file.path}`,
      sha256: String(file.sha256 || ""),
      size: Number(file.size || 0),
      version: String(core.version || ""),
    };
  } catch {
    return null;
  }
}

export default function SettingsScreen() {
  const [theme, setTheme] = useState<ThemeName>(getThemeName());
  const [core, setCore] = useState<CoreName>(getSelectedCore());
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [mihomoDownloaded, setMihomoDownloaded] = useState(false);
  const [mihomoProgress, setMihomoProgress] = useState<number | null>(null);
  const [mihomoVersion, setMihomoVersion] = useState("");

  useEffect(() => {
    (async () => {
      const [sb, xr] = await Promise.all([
        getCoreVersion("libsingbox.so"),
        Promise.resolve(getXrayVersion()),
      ]);
      setVersions({ "sing-box": sb, xray: xr });
      const status = getCoreStatus("libclash.so");
      setMihomoDownloaded(status.downloaded);
      if (status.downloaded) {
        loadMihomoCore()
          .then((v) => setMihomoVersion(v))
          .catch(() => {});
      }
    })();
    const off = onCoreDownloadProgress((e) => {
      if (e.name === "libclash.so") setMihomoProgress(e.progress);
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
    if (next === "mihomo" && !mihomoDownloaded) return;
    setCore(next);
    setSetting("core", next);
  };

  const downloadMihomo = () => {
    const abi = getCpuAbi();
    Alert.alert(
      "Скачать ядро Mihomo",
      "Ядро будет скачано с GitHub и установлено в память приложения. Учтите: это займёт около 55–60 МБ на устройстве.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Скачать",
          onPress: async () => {
            setMihomoProgress(0);
            try {
              const meta = (await fetchMihomoMeta(abi)) || MIHOMO_FALLBACK[abi];
              if (!meta) throw new Error("Не удалось получить данные ядра");
              await downloadCore("libclash.so", meta.url, meta.sha256, meta.size);
              setMihomoDownloaded(true);
              const v = await loadMihomoCore().catch(() => "");
              setMihomoVersion(v);
              Alert.alert("Готово", "Ядро Mihomo установлено");
            } catch (e: any) {
              Alert.alert("Ошибка", e?.message || "Не удалось скачать ядро");
            } finally {
              setMihomoProgress(null);
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
          const isMihomo = c.key === "mihomo";
          const disabled = isMihomo && !mihomoDownloaded;
          return (
            <View key={c.key}>
              <Pressable
                disabled={disabled || mihomoProgress !== null}
                style={[styles.coreItem, active && styles.coreItemOn, disabled && { opacity: 0.5 }]}
                onPress={() => changeCore(c.key)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.coreName}>
                    {c.label}
                    {c.key === "xray" && versions.xray ? (
                      <Text style={styles.coreVersion}> · {versions.xray}</Text>
                    ) : null}
                    {c.key === "sing-box" && versions["sing-box"] ? (
                      <Text style={styles.coreVersion}> · {versions["sing-box"]}</Text>
                    ) : null}
                    {isMihomo && mihomoVersion ? (
                      <Text style={styles.coreVersion}> · {mihomoVersion}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.coreNote}>
                    {isMihomo
                      ? mihomoDownloaded
                        ? "установлено"
                        : "не установлено"
                      : c.note}
                  </Text>
                </View>
                <View style={[styles.radio, active && styles.radioOn]} />
              </Pressable>

              {isMihomo && !mihomoDownloaded && (
                <View style={{ marginBottom: 8 }}>
                  {mihomoProgress === null ? (
                    <Button title="Скачать ядро Mihomo (~55 МБ)" variant="ghost" onPress={downloadMihomo} />
                  ) : (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${mihomoProgress}%` }]} />
                      </View>
                      <Text style={styles.progressText}>Загрузка… {mihomoProgress}%</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
        <Text style={styles.hint}>
          Ядро используется при следующем подключении. Sing-box и Mihomo нужны для серверов Hysteria2.
        </Text>
      </Card>

      <Card>
        <Row label="Версия приложения" value={`${Application.nativeApplicationVersion || "?"} (${Application.nativeBuildVersion || "?"})`} />
        {!!getXrayVersion() && <Row label="Ядро Xray" value={getXrayVersion()} />}
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
