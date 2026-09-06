import React, { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppFilterContent } from "./AppFilterModal";
import { PressableScale } from "./PressableScale";
import { showToast } from "./Toast";
import { useApp } from "../context";
import {
  activateProfile,
  BUILTIN_PROFILES,
  BUILTIN_ROSCOMVPN_ID,
  ROSCOMVPN_DESCRIPTION,
  deactivateProfile,
  getScope,
  isBuiltinProfileId,
  loadFilterSettings,
  MAX_USER_PROFILES,
  newUserId,
  saveFilterSettings,
  SCOPE_LABELS,
  type BypassProfile,
  type BypassScope,
  type FilterSettings,
} from "../vpn/connectionFilter";
import { colors, sheetSurfaceBg, useTheme } from "../theme";

type Tab = "profiles" | "apps";

/** Полноэкранная модалка «Фильтр соединения» — как в эталонном приложении:
 *  профили обхода (для чего НЕ нужен VPN) с сетевыми режимами
 *  Везде / Wi-Fi / LTE + фильтр приложений. */
export function ConnectionFilterModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  useTheme();
  const styles = makeStyles();
  const { me, vpnRunning, nodes, selectedNodeId, setVpnRunning } = useApp();
  const isSponsor = me?.is_sponsor === true;

  const [tab, setTab] = useState<Tab>("profiles");
  const [settings, setSettings] = useState<FilterSettings>(() => loadFilterSettings());
  const [editing, setEditing] = useState<BypassProfile | null>(null);
  const [viewing, setViewing] = useState<BypassProfile | null>(null);
  const [roscomInfo, setRoscomInfo] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  /** Пакеты, реально установленные на устройстве — для подсчёта в карточках профилей */
  const [installedPkgs, setInstalledPkgs] = useState<Set<string> | null>(null);
  /** Имена приложений по пакетам — для просмотра списка профиля */
  const [appNames, setAppNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) {
      // при закрытии фильтра сбрасываем открытые модалки, чтобы они не
      // всплывали сразу при повторном открытии
      setEditing(null);
      setViewing(null);
      return;
    }
    setSettings(loadFilterSettings());
    // Определяем установленные приложения, чтобы показывать, сколько из
    // списка профиля реально стоит на устройстве (как в эталоне)
    import("../vpn/native")
      .then((n) => {
        setInstalledPkgs(n.getInstalledPackageNames());
        n.getInstalledApps(true).then((apps) => {
          const map: Record<string, string> = {};
          for (const a of apps) map[a.packageName] = a.appName;
          setAppNames(map);
        });
      })
      .catch(() => setInstalledPkgs(null));
  }, [visible]);

  /** Переподключить VPN с новыми правилами фильтра (как в эталоне) */
  const restartVpn = async () => {
    if (!vpnRunning) return;
    const node =
      nodes.find((n) => n.id === selectedNodeId) || nodes[0];
    if (!node) return;
    setRestartBusy(true);
    try {
      const { disconnect, connect } = await import("../vpn/manager");
      await disconnect();
      await connect(node, { isSponsor });
      setVpnRunning(true);
      showToast("Фильтр применён — VPN перезапущен", "top");
    } catch (e: any) {
      setVpnRunning(false);
      showToast(e?.message || "Не удалось перезапустить VPN");
    } finally {
      setRestartBusy(false);
    }
  };

  const applySettings = (next: FilterSettings, restart = true) => {
    setSettings(next);
    saveFilterSettings(next);
    if (restart && vpnRunning) void restartVpn();
  };

  const toggleActive = (id: string) => {
    const isActive = settings.active.includes(id);
    const scope = getScope(settings, id);
    const next = isActive
      ? deactivateProfile(settings, id)
      : activateProfile(settings, id);
    Haptics.selectionAsync().catch(() => {});
    // Сообщаем, какие профили с тем же режимом сети отключены
    if (!isActive) {
      const deactivated = settings.active.filter(
        (a) => a !== id && !next.active.includes(a)
      );
      if (deactivated.length) {
        const name = (cid: string) =>
          [...BUILTIN_PROFILES, ...settings.profiles].find((p) => p.id === cid)?.name || cid;
        showToast(
          `Отключены профили с тем же режимом: ${deactivated.map(name).join(", ")}`,
          "top"
        );
      } else {
        showToast(`Профиль активен · ${SCOPE_LABELS[scope]}`, "top");
      }
    }
    applySettings(next);
  };

  const changeScope = (id: string, scope: BypassScope) => {
    const next = { ...settings, scopes: { ...settings.scopes, [id]: scope } };
    // При смене режима активный профиль может начать конфликтовать —
    // пересчитываем активацию как в эталоне
    const reactivated = settings.active.includes(id)
      ? activateProfile(deactivateProfile(next, id), id)
      : next;
    Haptics.selectionAsync().catch(() => {});
    applySettings(reactivated);
  };

  const createProfile = () => {
    if (settings.profiles.length >= MAX_USER_PROFILES) {
      showToast(`Максимум ${MAX_USER_PROFILES} своих профилей`, "top");
      return;
    }
    const p: BypassProfile = {
      id: newUserId(),
      name: `Профиль ${settings.profiles.length + 1}`,
      domains: [],
      packages: [],
    };
    applySettings({ ...settings, profiles: [...settings.profiles, p] }, false);
    setEditing(p);
  };

  const saveProfile = (p: BypassProfile) => {
    const exists = settings.profiles.some((x) => x.id === p.id);
    const profiles = exists
      ? settings.profiles.map((x) => (x.id === p.id ? p : x))
      : [...settings.profiles, p];
    setEditing(null);
    applySettings({ ...settings, profiles });
  };

  const deleteProfile = (id: string) => {
    const p = settings.profiles.find((x) => x.id === id);
    if (!p) return;
    const next = {
      ...settings,
      profiles: settings.profiles.filter((x) => x.id !== id),
      active: settings.active.filter((a) => a !== id),
    };
    applySettings(next);
    showToast(`Профиль «${p.name}» удалён`, "top");
  };

  const allProfiles = [...BUILTIN_PROFILES, ...settings.profiles];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <PressableScale onPress={onClose} hitSlop={10}>
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700" }}>Готово</Text>
          </PressableScale>
          <Text style={styles.title}>Фильтр соединения</Text>
          {restartBusy ? (
            <View style={{ width: 50, alignItems: "flex-end" }}>
              <Text style={{ color: colors.textFaint, fontSize: 10 }}>применение…</Text>
            </View>
          ) : (
            <View style={{ width: 50 }} />
          )}
        </View>

        {/* Вкладки */}
        <View style={styles.tabsRow}>
          {(
            [
              ["profiles", `Профили (${settings.active.length})`],
              ["apps", "Приложения"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <PressableScale
              key={key}
              style={[styles.tabBtn, tab === key && styles.tabBtnOn]}
              onPress={() => setTab(key)}
            >
              <Text
                style={{
                  color: tab === key ? "#fff" : colors.textDim,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {label}
              </Text>
            </PressableScale>
          ))}
        </View>

        {tab === "apps" ? (
          <AppFilterContent visible={visible} />
        ) : (
          <>
            {/* Подсказка про несколько профилей — как в эталоне */}
            <View style={styles.hintBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              <Text style={styles.hintText}>
                Можно включить несколько профилей одновременно, если у них разные сети
                (например, один на Wi-Fi, другой на LTE).
              </Text>
            </View>

            <ScrollView
          bounces={false}
          overScrollMode="never"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 30 }}
              showsVerticalScrollIndicator={false}
            >
              {allProfiles.map((p) => {
                const builtin = isBuiltinProfileId(p.id);
                const isActive = settings.active.includes(p.id);
                const scope = getScope(settings, p.id);
                const isRoscom = p.id === BUILTIN_ROSCOMVPN_ID;
                return (
                  <View key={p.id} style={[styles.card, isActive && styles.cardOn]}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons
                            name={isRoscom ? "git-network-outline" : builtin ? "shield-checkmark" : "document-text"}
                            size={16}
                            color={isActive ? colors.accent : colors.textDim}
                          />
                          <Text style={styles.cardName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          {builtin && (
                            <View style={styles.builtinTag}>
                              <Text style={styles.builtinTagText}>встроенный</Text>
                            </View>
                          )}
                        </View>
                        {isRoscom ? (
                          <Text style={styles.cardSub}>
                            Роском-роутинг: RU напрямую, YouTube/Telegram через VPN
                          </Text>
                        ) : (
                        <Text style={styles.cardSub}>
                          {p.domains.length > 0 && `${p.domains.length} сайтов`}
                          {p.domains.length > 0 && p.packages.length > 0 && " · "}
                          {p.packages.length > 0 &&
                            (() => {
                              const installed = installedPkgs
                                ? p.packages.filter((x) => installedPkgs.has(x)).length
                                : p.packages.length;
                              const suffix = installedPkgs && installed < p.packages.length ? " установлено" : " приложений";
                              return `${installed}${suffix}`;
                            })()}
                          {p.domains.length === 0 && p.packages.length === 0 && "пусто"}
                          {" — мимо VPN"}
                        </Text>
                        )}
                      </View>
                      <Switch
                        value={isActive}
                        onValueChange={() => toggleActive(p.id)}
                        trackColor={{ false: colors.border, true: colors.accent }}
                        thumbColor="#fff"
                      />
                    </View>

                    {/* Сетевой режим */}
                    <View style={styles.scopeRow}>
                      {(["all", "wifi", "mobile"] as BypassScope[]).map((s) => {
                        const icon =
                          s === "all" ? "globe-outline" : s === "wifi" ? "wifi" : "cellular-outline";
                        const conflict =
                          scope !== s &&
                          isActive &&
                          settings.active.some((other) => {
                            if (other === p.id) return false;
                            const os = getScope(settings, other);
                            return (
                              (s === "all" || os === "all") || s === os
                            );
                          });
                        return (
                          <PressableScale
                            key={s}
                            style={[styles.scopeBtn, scope === s && styles.scopeBtnOn]}
                            onPress={() => changeScope(p.id, s)}
                          >
                            <Ionicons
                              name={icon as any}
                              size={13}
                              color={scope === s ? "#fff" : colors.textDim}
                            />
                            <Text
                              style={[
                                styles.scopeBtnText,
                                scope === s && { color: "#fff" },
                              ]}
                            >
                              {SCOPE_LABELS[s]}
                            </Text>
                            {conflict && <Ionicons name="lock-closed" size={9} color={colors.textFaint} />}
                          </PressableScale>
                        );
                      })}
                    </View>

                    {/* Действия: просмотр списка — для всех, редактирование/удаление — для своих */}
                    <View style={styles.cardActions}>
                      <PressableScale
                        style={styles.actionBtn}
                        onPress={() => (isRoscom ? setRoscomInfo(true) : setViewing(p))}
                      >
                        <Ionicons name={isRoscom ? "help-circle-outline" : "list-outline"} size={14} color={colors.textDim} />
                        <Text style={styles.actionBtnText}>{isRoscom ? "Как работает" : "Список"}</Text>
                      </PressableScale>
                      {!builtin && (
                        <>
                          <PressableScale style={styles.actionBtn} onPress={() => setEditing(p)}>
                            <Ionicons name="pencil-outline" size={14} color={colors.textDim} />
                            <Text style={styles.actionBtnText}>Изменить</Text>
                          </PressableScale>
                          <PressableScale style={styles.actionBtn} onPress={() => deleteProfile(p.id)}>
                            <Ionicons name="trash-outline" size={14} color={colors.red} />
                            <Text style={[styles.actionBtnText, { color: colors.red }]}>Удалить</Text>
                          </PressableScale>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}

              {settings.profiles.length < MAX_USER_PROFILES && (
                <PressableScale style={styles.addBtn} onPress={createProfile}>
                  <Ionicons name="add" size={18} color={colors.accent} />
                  <Text style={styles.addBtnText}>Новый профиль</Text>
                </PressableScale>
              )}
            </ScrollView>
          </>
        )}
      </View>

      {/* Редактор профиля */}
      <ProfileEditor
        profile={editing}
        onClose={() => setEditing(null)}
        onSave={saveProfile}
      />

      {/* Просмотр списков профиля (сайты и приложения) */}
      <ProfileViewer
        profile={viewing}
        onClose={() => setViewing(null)}
        installedPkgs={installedPkgs}
        appNames={appNames}
      />

      {/* Описание Роском-роутинга */}
      <Modal visible={roscomInfo} transparent animationType="fade" onRequestClose={() => setRoscomInfo(false)}>
        <PressableScale style={styles.edBackdrop} onPress={() => setRoscomInfo(false)}>
          <PressableScale style={styles.edCard} onPress={() => {}}>
            <Text style={styles.edTitle}>Роском-роутинг</Text>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.roscomInfoText}>{ROSCOMVPN_DESCRIPTION}</Text>
              <Text style={styles.roscomInfoText}>
                Режим выбирается автоматически по серверу: обычные серверы — DEFAULT
                (российские сервисы и игры напрямую), LTE Open — WHITELIST (напрямую
                только белые списки РФ).
              </Text>
              <Text style={styles.roscomInfoText}>
                Списки доменов и IP обновляются вместе с приложением (данные проекта
                roscomvpn-routing вшиты в APK).
              </Text>
            </ScrollView>
            <PressableScale style={styles.edSave} onPress={() => setRoscomInfo(false)}>
              <Text style={styles.edSaveText}>Понятно</Text>
            </PressableScale>
          </PressableScale>
        </PressableScale>
      </Modal>
    </Modal>
  );
}

/** Редактор своего профиля: название, домены и приложения «мимо VPN» */
function ProfileEditor({
  profile,
  onClose,
  onSave,
}: {
  profile: BypassProfile | null;
  onClose: () => void;
  onSave: (p: BypassProfile) => void;
}) {
  useTheme();
  const styles = makeStyles();
  const [name, setName] = useState("");
  const [domainsText, setDomainsText] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setDomainsText(profile.domains.join("\n"));
    }
  }, [profile]);

  const packages = profile?.packages || [];

  const parseDomains = () =>
    domainsText
      .split(/[\n,;\s]+/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 1 && !d.startsWith("http"));

  if (!profile) return null;

  return (
    <Modal visible={!!profile} transparent animationType="fade" onRequestClose={onClose}>
      <PressableScale style={styles.edBackdrop} onPress={onClose}>
        <PressableScale style={styles.edCard} onPress={() => {}}>
          <Text style={styles.edTitle}>Профиль обхода</Text>
          <Text style={styles.edLabel}>Название</Text>
          <TextInput
            style={styles.edInput}
            value={name}
            onChangeText={setName}
            placeholder="Название профиля"
            placeholderTextColor={colors.textFaint}
            maxLength={40}
          />
          <Text style={styles.edLabel}>
            Домены «мимо VPN» — по одному в строке или через запятую
          </Text>
          <TextInput
            style={[styles.edInput, { height: 110, textAlignVertical: "top" }]}
            value={domainsText}
            onChangeText={setDomainsText}
            placeholder={"vk.com\nyandex.ru"}
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <View style={styles.edRow}>
            <Text style={styles.edHint}>
              {parseDomains().length} сайтов · {packages.length} приложений
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <View style={{ flex: 1 }}>
              <PressableScale style={styles.edBtnGhost} onPress={onClose}>
                <Text style={styles.edBtnGhostText}>Отмена</Text>
              </PressableScale>
            </View>
            <View style={{ flex: 1 }}>
              <PressableScale
                style={styles.edBtnPrimary}
                onPress={() =>
                  onSave({
                    ...profile,
                    name: name.trim() || profile.name,
                    domains: parseDomains(),
                  })
                }
              >
                <Text style={styles.edBtnPrimaryText}>Сохранить</Text>
              </PressableScale>
            </View>
          </View>
          <Text style={styles.edNote}>
            Приложения для профиля добавляются на вкладке «Приложения» — они попадают в
            системный список «мимо VPN» при подключении.
          </Text>
        </PressableScale>
      </PressableScale>
    </Modal>
  );
}

/** Просмотр списков профиля: сайты и приложения, которые идут «мимо VPN» */
function ProfileViewer({
  profile,
  onClose,
  installedPkgs,
  appNames,
}: {
  profile: BypassProfile | null;
  onClose: () => void;
  installedPkgs: Set<string> | null;
  appNames: Record<string, string>;
}) {
  useTheme();
  const styles = makeStyles();
  const [viewTab, setViewTab] = useState<"domains" | "apps">("domains");

  useEffect(() => {
    if (profile) {
      setViewTab(profile.packages.length > 0 && profile.domains.length === 0 ? "apps" : "domains");
    }
  }, [profile]);

  if (!profile) return null;

  const domains = [...profile.domains].sort();
  const packages = [...profile.packages].sort((a, b) => {
    const na = (appNames[a] || a).toLowerCase();
    const nb = (appNames[b] || b).toLowerCase();
    return na.localeCompare(nb);
  });

  return (
    <Modal visible={!!profile} transparent animationType="fade" onRequestClose={onClose}>
      <PressableScale style={styles.edBackdrop} onPress={onClose}>
        <PressableScale style={styles.vwCard} onPress={() => {}}>
          <Text style={styles.edTitle} numberOfLines={1}>
            {profile.name}
          </Text>
          <Text style={styles.vwSub}>Что идёт «мимо VPN» в этом профиле</Text>

          {/* Вкладки: сайты / приложения */}
          <View style={styles.vwTabs}>
            <PressableScale
              style={[styles.vwTab, viewTab === "domains" && styles.vwTabOn]}
              onPress={() => setViewTab("domains")}
            >
              <Text style={[styles.vwTabText, viewTab === "domains" && { color: "#fff" }]}>
                Сайты ({domains.length})
              </Text>
            </PressableScale>
            <PressableScale
              style={[styles.vwTab, viewTab === "apps" && styles.vwTabOn]}
              onPress={() => setViewTab("apps")}
            >
              <Text style={[styles.vwTabText, viewTab === "apps" && { color: "#fff" }]}>
                Приложения ({packages.length})
              </Text>
            </PressableScale>
          </View>

          <ScrollView
            style={{ maxHeight: 380 }}
            contentContainerStyle={{ paddingBottom: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {viewTab === "domains" ? (
              domains.length === 0 ? (
                <Text style={styles.vwEmpty}>В профиле нет сайтов</Text>
              ) : (
                domains.map((d, i) => (
                  <View key={`${d}-${i}`} style={styles.vwItem}>
                    <Ionicons name="globe-outline" size={14} color={colors.textFaint} />
                    <Text style={styles.vwItemText} numberOfLines={1}>
                      {d}
                    </Text>
                  </View>
                ))
              )
            ) : packages.length === 0 ? (
              <Text style={styles.vwEmpty}>В профиле нет приложений</Text>
            ) : (
              packages.map((pkg) => {
                const installed = installedPkgs ? installedPkgs.has(pkg) : true;
                return (
                  <View key={pkg} style={styles.vwItem}>
                    <Ionicons
                      name={installed ? "phone-portrait-outline" : "cloud-offline-outline"}
                      size={14}
                      color={installed ? colors.green : colors.textFaint}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vwItemText} numberOfLines={1}>
                        {appNames[pkg] || pkg}
                      </Text>
                      <Text style={styles.vwItemSub} numberOfLines={1}>
                        {pkg}
                        {installed ? "" : " · не установлено"}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <PressableScale style={styles.edBtnGhost} onPress={onClose}>
            <Text style={styles.edBtnGhostText}>Закрыть</Text>
          </PressableScale>
        </PressableScale>
      </PressableScale>
    </Modal>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingTop: 54,
      paddingHorizontal: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    title: { color: colors.text, fontSize: 17, fontWeight: "800" },
    tabsRow: {
      flexDirection: "row",
      backgroundColor: colors.bgSoft,
      borderRadius: 12,
      padding: 4,
      gap: 4,
      marginBottom: 12,
    },
    tabBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 9,
      borderRadius: 9,
    },
    tabBtnOn: { backgroundColor: colors.accent },
    hintBox: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent + "40",
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12,
    },
    hintText: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, flex: 1 },
    card: {
      backgroundColor: sheetSurfaceBg(),
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10,
    },
    cardOn: { borderColor: colors.accent + "80" },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    cardName: { color: colors.text, fontSize: 14.5, fontWeight: "700", flexShrink: 1 },
    cardSub: { color: colors.textDim, fontSize: 11.5, marginTop: 2 },
    builtinTag: {
      backgroundColor: colors.bgSoft,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    builtinTagText: { color: colors.textFaint, fontSize: 9, fontWeight: "700" },
    scopeRow: { flexDirection: "row", gap: 6, marginTop: 10 },
    scopeBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: colors.bgSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scopeBtnOn: { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep },
    scopeBtnText: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
    cardActions: { flexDirection: "row", gap: 8, marginTop: 10 },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 9,
      backgroundColor: colors.bgSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionBtnText: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 13,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.accent + "66",
      backgroundColor: colors.accentSoft,
      marginTop: 2,
    },
    addBtnText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    // редактор
    edBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    edCard: {
      width: "100%",
      maxHeight: "85%",
      backgroundColor: sheetSurfaceBg(),
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    edTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 14,
    },
    edLabel: { color: colors.textDim, fontSize: 12, fontWeight: "700", marginBottom: 6 },
    edInput: {
      backgroundColor: colors.bgSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      marginBottom: 12,
    },
    edRow: { flexDirection: "row", justifyContent: "flex-end" },
    edHint: { color: colors.textFaint, fontSize: 11 },
    edBtnGhost: {
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: colors.bgSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    edBtnGhostText: { color: colors.textDim, fontWeight: "700", fontSize: 14 },
    edBtnPrimary: {
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: colors.accentDeep,
    },
    edBtnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    edSave: {
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: colors.accentDeep,
      marginTop: 14,
    },
    edSaveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    roscomInfoText: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginBottom: 10 },
    edNote: { color: colors.textFaint, fontSize: 10.5, marginTop: 12, lineHeight: 15 },
    // Просмотр списков профиля
    vwCard: {
      width: "100%",
      maxHeight: "85%",
      backgroundColor: sheetSurfaceBg(),
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    vwSub: { color: colors.textFaint, fontSize: 12, marginBottom: 12, marginTop: -8 },
    vwTabs: {
      flexDirection: "row",
      backgroundColor: colors.bgSoft,
      borderRadius: 10,
      padding: 3,
      gap: 4,
      marginBottom: 10,
    },
    vwTab: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 8,
      borderRadius: 8,
    },
    vwTabOn: { backgroundColor: colors.accent },
    vwTabText: { color: colors.textDim, fontSize: 12.5, fontWeight: "700" },
    vwItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 7,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    vwItemText: { color: colors.text, fontSize: 13, fontWeight: "500", flexShrink: 1 },
    vwItemSub: { color: colors.textFaint, fontSize: 10.5, marginTop: 1 },
    vwEmpty: {
      color: colors.textFaint,
      fontSize: 13,
      textAlign: "center",
      paddingVertical: 24,
    },
  });
