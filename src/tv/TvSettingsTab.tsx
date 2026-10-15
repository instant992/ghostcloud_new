import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import { useApp } from "../context";
import { getAutoConnect, getKillSwitch, getPingMethod, setAutoConnect, setKillSwitch, setPingMethod, type PingMethod } from "../settings";
import { selectCore, getXrayVersion, getCoreStatus, getCpuAbi, downloadXrayJoly } from "../vpn/native";
import { CORES, FALLBACK, fetchCoreMeta } from "../screens/settings/cores";
import { colors, useTheme } from "../theme";
import { TvFocusable } from "./TvFocusable";
import { getSelectedCore, type CoreName } from "../settings";
import { useXrayLast } from "../screens/settings/xrayLast";
import { showToast } from "../components/Toast";
import { disconnect } from "../vpn/manager";

/** Настройки Android TV: урезанный набор — только то, чем реально пользуются
 *  с пульта. Каждый Switch обёрнут в фокусируемую строку (TvFocusable), а сам
 *  тумблер помечен focusable={false}: на TV нативный Switch ловит D-pad OK
 *  нестабильно, поэтому «ОК» обрабатывает строка и переключает значение сама.
 *  Тема/иконки на TV не переключаются: TV-интерфейс один. */
export function TvSettingsTab() {
  useTheme();
  const { signOut, me, vpnRunning, setVpnRunning } = useApp();
  const [coreBusy, setCoreBusy] = useState(false);
  const [autoConnect, setAutoConnectState] = useState(getAutoConnect());
  const [killSwitch, setKillSwitchState] = useState(getKillSwitch());
  const [pingMethod, setPingMethodState] = useState<PingMethod>(getPingMethod());
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [xrayVersion, setXrayVersion] = useState("");
  const [selectedCore, setCore] = useState<CoreName>(getSelectedCore());
  const xrayLast = useXrayLast();
  const [jolyDownloaded, setJolyDownloaded] = useState(() => getCoreStatus("libxrayjoly.so").downloaded);

  useEffect(() => {
    try {
      setXrayVersion(getXrayVersion());
    } catch {}
  }, []);

  const appVersion = Application.nativeApplicationVersion || "?";
  const coreLabel = useMemo(() => {
    if (selectedCore !== "xray") return CORES.find((c) => c.key === selectedCore)?.label || selectedCore;
    if (!xrayVersion) return "встроенный Xray";
    return `встроенный Xray · ${xrayVersion}`;
  }, [xrayVersion, selectedCore]);

  const cyclePing = () => {
    const next: PingMethod = pingMethod === "tcp" ? "url" : "tcp";
    setPingMethod(next);
    setPingMethodState(next);
  };

  if (confirmSignOut) {
    return (
      <View style={s.wrapCenter}>
        <View style={s.card}>
          <Text style={s.title}>Выйти из аккаунта?</Text>
          <Text style={s.sub}>
            {me?.login ? `Сессия «${me.login}» на этом телевизоре будет завершена.` : "Сессия на этом телевизоре будет завершена."}
          </Text>
          <View style={s.btnRow}>
            <TvFocusable
              autoFocus
              onPress={() => setConfirmSignOut(false)}
              style={s.btn}
              borderRadius={15}
            >
              <View style={[s.btnInner, s.btnGhost]}>
                <Text style={s.btnGhostText}>Отмена</Text>
              </View>
            </TvFocusable>
            <TvFocusable
              onPress={() => {
                setConfirmSignOut(false);
                signOut().catch(() => {});
              }}
              style={s.btn}
              borderRadius={15}
            >
              <View style={[s.btnInner, s.btnDanger]}>
                <Text style={s.btnDangerText}>Выйти</Text>
              </View>
            </TvFocusable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.wrap}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      // Скролл D-pad'ом: фокус уходит за край — список подтягивается
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.title}>Настройки</Text>
      <Text style={s.sub}>Пульт: стрелки — выбор, «ОК» — действие</Text>

      {/* Автоподключение */}
      <TvFocusable
        autoFocus
        onPress={() => {
          const v = !autoConnect;
          setAutoConnectState(v);
          setAutoConnect(v);
        }}
        style={s.row}
        borderRadius={17}
        scale={1.015}
        accessibilityLabel="Подключать при запуске"
      >
        <View style={s.rowInner}>
          <View style={s.rowIconBox}>
            <Ionicons name="play-circle-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Подключать при запуске</Text>
            <Text style={s.rowSub}>VPN поднимается сам при открытии приложения</Text>
          </View>
          <Switch
            value={autoConnect}
            focusable={false}
            onValueChange={(v) => {
              setAutoConnectState(v);
              setAutoConnect(v);
            }}
            trackColor={{ true: colors.accentDeep, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
      </TvFocusable>

      {/* Kill Switch */}
      <TvFocusable
        onPress={() => {
          const v = !killSwitch;
          setKillSwitchState(v);
          setKillSwitch(v);
        }}
        style={s.row}
        borderRadius={17}
        scale={1.015}
        accessibilityLabel="Kill Switch"
      >
        <View style={s.rowInner}>
          <View style={s.rowIconBox}>
            <Ionicons name="shield-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Kill Switch</Text>
            <Text style={s.rowSub}>Блокировать интернет при обрыве VPN · применится при подключении</Text>
          </View>
          <Switch
            value={killSwitch}
            focusable={false}
            onValueChange={(v) => {
              setKillSwitchState(v);
              setKillSwitch(v);
            }}
            trackColor={{ true: colors.accentDeep, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
      </TvFocusable>

      {/* Метод пинга */}
      <TvFocusable onPress={cyclePing} style={s.row} borderRadius={17} scale={1.015} accessibilityLabel="Метод проверки серверов">
        <View style={s.rowInner}>
          <View style={s.rowIconBox}>
            <Ionicons name="speedometer-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Метод проверки серверов</Text>
            <Text style={s.rowSub}>
              {pingMethod === "tcp"
                ? "TCP-подключение к серверу — работает всегда"
                : "True Ping (через прокси): HTTP-запрос через прокси-туннель — точнее, но только при выключенном VPN"}
            </Text>
          </View>
          <View style={s.valuePill}>
            <Text style={s.valuePillText} numberOfLines={1}>{pingMethod === "tcp" ? "TCP" : "True Ping"}</Text>
          </View>
        </View>
      </TvFocusable>

      <Text style={s.rowTitle}>Ядро VPN</Text>
      {(["xray", "xray-last", "xray-joly"] as const).map((key) => (
        <TvFocusable key={key} style={s.row} borderRadius={17} onPress={async () => {
          if (coreBusy || key === selectedCore) return;
          if (key === "xray-last" && !xrayLast.status.downloaded) { showToast("Сначала скачайте ядро"); return; }
          if (key === "xray-joly" && !jolyDownloaded) { showToast("Сначала скачайте ядро"); return; }
          setCoreBusy(true);
          try {
            if (vpnRunning) { await disconnect(); setVpnRunning(false); }
            selectCore(key); setCore(key);
          } catch (e: any) { showToast(e.message || "Не удалось сменить ядро"); }
          finally { setCoreBusy(false); }
        }}>
          <View style={s.rowInner}><View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{key === "xray" ? "Xray (встроенный)" : key === "xray-joly" ? "Xray Joly" : "Xray Last"}{selectedCore === key ? " · выбрано" : ""}</Text>
            <Text style={s.rowSub}>{key === "xray-last" ? xrayLast.note : key === "xray-joly" ? CORES.find((c) => c.key === "xray-joly")?.note : coreLabel}</Text>
          </View></View>
        </TvFocusable>
      ))}
      {(!xrayLast.status.downloaded || xrayLast.canUpdate) && (
        <TvFocusable style={s.row} onPress={() => {
          xrayLast.install().then(() => showToast("Ядро загружено — перезапустите приложение")).catch((e) => showToast(e.message));
        }}>
          <View style={s.rowInner}><Text style={s.rowTitle}>{xrayLast.busy ? "Загрузка…" : xrayLast.status.downloaded ? "Обновить Xray Last" : "Скачать Xray Last"}</Text></View>
        </TvFocusable>
      )}
      {!jolyDownloaded && <TvFocusable style={s.row} onPress={async () => {
        if (coreBusy) return;
        setCoreBusy(true);
        try {
          const abi = getCpuAbi();
          const meta = (await fetchCoreMeta("xray-joly", abi)) || FALLBACK["xray-joly"]?.[abi];
          if (!meta) throw new Error("Xray Joly недоступен для архитектуры устройства");
          await downloadXrayJoly(meta.url, meta.sha256, meta.size, meta.version || "0.0.0");
          setJolyDownloaded(getCoreStatus("libxrayjoly.so").downloaded);
          showToast("Xray Joly загружен");
        } catch (e: any) { showToast(e.message || "Ошибка загрузки Xray Joly"); }
        finally { setCoreBusy(false); }
      }}><View style={s.rowInner}><Text style={s.rowTitle}>{coreBusy ? "Загрузка…" : "Скачать Xray Joly"}</Text></View></TvFocusable>}
      {/* О программе */}
      <View style={[s.row, s.rowStatic]}>
        <View style={s.rowInner}>
          <View style={s.rowIconBox}>
            <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>О программе</Text>
            <Text style={s.rowSub}>GhostCloud для Android TV · ядро: {coreLabel}</Text>
          </View>
          <Text style={s.rowValue}>v{appVersion}</Text>
        </View>
      </View>

      {/* Выход из аккаунта — отдельная красная карточка (не «спойлер») */}
      <TvFocusable
        onPress={() => setConfirmSignOut(true)}
        style={s.row}
        borderRadius={17}
        scale={1.015}
        accessibilityLabel="Выйти из аккаунта"
      >
        <View style={[s.rowInner, s.rowDanger]}>
          <View style={[s.rowIconBox, { backgroundColor: "rgba(248,113,113,0.12)" }]}>
            <Ionicons name="log-out-outline" size={22} color={colors.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowTitle, { color: colors.red }]}>Выйти из аккаунта</Text>
            <Text style={s.rowSub}>Завершить сессию на этом телевизоре</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.red} />
        </View>
      </TvFocusable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  content: { gap: 12, paddingBottom: 30 },
  wrapCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  sub: { color: "#9C93B8", fontSize: 14, marginBottom: 6 },
  card: { backgroundColor: "#1C1433", borderRadius: 22, borderWidth: 1, borderColor: "#2E2150", padding: 28, width: 520, alignItems: "center" },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 18, alignSelf: "stretch" },
  btn: { flex: 1 },
  btnInner: { height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  btnGhost: { backgroundColor: "#251A42", borderWidth: 1, borderColor: "#2E2150" },
  btnGhostText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  btnDanger: { backgroundColor: "#DC2626" },
  btnDangerText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  row: { width: "100%" },
  rowStatic: { borderRadius: 17 },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1C1433",
    borderWidth: 1,
    borderColor: "#2E2150",
    borderRadius: 17,
    paddingHorizontal: 18,
    minHeight: 72,
  },
  rowDanger: { borderColor: "rgba(248,113,113,0.35)" },
  rowIconBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(168,85,247,0.14)", alignItems: "center", justifyContent: "center" },
  rowTitle: { color: "#FFFFFF", fontSize: 16.5, fontWeight: "800" },
  rowSub: { color: "#8F84AC", fontSize: 12.5, marginTop: 3 },
  rowValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  valuePill: { backgroundColor: "#251A42", borderRadius: 11, paddingHorizontal: 13, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2E2150" },
  valuePillText: { color: "#A855F7", fontSize: 13, fontWeight: "800" },
});
