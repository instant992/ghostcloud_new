import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Button, Screen, ThemedCard, Title, useScreenTopPad, useScreenBgColor, useInTabArea } from "../components/UI";
import { QuickNavBar, themeHasQuickNav } from "../components/QuickNavBar";
import { PressableScale } from "../components/PressableScale";
import { colors, useTheme } from "../theme";
import { getThemeName } from "../settings";
import { useApp } from "../context";
import { makeStyles } from "./settingsStyles";

/** Экран «Настройки» — как в старом приложении (tools.dart): не спойлеры,
 *  а секции-карточки со строками; каждая строка открывает раздел отдельной
 *  страницей (ListItem.open → OpenDelegate).
 *  Секции: «Ещё» (запросы, игра, поддержка), «Настройки» (внешний вид,
 *  VPN и сеть, расширенные), «Прочее» (о программе, выход). */

type Row = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  onPress: () => void;
  trailing?: React.ReactNode;
};

export default function SettingsScreen() {
  useTheme();
  const styles = makeStyles();
  const inTabs = useInTabArea();
  const nav = useNavigation<any>();
  const { isFoxcloud, signOut } = useApp();

  /** Подтверждение выхода из аккаунта (кнопка перенесена из профиля) */
  const [logoutOpen, setLogoutOpen] = useState(false);

  /** Расширенные настройки — как в старом приложении: переключатель с
   *  предупреждением открывает дополнительные функции (журнал ядра и т.п.).
   *  Каждый заход в настройки начинается с выключенного состояния. */
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedConfirm, setAdvancedConfirm] = useState(false);
  const toggleAdvanced = (on: boolean) => {
    if (on) {
      setAdvancedConfirm(true);
      return;
    }
    setAdvancedOpen(false);
    Haptics.selectionAsync().catch(() => {});
  };

  /** Строка-пункт, открывающая раздел отдельной страницей — как ListItem.open
   *  в старом приложении. */
  const NavRow = ({ r, last }: { r: Row; last?: boolean }) => (
    <>
      <PressableScale
        style={styles.navRow}
        onPress={r.onPress}
        accessibilityRole="button"
        accessibilityLabel={r.sub ? `${r.title}. ${r.sub}` : r.title}
      >
        <Ionicons name={r.icon} size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.navRowTitle}>{r.title}</Text>
          {r.sub ? <Text style={styles.navRowSub}>{r.sub}</Text> : null}
        </View>
        {r.trailing ?? null}
        <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
      </PressableScale>
      {!last && <View style={styles.rowDivider} />}
    </>
  );

  /** Строка-переключатель (без шеврона) — как _AdvancedSettingsToggle */
  const SwitchRow = ({
    icon,
    title,
    sub,
    value,
    onValueChange,
    last,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    sub: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    last?: boolean;
  }) => (
    <>
      <View style={styles.navRow}>
        <Ionicons name={icon} size={20} color={value ? colors.accent : colors.textFaint} />
        <View style={{ flex: 1 }}>
          <Text style={styles.navRowTitle}>{title}</Text>
          <Text style={styles.navRowSub}>{sub}</Text>
        </View>
        <ThemeSwitch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={title}
        />
      </View>
      {!last && <View style={styles.rowDivider} />}
    </>
  );

  const moreRows: Row[] = [
    {
      key: "requests",
      icon: "pulse-outline",
      title: "Запросы",
      sub: "Просмотр последних записей запросов",
      onPress: () => nav.navigate("Requests"),
    },
    ...(isFoxcloud ? [] : [{
      key: "game",
      icon: "game-controller-outline" as const,
      title: "GhostCloud Run",
      sub: "Мини-игра: собери 500 монет — получи +1 день подписки",
      onPress: () => nav.navigate("Game"),
      trailing: <Text style={styles.betaBadge}>BETA</Text>,
    } satisfies Row]),
    {
      key: "support",
      icon: "chatbubbles-outline",
      title: "Поддержка",
      sub: "Ответим на вопросы и поможем с подключением",
      onPress: () => nav.navigate("Support"),
    },
  ];

  // FoxCloud (вход через Telegram): тема закреплена — раздел «Внешний вид» скрыт.
  const settingsRows: Row[] = [
    ...(isFoxcloud
      ? []
      : ([
          {
            key: "appearance",
            icon: "color-palette-outline",
            title: "Внешний вид",
            sub: "Тема, режим, иконка приложения",
            onPress: () => nav.navigate("Appearance"),
          },
        ] as Row[])),
    {
      key: "vpn",
      icon: "shield-checkmark-outline",
      title: "VPN и сеть",
      sub: "Ядро, маскировка, Kill Switch, DNS",
      onPress: () => nav.navigate("VpnNetwork"),
    },
  ];

  const advancedRows: Row[] = advancedOpen
    ? [
        {
          key: "corelog",
          icon: "terminal-outline",
          title: "Журнал ядра",
          sub: "Ошибки и диагностика VPN-ядра",
          onPress: () => nav.navigate("Requests", { tab: "core" }),
        },
      ]
    : [];

  const topPad = useScreenTopPad();
  const screenBg = useScreenBgColor();
  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <Screen style={{ ...topPad, ...(!inTabs && themeHasQuickNav(getThemeName()) ? { paddingBottom: 92 } : null) }}>
        <Title>Настройки</Title>

        {/* ─── Секция «Ещё»: запросы, игра, поддержка — как в старом приложении ─── */}
        <Text style={styles.sectionLabel}>Ещё</Text>
        <ThemedCard style={styles.sectionCard}>
          {moreRows.map((r, i) => (
            <NavRow key={r.key} r={r} last={i === moreRows.length - 1} />
          ))}
        </ThemedCard>

        {/* ─── Секция «Настройки»: разделы открываются отдельными страницами ─── */}
        <Text style={styles.sectionLabel}>Настройки</Text>
        <ThemedCard style={styles.sectionCard}>
          {settingsRows.map((r) => (
            <NavRow key={r.key} r={r} />
          ))}
          <SwitchRow
            icon="build-outline"
            title="Расширенные настройки"
            sub={advancedOpen ? "Показаны дополнительные параметры" : "Для опытных пользователей"}
            value={advancedOpen}
            onValueChange={toggleAdvanced}
            last={!advancedOpen}
          />
          {advancedRows.map((r, i) => (
            <NavRow key={r.key} r={r} last={i === advancedRows.length - 1} />
          ))}
        </ThemedCard>

        {/* ─── Секция «Прочее»: о программе, выход ─── */}
        <Text style={styles.sectionLabel}>Прочее</Text>
        <ThemedCard style={styles.sectionCard}>
          {!isFoxcloud && <NavRow r={{ key: "bugs", icon: "bug-outline", title: "Ошибки приложения", sub: "Сообщить о проблеме и следить за исправлениями", onPress: () => nav.navigate("Bugs") }} />}
          <NavRow
            r={{
              key: "about",
              icon: "information-circle-outline",
              title: "О программе",
              sub: "Проверить обновления и посмотреть версию",
              onPress: () => nav.navigate("About"),
              trailing: <Text style={styles.versionText}>v{Application.nativeApplicationVersion || "?"}</Text>,
            }}
          />
          <View style={styles.rowDivider} />
          <PressableScale
            style={styles.logoutRow}
            onPress={() => setLogoutOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Выйти из аккаунта"
          >
            <Ionicons name="log-out-outline" size={18} color="#FF4D4D" />
            <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </PressableScale>
        </ThemedCard>

        {/* Подтверждение включения расширенных настроек — как в старом приложении */}
        {advancedConfirm && (
          <Modal visible={advancedConfirm} transparent animationType="fade" onRequestClose={() => setAdvancedConfirm(false)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setAdvancedConfirm(false)}>
              <Pressable style={styles.modalCard} onPress={() => {}}>
                <Text style={styles.modalTitle}>Расширенные настройки</Text>
                <Text style={styles.modalText}>
                  Расширенные настройки предназначены для опытных пользователей.
                  Неправильная конфигурация может нарушить работу VPN.{"\n\n"}
                  Включить расширенные настройки?
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Отмена" variant="ghost" onPress={() => setAdvancedConfirm(false)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Включить"
                      onPress={() => {
                        setAdvancedConfirm(false);
                        setAdvancedOpen(true);
                        Haptics.selectionAsync().catch(() => {});
                      }}
                    />
                  </View>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {/* Подтверждение выхода из аккаунта */}
        {logoutOpen && (
          <Modal visible={logoutOpen} transparent animationType="fade" onRequestClose={() => setLogoutOpen(false)}>
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
          </Modal>
        )}
      </Screen>
      <QuickNavBar />
    </View>
  );
}
