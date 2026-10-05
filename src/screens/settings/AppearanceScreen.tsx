import React, { useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Screen, Title, useScreenTopPad } from "../../components/UI";
import { ThemeSwitch } from "../../components/ThemeSwitch";
import { PressableScale } from "../../components/PressableScale";
import { SponsorBenefitsSheet } from "../../components/SponsorBenefits";
import { SponsorHeart } from "../../components/Badges";
import { showToast } from "../../components/Toast";
import { useApp } from "../../context";
import { colors, THEME_LABELS, THEME_ORDER, SIMPLE_UNLOCK_CODE, useTheme, useThemeSwitcher, type ThemeName } from "../../theme";
import { getSetting, getThemeName, getThemeMode, setSetting } from "../../settings";
import { getLauncherIcon, setLauncherIcon } from "../../vpn/native";
import { makeStyles } from "../settingsStyles";

/** Стили, доступные только спонсорам — как во Flutter-версии */
const SPONSOR_STYLES: ThemeName[] = ["v2ray", "happ"];

/** Ключ сохранённой разблокировки секретной темы «Простой» */
const SIMPLE_UNLOCK_KEY = "simple_theme_unlocked";

/** Подэкран «Внешний вид» — открывается строкой из настроек, как в старом
 *  приложении (ListItem.open → отдельная страница): режим темы, смена по
 *  времени, стиль темы, иконка приложения. */
