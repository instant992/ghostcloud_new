import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Updates from "expo-updates";
import * as Application from "expo-application";
import { Button, Card, Row, Screen, Title } from "../components/UI";
import { colors } from "../theme";
import { getSelectedCore, getThemeName, setSetting, type CoreName, type ThemeName } from "../settings";
import { getCoreVersion, getXrayVersion } from "../vpn/native";

const CORES: Array<{ key: CoreName; label: string; note: string }> = [
  { key: "xray", label: "Xray", note: "встроен · VLESS, VMess, Trojan, SS" },
  { key: "sing-box", label: "Sing-box", note: "встроен · + Hysteria2" },
  { key: "mihomo", label: "Mihomo", note: "скоро" },
];

export default function SettingsScreen() {
  const [theme, setTheme] = useState<ThemeName>(getThemeName());
  const [core, setCore] = useState<CoreName>(getSelectedCore());
  const [versions, setVersions] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [sb, xr] = await Promise.all([
        getCoreVersion("libsingbox.so"),
        Promise.resolve(getXrayVersion()),
      ]);
      setVersions({ "sing-box": sb, xray: xr });
    })();
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
    if (next === "mihomo") return;
    setCore(next);
    setSetting("core", next);
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
          const disabled = c.key === "mihomo";
          return (
            <Pressable
              key={c.key}
              disabled={disabled}
              style={[styles.coreItem, active && styles.coreItemOn, disabled && { opacity: 0.45 }]}
              onPress={() => changeCore(c.key)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.coreName}>
                  {c.label}
                  {versions[c.key] ? <Text style={styles.coreVersion}> · {versions[c.key]}</Text> : null}
                </Text>
                <Text style={styles.coreNote}>{c.note}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioOn]} />
            </Pressable>
          );
        })}
        <Text style={styles.hint}>
          Ядро используется при следующем подключении. Sing-box нужен для серверов Hysteria2.
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
});
