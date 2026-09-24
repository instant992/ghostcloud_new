import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors, useTheme } from "../theme";
import { getThemeName, type ThemeName } from "../settings";
import { useInTabArea } from "./UI";
import { GlassCard } from "../screens/themes/GlassScreen";

type NavItem = {
  key: string;
  label: string;
  icon: string;
  iconActive: string;
  /** имена маршрутов, которые считаются «этим пунктом» (для подсветки) */
  routes: string[];
};

/** Состав меню = док главной текущей темы:
 *  - glass / minimalist / pickme / foxcloud: Главная / Подписка / Профиль
 *    (как DOCK_TABS на главной этих тем);
 *  - awg: Главная / Профиль / Настройки — 3 иконки без подписей, как док AWG;
 *  - v2ray / happ: дока на главной нет — минимальный набор разделов стека;
 *  - simple: Главная / Профиль (настройки защищены кодом — пункт не показываем,
 *    чтобы меню не позволяло обойти блокировку);
 *  - default: не показывается (экраны и так внутри таб-зоны MainTabs). */
function itemsForTheme(theme: ThemeName): NavItem[] {
  const home: NavItem = { key: "home", label: "Главная", icon: "home-outline", iconActive: "home", routes: ["ThemeHome", "Главная", "ThemeTabs"] };
  const sub: NavItem = { key: "sub", label: "Подписка", icon: "card-outline", iconActive: "card", routes: ["Подписка"] };
  const profile: NavItem = { key: "profile", label: "Профиль", icon: "person-outline", iconActive: "person", routes: ["Профиль"] };
  const settings: NavItem = { key: "settings", label: "Настройки", icon: "settings-outline", iconActive: "settings", routes: ["Настройки"] };

  switch (theme) {
    case "glass":
    case "minimalist":
    case "pickme":
    case "foxcloud":
      return [home, sub, profile];
    case "simple":
      return [home, profile];
    case "default":
      return [];
    default:
      // awg, v2ray, happ
      return [home, profile, settings];
  }
}

/** Быстрое нижнее меню для экранов, открытых стеком поверх темы (Профиль,
 *  Настройки): состав и стиль повторяют док главной текущей темы.
 *  Внутри таб-зоны (где уже есть свой таб-бар/док) автоматически скрыто. */
export function QuickNavBar() {
  useTheme();
  const inTabs = useInTabArea();
  const nav = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const theme = getThemeName();

  if (inTabs) return null;
  const items = itemsForTheme(theme);
  if (!items.length) return null;

  const routeNames: string[] = nav.getState?.()?.routeNames ?? [];
  const hasDockTabs = routeNames.includes("ThemeTabs");

  const go = (it: NavItem) => {
    Haptics.selectionAsync().catch(() => {});
    switch (it.key) {
      case "home":
        if (hasDockTabs) nav.navigate("ThemeTabs", { screen: "Главная" });
        else nav.navigate("ThemeHome");
        break;
      case "sub":
        if (hasDockTabs) nav.navigate("ThemeTabs", { screen: "Подписка" });
        else nav.navigate("Подписка");
        break;
      case "profile":
        if (hasDockTabs) nav.navigate("ThemeTabs", { screen: "Профиль" });
        else nav.navigate("Профиль");
        break;
      default:
        nav.navigate("Настройки");
    }
  };

  const isAwg = theme === "awg";
  const isGlass = theme === "glass";
  // Стиль дока dock-тем (минимализм/Pink/FoxCloud) — пилюля с кружком, как MinimalDockBar
  const pillStyle = !isAwg && theme !== "v2ray" && theme !== "happ" && theme !== "simple";

  const row = (
    <View style={pillStyle ? styles.pillRow : isAwg ? styles.awgRow : styles.plainRow}>
      {items.map((it) => {
        const active = it.routes.includes(route.name);
        if (pillStyle) {
          if (active) {
            if (isGlass) {
              // Стекло: активная пилюля accentSoft с акцентной иконкой — как GlassDockBar
              return (
                <Pressable
                  key={it.key}
                  style={styles.slot}
                  onPress={() => go(it)}
                  accessibilityRole="tab"
                  accessibilityLabel={it.label}
                  accessibilityState={{ selected: true }}
                >
                  <View style={styles.glassPill}>
                    <Ionicons name={it.iconActive as any} size={22} color={colors.accent} />
                    <Text style={styles.glassPillText}>{it.label}</Text>
                  </View>
                </Pressable>
              );
            }
            return (
              <Pressable
                key={it.key}
                style={styles.slot}
                onPress={() => go(it)}
                accessibilityRole="tab"
                accessibilityLabel={it.label}
                accessibilityState={{ selected: true }}
              >
                <View style={styles.pill}>
                  <View style={[styles.pillCircle, { backgroundColor: colors.accent }]}>
                    <Ionicons name={it.iconActive as any} size={21} color="#fff" />
                  </View>
                  <Text style={[styles.pillText, { color: colors.text }]}>{it.label}</Text>
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable key={it.key} style={styles.slot} onPress={() => go(it)} accessibilityRole="tab" accessibilityLabel={it.label}>
              <View style={[styles.circle, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={it.icon as any} size={23} color={colors.textFaint} />
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={it.key}
            style={isAwg ? styles.awgSlot : styles.slot}
            onPress={() => go(it)}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={(active ? it.iconActive : it.icon) as any}
              size={isAwg ? 24 : 23}
              color={active ? colors.accent : colors.textFaint}
            />
            {!isAwg && (
              <Text style={[styles.label, { color: active ? colors.accent : colors.textFaint }]} numberOfLines={1}>
                {it.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          { paddingBottom: Math.max(8, insets.bottom) },
          // AWG и стековые темы: панель на весь низ с фоном и разделителем,
          // как док главной AWG; док-темы (минимализм/Pink/FoxCloud/стекло):
          // «плавающая» пилюля без подложки — как док их главной
          pillStyle || isGlass
            ? { backgroundColor: "transparent", paddingHorizontal: 24 }
            : {
                backgroundColor: colors.bgSoft,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              },
        ]}
        pointerEvents="auto"
      >
        {isGlass ? (
          <View style={styles.padded} pointerEvents="box-none">
            <GlassCard radius={28} intensity={70} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
              {row}
            </GlassCard>
          </View>
        ) : pillStyle ? (
          <View style={styles.padded} pointerEvents="box-none">
            <View style={[styles.minimalBar, { backgroundColor: colors.cardLight, borderColor: colors.border }]}>{row}</View>
          </View>
        ) : (
          row
        )}
      </View>
    </View>
  );
}

/** Высота панели — для отступов контента снизу */
export const QUICK_NAV_HEIGHT = 78;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    alignItems: "center",
    paddingTop: 8,
  },
  padded: {
    paddingHorizontal: 24,
    alignSelf: "stretch",
  },
  // AWG: плотный ряд иконок к центру — как док главной AWG
  awgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 44,
  },
  // Компактный слот AWG: без flex — иконки собираются к центру, а не растягиваются
  awgSlot: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  // v2ray/happ/simple: иконки с подписями
  plainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    alignSelf: "stretch",
    paddingHorizontal: 8,
  },
  // док-темы: пилюля как MinimalDockBar
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  minimalBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardLight,
    paddingLeft: 6,
    paddingRight: 16,
    height: 52,
  },
  // Стеклянная активная пилюля — как в GlassDockBar
  glassPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 0.5,
    borderColor: colors.accent + "4D",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  glassPillText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  pillCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontSize: 15, fontWeight: "600", maxWidth: 100 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