export default function AppearanceScreen() {
  useTheme();
  const styles = makeStyles();
  const switchTheme = useThemeSwitcher();
  const { me, isFoxcloud } = useApp();
  const [style, setStyle] = useState<ThemeName>(getThemeName());
  const [mode, setMode] = useState(getThemeMode());
  const [themeOpen, setThemeOpen] = useState(false);
  const [sunrise, setSunrise] = useState(getSetting("theme_sunrise", "06:00"));
  const [sunset, setSunset] = useState(getSetting("theme_sunset", "20:00"));
  const [scheduleMode, setScheduleMode] = useState<"sun" | "custom">(() =>
    getSetting("theme_schedule_mode", "sun") === "custom" ? "custom" : "sun"
  );
  const [customRise, setCustomRise] = useState(() => getSetting("theme_custom_rise", "07:00"));
  const [customSet, setCustomSet] = useState(() => getSetting("theme_custom_set", "21:00"));
  const [sunBusy, setSunBusy] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [appIcon, setAppIcon] = useState<string>(() => getLauncherIcon());

  // Секретная тема «Простой»: 5 нажатий на заголовок «Стиль темы» → код
  const [simpleUnlocked, setSimpleUnlocked] = useState(() => getSetting(SIMPLE_UNLOCK_KEY, "0") === "1");
  const [styleTaps, setStyleTaps] = useState(0);
  const tapReset = useRef<any>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");

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

  const changeAppIcon = (type: "default" | "foxcloud") => {
    if (type === appIcon) return;
    if (!isSponsor) {
      setBenefitsOpen(true);
      return;
    }
    const prev = appIcon;
    setAppIcon(type);
    const ok = setLauncherIcon(type);
    if (ok) {
      showToast(
        type === "foxcloud" ? "Иконка FoxCloud применена" : "Стандартная иконка восстановлена",
        "top"
      );
    } else {
      setAppIcon(prev);
      showToast("Не удалось сменить иконку", "top");
    }
  };

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
  const changeMode = (m: typeof mode) => {
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

  /** Стиль темы: меняет дизайн, режим (тёмный/светлая) сохраняется */
  const changeStyle = (next: ThemeName) => {
    setStyle(next);
    setSetting("theme", next);
    switchTheme({ style: next });
  };

  /** 5 нажатий на заголовок «Стиль темы» → диалог ввода кода секретной темы */
  const handleStyleTitleTap = () => {
    if (simpleUnlocked || isFoxcloud) return;
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

  const topPad = useScreenTopPad();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen style={topPad}>
        <Title>Внешний вид</Title>

        {/* FoxCloud (вход через Telegram): тема закреплена — режим темы
            (тёмная/авто/светлая), смена темы по времени и выбор стиля скрыты
            целиком, чтобы нельзя было уйти из FoxCloud или включить авто-смену. */}
        {!isFoxcloud && (
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
                ] as Array<[any, any, string]>
              ).map(([m, icon, label]) => {
                const autoLocked = m === "auto" && !isSponsor;
                return (
                  <PressableScale
                    key={m}
                    style={[styles.modeSeg, mode === m && styles.modeSegOn, autoLocked && { opacity: 0.6 }]}
                    onPress={() => {
                      if (autoLocked) {
                        setBenefitsOpen(true);
                        return;
                      }
                      changeMode(m);
                    }}
                    accessibilityRole="radio"
                    accessibilityLabel={`Режим темы: ${label}${autoLocked ? " — преимущество спонсоров" : ""}`}
                    accessibilityState={{ selected: mode === m }}
                  >
                    <Ionicons name={icon} size={14} color={mode === m ? "#fff" : autoLocked ? colors.textFaint : colors.textDim} />
                    <Text style={[styles.modeSegText, mode === m && { color: "#fff" }]}>{label}</Text>
                    {autoLocked && (
                      <>
                        <Ionicons name="lock-closed" size={10} color={colors.textFaint} />
                        <SponsorHeart size={9} />
                      </>
                    )}
                  </PressableScale>
                );
              })}
            </View>

            <View style={styles.themeDivider} />

            {/* Смена темы по времени — преимущество спонсоров */}
            {isSponsor ? (
              <View style={styles.themeRowLine}>
                <Ionicons name="time-outline" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.themeRowTitle}>Смена темы по времени</Text>
                  <Text style={styles.themeRowSub}>Светлая днём, тёмная ночью</Text>
                </View>
                <ThemeSwitch
                  value={mode === "auto"}
                  onValueChange={(v) => changeMode(v ? "auto" : "dark")}
                  accessibilityLabel="Смена темы по времени"
                />
              </View>
            ) : (
              <Pressable
                style={styles.themeRowLine}
                onPress={() => setBenefitsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Смена темы по времени — преимущество спонсоров. Нажмите, чтобы узнать подробнее"
              >
                <Ionicons name="time-outline" size={20} color={colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.themeRowTitle, { color: colors.textDim }]}>Смена темы по времени</Text>
                  <Text style={styles.themeRowSub}>Преимущество спонсоров</Text>
                </View>
                <View style={styles.lockWrap}>
                  <SponsorHeart size={13} />
                  <View style={styles.lockBadge}>
                    <Ionicons name="lock-closed" size={14} color="#FF9800" />
                  </View>
                </View>
              </Pressable>
            )}
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
                    <Text style={[styles.segBtnText, scheduleMode === "sun" && { color: "#fff" }]}>
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
                    <Text style={[styles.segBtnText, scheduleMode === "custom" && { color: "#fff" }]}>
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
              {isFoxcloud ? (
                <View style={styles.styleDropdownBtn}>
                  <Ionicons name="sparkles" size={13} color={colors.accent} />
                  <Text style={styles.styleDropdownText}>{THEME_LABELS[style]}</Text>
                  <Ionicons name="lock-closed" size={12} color={colors.textFaint} />
                </View>
              ) : (
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
              )}
            </View>
            <Text style={styles.hint}>
              {isFoxcloud
                ? "Вход через Telegram — тема FoxCloud закреплена"
                : mode === "auto"
                  ? "Светлая вариация включается автоматически по расписанию"
                  : "Применяется сразу, без перезагрузки"}
            </Text>

            {themeOpen && (
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
                          style={[styles.styleItemText, style === t && { color: colors.accent, fontWeight: "700" }]}
                        >
                          {THEME_LABELS[t]}
                        </Text>
                        {SPONSOR_STYLES.includes(t) && <SponsorHeart size={12} />}
                        <View style={{ flex: 1 }} />
                        {style === t && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                      </PressableScale>
                    ))}
                    {!isSponsor && (
                      <Text style={styles.hint}>
                        Темы с переливающимся сердечком доступны спонсорам (пополнение от 444 ₽ за 24 ч)
                      </Text>
                    )}
                  </PressableScale>
                </PressableScale>
              </Modal>
            )}

            {/* Секретная тема: диалог ввода кода */}
            {codeOpen && (
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
                        <PressableScale
                          style={styles.modalBtnGhost}
                          onPress={() => {
                            setCodeOpen(false);
                            setCodeInput("");
                          }}
                        >
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
            )}
          </Card>
        )}

        {/* Иконка приложения на рабочем столе (как в старом приложении).
            Для Telegram-авторизации (FoxiCloud) спонсорские фичи скрыты. */}
        <Card>
          <Text style={styles.sectionTitle}>Иконка приложения</Text>
          <View style={styles.themeRowLine}>
            <Ionicons name="phone-portrait-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.themeRowTitle}>Иконка на рабочем столе</Text>
              <Text style={styles.themeRowSub}>
                {isSponsor ? "Меняется сразу" : "Преимущество спонсоров"}
              </Text>
            </View>
            {!isSponsor && (
              <View style={styles.lockWrap}>
                <SponsorHeart size={13} />
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={14} color="#FF9800" />
                </View>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12, opacity: isSponsor ? 1 : 0.55 }}>
            {(
              [
                ["default", "app_icon", "GhostCloud"],
                ["foxcloud", "icon_fox", "FoxCloud"],
              ] as Array<[string, string, string]>
            ).map(([type, preview, label]) => {
              const active = appIcon === type;
              return (
                <PressableScale
                  key={type}
                  style={[styles.iconOption, active && { borderColor: colors.accent }]}
                  onPress={() => changeAppIcon(type as "default" | "foxcloud")}
                  accessibilityRole="radio"
                  accessibilityLabel={`Иконка приложения: ${label}`}
                  accessibilityState={{ selected: active }}
                >
                  <Image source={{ uri: preview }} style={styles.iconPreview} resizeMode="cover" />
                  <Text style={[styles.iconOptionText, active && { color: colors.accent }]}>{label}</Text>
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={colors.accent}
                      style={{ position: "absolute", top: 6, right: 6 }}
                    />
                  )}
                </PressableScale>
              );
            })}
          </View>
          <Text style={styles.hint}>
            На некоторых оболочках подпись под иконкой обновится после возврата на главный экран.
          </Text>
        </Card>

        {/* Шторка преимуществ спонсора */}
        {benefitsOpen && <SponsorBenefitsSheet visible={benefitsOpen} onClose={() => setBenefitsOpen(false)} />}
      </Screen>
    </View>
  );
}

