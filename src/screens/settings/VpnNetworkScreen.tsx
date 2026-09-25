import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Card, Screen, Title, useScreenTopPad } from "../../components/UI";
import { PressableScale } from "../../components/PressableScale";
import { SponsorBenefitsSheet } from "../../components/SponsorBenefits";
import { SponsorHeart } from "../../components/Badges";
import { showToast } from "../../components/Toast";
import { useApp } from "../../context";
import { colors, useTheme } from "../../theme";
import {
  getAntiDpi,
  getAutoConnect,
  getAutoConnectBoot,
  getKillSwitch,
  getPingMethod,
  getPingUrl,
  getSelectedCore,
  getSetting,
  setAntiDpi,
  setAutoConnect,
  setAutoConnectBoot,
  setKillSwitch,
  setPingMethod,
  setPingUrl,
  setSetting,
  DEFAULT_PING_URL,
  type CoreName,
  type PingMethod,
} from "../../settings";
import { DNS_PROVIDERS, getDnsProvider } from "../../vpn/dns";
import { disconnect } from "../../vpn/manager";
import {
  downloadCore,
  getCpuAbi,
  getCoreStatus,
  getXrayVersion,
  isIgnoringBatteryOptimizations,
  loadLibCore,
  onCoreDownloadProgress,
  openVpnSettings,
  requestIgnoreBatteryOptimizations,
  requestVpnPermission,
} from "../../vpn/native";
import { makeStyles } from "../settingsStyles";
import { CORES, FALLBACK, fetchCoreMeta } from "./cores";

/** Запрашивает системные разрешения, без которых Android не даст
 *  автоподключению после загрузки устройства отработать молча:
 *  POST_NOTIFICATIONS (Android 13+; без разрешения Android 14 убивает
 *  foreground VPN-сервис) и исключение из экономии батареи (иначе
 *  BOOT_COMPLETED-приёмник откладывается). Каждый шаг идемпотентен:
 *  уже выданные разрешения не запрашиваются повторно. */
async function ensureAutobootPermissions(): Promise<void> {
  // 1. Уведомления — VPN-сервис работает как foreground с уведомлением.
  if (Platform.OS === "android") {
    try {
      const Notifications = await import("expo-notifications");
      const cur = await Notifications.getPermissionsAsync();
      if (cur.granted || cur.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED) {
        // уже есть
      } else {
        await Notifications.requestPermissionsAsync();
      }
    } catch {}
  }
  // 2. Исключение из оптимизации батареи — приёмник загрузки сработает вовремя.
  try {
    if (!isIgnoringBatteryOptimizations()) {
      requestIgnoreBatteryOptimizations();
    }
  } catch {}
}

/** Подэкран «VPN и сеть» — открывается строкой из настроек, как в старом
 *  приложении: ядро, маскировка, подключение, безопасность, пинг, DNS. */
