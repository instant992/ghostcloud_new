import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors, useTheme } from "../theme";
import { getThemeName, type ThemeName } from "../settings";
import { useInTabArea } from "./UI";
import { LiquidBottomTabs } from "./liquidGlass";

type NavItem = {
  key: string;
  label: string;
  icon: string;
  iconActive: string;
  /** имена маршрутов, которые считаются «этим пунктом» (для подсветки) */
  routes: string[];
};

const HOME: NavItem = { key: "home", label: "Главная", icon: "home-outline", iconActive: "home", routes: ["ThemeHome", "Главная", "ThemeTabs"] };
const SUB: NavItem = { key: "sub", label: "Подписка", icon: "card-outline", iconActive: "card", routes: ["Подписка"] };
const PROFILE: NavItem = { key: "profile", label: "Профиль", icon: "person-outline", iconActive: "person", routes: ["Профиль"] };
const SETTINGS: NavItem = { key: "settings", label: "Настройки", icon: "settings-outline", iconActive: "settings", routes: ["Настройки"] };

/** Состав меню = док главной текущей темы:
 *  - glass / minimalist / pickme / foxcloud: пункты дока главной
 *    (Главная / Подписка / Профиль) + активный пункт «Настройки» — чтобы было
 *    видно, что открыт именно он (настройки открываются стеком поверх дока);
 *  - awg: Главная / Профиль / Настройки — как док главной AWG;
 *  - v2ray / happ / simple: на главной меню нет — здесь тоже нет,
 *    возврат на главную — стрелкой «назад» (popToTop);
 *  - default: не показывается (экраны и так внутри таб-зоны MainTabs). */
function itemsForTheme(theme: ThemeName): NavItem[] {
  switch (theme) {
    case "glass":
    case "minimalist":
    case "pickme":
    case "foxcloud":
      return [HOME, SUB, PROFILE, SETTINGS];
    case "awg":
      return [HOME, PROFILE, SETTINGS];
    default:
      return [];
  }
}

/** Есть ли у темы быстрое нижнее меню (влияет и на стрелку «назад») */
export function themeHasQuickNav(theme: ThemeName): boolean {
  return itemsForTheme(theme).length > 0;
}

/** Быстрое нижнее меню для экранов, открытых стеком поверх темы (Настройки):
 *  состав и стиль повторяют док главной текущей темы.
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
    if (it.routes.includes(route.name)) return;
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

  // Glass: тот же LiquidBottomTabs, что и док главной (порт каталога Backdrop).
  if (isGlass) {
    const glassItems = items.map((it) => ({
      key: it.key,
      label: it.label,
      icon: it.icon,
      iconActive: it.iconActive,
    }));
    const activeIndex = Math.max(
      0,
      items.findIndex((it) => it.routes.includes(route.name))
    );
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <View
          style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom), backgroundColor: "transparent", paddingHorizontal: 24 }]}
          pointerEvents="auto"
        >
          <LiquidBottomTabs
            items={glassItems}
            selectedIndex={activeIndex}
            onSelect={(i) => go(items[i])}
            style={{ alignSelf: "stretch" }}
          />
        </View>
      </View>
    );
  }

  const row = (
    <View style={isAwg ? styles.awgRow : styles.pillRow}>
      {items.map((it) => {
        const active = it.routes.includes(route.name);
        if (isAwg) {
          // AWG: иконки без подписей, плотно к центру — как док главной AWG
          return (
            <Pressable
              key={it.key}
              style={styles.awgSlot}
              onPress={() => go(it)}
              accessibilityRole="tab"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={(active ? it.iconActive : it.icon) as any}
                size={24}
                color={active ? colors.accent : colors.textFaint}
              />
            </Pressable>
          );
        }
        if (active) {
          // Активный пункт — пилюля с подписью, как активная вкладка дока главной.
          // Слот без flex — пилюля занимает столько места, сколько нужно тексту
          // (иначе в ряду из 4 пунктов подпись «Настройки» обрезается)
          return (
            <Pressable
              key={it.key}
              style={styles.activeSlot}
              onPress={() => go(it)}
              accessibilityRole="tab"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: true }}
            >
              {isGlass ? (
                <View style={styles.glassPill}>
                  <Ionicons name={it.iconActive as any} size={22} color={colors.accent} />
                  <Text style={styles.glassPillText} numberOfLines={1}>{it.label}</Text>
                </View>
              ) : (
                <View style={styles.pill}>
                  <View style={[styles.pillCircle, { backgroundColor: colors.accent }]}>
                    <Ionicons name={it.iconActive as any} size={21} color="#fff" />
                  </View>
                  <Text style={[styles.pillText, { color: colors.text }]} numberOfLines={1}>{it.label}</Text>
                </View>
              )}
            </Pressable>
          );
        }
        // Неактивный пункт
        return (
          <Pressable key={it.key} style={styles.slot} onPress={() => go(it)} accessibilityRole="tab" accessibilityLabel={it.label}>
            {isGlass ? (
              // Glass: неактивные — простые иконки без кружков, как в GlassDockBar
              <Ionicons name={it.icon as any} size={24} color={colors.textFaint} />
            ) : (
              <View style={[styles.circle, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={it.icon as any} size={23} color={colors.textFaint} />
              </View>
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
          // «Плавающая» пилюля без подложки — как док главной в док-темах;
          // AWG — панель с фоном и разделителем, как его док
          isAwg
            ? { backgroundColor: colors.bgSoft, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 0 }
            : { backgroundColor: "transparent", paddingHorizontal: 24 },
        ]}
        pointerEvents="auto"
      >
        {isAwg ? (
          <View style={{ alignSelf: "stretch", paddingTop: 4 }}>{row}</View>
        ) : (
          <View style={[styles.minimalBar, { backgroundColor: colors.cardLight, borderColor: colors.border }]}>{row}</View>
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
    paddingTop: 4,
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
  // док-темы: слоты как в MinimalDockBar/GlassDockBar.
  // width: 100% — без него внутри горизонтального minimalBar ряд сжимается
  // по контенту и кружки сбиваются влево
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  minimalBar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
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
  // Активный слот: по содержимому — пилюля с подписью не обрезается
  activeSlot: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  // Активная пилюля минимализма — как minimalPill в MinimalDockBar
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
  pillCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontSize: 15, fontWeight: "600", maxWidth: 130 },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Стеклянная активная пилюля — как glassPill в GlassDockBar
  glassPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 0.5,
    borderColor: colors.accent + "4D",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  glassPillText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
});