function themeIcon(t: ThemeName): any {
  switch (t) {
    case "default":
      return "sparkles-outline";
    case "minimalist":
      return "brightness-2-outline";
    case "v2ray":
      return "hub-outline";
    case "glass":
      return "blur-on-outline";
    case "foxcloud":
      return "flame-outline";
    case "pickme":
      return "heart-outline";
    case "happ":
      return "sunny-sharp";
    case "awg":
      return "ellipse-outline";
    default:
      return "sparkles-outline";
  }
}

/** Специальные PNG-иконки тем — как в списке выбора темы Flutter-версии */
function themeIconAsset(t: ThemeName): string | null {
  switch (t) {
    case "default":
      return "theme_default";
    case "glass":
      return "theme_liquid";
    case "minimalist":
      return "theme_minimal";
    case "pickme":
      return "theme_pickme";
    case "v2ray":
      return "theme_v2ray";
    case "happ":
      return "theme_happ";
    default:
      return null;
  }
}

function ThemeGlyph({ t, size = 18 }: { t: ThemeName; size?: number }) {
  const asset = themeIconAsset(t);
  if (asset) {
    return <Image source={{ uri: asset }} style={{ width: size, height: size, borderRadius: 5 }} resizeMode="cover" />;
  }
  return <Ionicons name={themeIcon(t)} size={size} color={colors.accent} />;
}
