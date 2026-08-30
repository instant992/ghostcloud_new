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
  const [restartBusy, setRestartBusy] = useState(false);

  useEffect(() => {
    if (visible) setSettings(loadFilterSettings());
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
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 30 }}
              showsVerticalScrollIndicator={false}
            >
              {allProfiles.map((p) => {
                const builtin = isBuiltinProfileId(p.id);
                const isActive = settings.active.includes(p.id);
                const scope = getScope(settings, p.id);
                return (
                  <View key={p.id} style={[styles.card, isActive && styles.cardOn]}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons
                            name={builtin ? "shield-checkmark" : "document-text"}
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
                        <Text style={styles.cardSub}>
                          {p.domains.length > 0 && `${p.domains.length} сайтов`}
                          {p.domains.length > 0 && p.packages.length > 0 && " · "}
                          {p.packages.length > 0 && `${p.packages.length} приложений`}
                          {p.domains.length === 0 && p.packages.length === 0 && "пусто"}
                          {" — мимо VPN"}
                        </Text>
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

                    {/* Действия для своих профилей */}
                    {!builtin && (
                      <View style={styles.cardActions}>
                        <PressableScale style={styles.actionBtn} onPress={() => setEditing(p)}>
                          <Ionicons name="pencil-outline" size={14} color={colors.textDim} />
                          <Text style={styles.actionBtnText}>Изменить</Text>
                        </PressableScale>
                        <PressableScale style={styles.actionBtn} onPress={() => deleteProfile(p.id)}>
                          <Ionicons name="trash-outline" size={14} color={colors.red} />
                          <Text style={[styles.actionBtnText, { color: colors.red }]}>Удалить</Text>
                        </PressableScale>
                      </View>
                    )}
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
    edNote: { color: colors.textFaint, fontSize: 10.5, marginTop: 12, lineHeight: 15 },
  });