export default function VpnNetworkScreen() {
  useTheme();
  const styles = makeStyles();
  const { me, vpnRunning, setVpnRunning, isFoxcloud } = useApp();
  const [core, setCore] = useState<CoreName>(getSelectedCore());
  const [antiDpi, setAntiDpiState] = useState(getAntiDpi());
  const [xrayVersion, setXrayVersion] = useState("");
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [confirmCore, setConfirmCore] = useState<(typeof CORES)[number] | null>(null);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(false);
  const [dnsId, setDnsId] = useState(() => getSetting("dns_provider", "auto"));
  const [stopBusy, setStopBusy] = useState(false);
  const [killSwitch, setKillSwitchState] = useState(getKillSwitch());
  const [autoConnect, setAutoConnectState] = useState(getAutoConnect());
  const [autoBoot, setAutoBootState] = useState(getAutoConnectBoot());
  const [pingMethod, setPingMethodState] = useState<PingMethod>(getPingMethod());
  const [pingOpen, setPingOpen] = useState(false);
  const [pingUrl, setPingUrlState] = useState(() => getPingUrl());
  const [pingUrlInput, setPingUrlInput] = useState(() => getPingUrl());

  const isSponsor = me?.is_sponsor === true;

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
        showToast(e?.message || "Не удалось скачать ядро");
      } finally {
        setProgress((p) => {
          const n = { ...p };
          delete n[c.file];
          return n;
        });
      }
    })();
  };

  const topPad = useScreenTopPad();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={topPad}>
        <Title>VPN и сеть</Title>

        {/* ─── Ядро VPN + маскировка трафика ─── */}
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
              onValueChange={async (v) => {
                Haptics.selectionAsync().catch(() => {});
                if (!v) {
                  setAutoBootState(false);
                  setAutoConnectBoot(false);
                  showToast("Автоподключение при загрузке выключено", "top");
                  return;
                }
                // Android не даёт приложению поднять VPN «из ниоткуда» после
                // загрузки: нужно заранее получить согласие на VPN, показывать
                // уведомление (без него Android 14 убивает foreground-сервис) и
                // вывести приложение из экономии батареи — иначе BOOT_COMPLETED
                // отложится/не дойдёт. Запрашиваем всё сразу, чтобы потом телефон
                // сам поднял VPN без единого ручного окна.
                try {
                  const vpnOk = await requestVpnPermission();
                  if (!vpnOk) {
                    showToast("Нужно разрешить VPN — автозапуск не включён", "top");
                    return;
                  }
                  await ensureAutobootPermissions();
                } catch {
                  showToast("Не удалось получить системные разрешения", "top");
                  return;
                }
                setAutoBootState(true);
                setAutoConnectBoot(true);
                showToast("Автоподключение при загрузке включено", "top");
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
                  ? "Via Proxy Get: HTTP-запрос через прокси (полный тест протокола) — точнее, но дольше и не работает при включённом VPN"
                  : "TCP: рукопожатие с сервером — быстро, работает всегда"}
              </Text>
            </View>
            <PressableScale
              style={styles.styleDropdownBtn}
              onPress={() => setPingOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Метод проверки пинга: ${pingMethod === "url" ? "Via Proxy Get" : "TCP"}. Нажмите, чтобы выбрать`}
            >
              <Text style={styles.styleDropdownText}>{pingMethod === "url" ? "Via Proxy Get" : "TCP"}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.accent} />
            </PressableScale>
          </View>

          {/* URL для Via Proxy Get — можно заменить на свой */}
          {pingMethod === "url" && (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={styles.themeRowSub}>
                URL для проверки (HTTP/HTTPS). Сервер должен отвечать 204/200 без тела.
              </Text>
              <TextInput
                style={styles.coreInput}
                value={pingUrlInput}
                onChangeText={setPingUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={DEFAULT_PING_URL}
                placeholderTextColor={colors.textFaint}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <PressableScale
                    style={styles.modalBtnGhost}
                    onPress={() => {
                      setPingUrlInput(DEFAULT_PING_URL);
                      setPingUrl(DEFAULT_PING_URL);
                      setPingUrlState(DEFAULT_PING_URL);
                      showToast("URL по умолчанию восстановлен", "top");
                    }}
                  >
                    <Text style={styles.modalBtnGhostText}>По умолчанию</Text>
                  </PressableScale>
                </View>
                <View style={{ flex: 1 }}>
                  <PressableScale
                    style={styles.modalBtnPrimary}
                    onPress={() => {
                      const v = pingUrlInput.trim();
                      if (!/^https?:\/\/\S+$/i.test(v)) {
                        showToast("Некорректный URL — нужен http(s)://…", "top");
                        return;
                      }
                      setPingUrl(v);
                      setPingUrlState(v);
                      showToast("URL проверки сохранён", "top");
                    }}
                  >
                    <Text style={styles.modalBtnPrimaryText}>Сохранить</Text>
                  </PressableScale>
                </View>
              </View>
              <Text style={styles.hint}>Сейчас: {pingUrl}</Text>
            </View>
          )}
          <Text style={styles.hint}>
            UDP/ICMP-пинг на Android недоступен приложениям без root — поэтому методы два: TCP и Via Proxy Get.
          </Text>
        </Card>

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

        {/* Модал выбора метода пинга */}
        {pingOpen && (
          <Modal visible={pingOpen} transparent animationType="fade" onRequestClose={() => setPingOpen(false)}>
            <PressableScale style={styles.modalBackdrop} onPress={() => setPingOpen(false)}>
              <PressableScale style={styles.stylePanel} onPress={() => {}}>
                <Text style={styles.themeSheetTitle}>Метод проверки пинга</Text>
                {([
                  { key: "url" as PingMethod, title: "Via Proxy Get", sub: "HTTP-запрос через прокси (полный тест протокола VLESS/REALITY). Точнее, но дольше; при включённом VPN автоматически используется TCP." },
                  { key: "tcp" as PingMethod, title: "TCP", sub: "Рукопожатие с портом сервера. Быстро, работает при включённом VPN." },
                ]).map((o) => (
                  <PressableScale
                    key={o.key}
                    style={[styles.styleItem, pingMethod === o.key && styles.styleItemOn]}
                    onPress={() => {
                      setPingMethodState(o.key);
                      setPingMethod(o.key);
                      setPingOpen(false);
                      Haptics.selectionAsync().catch(() => {});
                      showToast(o.key === "url" ? "Метод: Via Proxy Get" : "Метод: TCP", "top");
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
                  UDP/ICMP-пинг на Android недоступен приложениям без root — поэтому методы два: TCP и Via Proxy Get.
                </Text>
              </PressableScale>
            </PressableScale>
          </Modal>
        )}

        {/* Стилизованное подтверждение загрузки ядра */}
        {confirmCore !== null && (
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
          </Modal>
        )}

        {/* Выбор DNS-сервера (спонсорам) */}
        {dnsOpen && (
          <Modal visible={dnsOpen} transparent animationType="fade" onRequestClose={() => setDnsOpen(false)}>
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
                        style={[styles.styleItemText, dnsId === p.id && { color: colors.accent, fontWeight: "700" }]}
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
          </Modal>
        )}

        {/* Шторка преимуществ спонсора */}
        {benefitsOpen && <SponsorBenefitsSheet visible={benefitsOpen} onClose={() => setBenefitsOpen(false)} />}
      </Screen>
    </View>
  );
}
