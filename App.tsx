import React from "react";
import { AccessibilityInfo, ActivityIndicator, Easing, PermissionsAndroid, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer, DefaultTheme, useNavigation, useRoute } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "./src/context";
import { colors, ThemeProvider, useTheme, useThemeSwitcher } from "./src/theme";

import LoginScreen from "./src/screens/auth/LoginScreen";
import RegisterScreen from "./src/screens/auth/RegisterScreen";
import QRLoginScreen from "./src/screens/auth/QRLoginScreen";
import TelegramLoginScreen from "./src/screens/auth/TelegramLoginScreen";
import ResetPasswordScreen from "./src/screens/auth/ResetPasswordScreen";

import HomeScreen from "./src/screens/HomeScreen";
import PlansScreen from "./src/screens/PlansScreen";
import StatsScreen from "./src/screens/StatsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import DevicesScreen from "./src/screens/DevicesScreen";
import ReferralScreen from "./src/screens/ReferralScreen";
import TopUpScreen from "./src/screens/TopUpScreen";
import SupportScreen from "./src/screens/SupportScreen";
import NewsScreen from "./src/screens/NewsScreen";
import BugsScreen, { BugDetailScreen } from "./src/screens/BugsScreen";
import SupportTicketScreen from "./src/screens/SupportTicketScreen";
import SponsorLeaderboardScreen from "./src/screens/SponsorLeaderboardScreen";
import AboutScreen from "./src/screens/AboutScreen";
import GameScreen from "./src/screens/GameScreen";
import RequestsScreen from "./src/screens/RequestsScreen";
import AppearanceScreen from "./src/screens/settings/AppearanceScreen";
import VpnNetworkScreen from "./src/screens/settings/VpnNetworkScreen";
import GlassPlaygroundScreen from "./src/screens/settings/GlassPlaygroundScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import V2rayScreen from "./src/screens/themes/V2rayScreen";
import HappScreen from "./src/screens/themes/HappScreen";
import MinimalistScreen from "./src/screens/themes/MinimalistScreen";
import MaterialScreen from "./src/screens/themes/MaterialScreen";
import MaterialDockBar from "./src/material/MaterialDockBar";
import { MaterialProvider } from "./src/material/MaterialProvider";
import GlassScreen, { GlassCard } from "./src/screens/themes/GlassScreen";
import { GlassBackdropProvider, GlassScreenBackdrop, LiquidBottomTabs } from "./src/components/liquidGlass";
import { GlassNavigationMotion } from "./src/components/liquidGlass/GlassNavigationMotion";
import SimpleScreen from "./src/screens/themes/SimpleScreen";
import AwgScreen from "./src/screens/themes/AwgScreen";
import { TabChain } from "./src/components/TabIcon";
import FoxSplash from "./src/components/FoxSplash";
import { UpdateLayout } from "./src/components/UpdateBanner";
import { SecurityAlertModal } from "./src/components/SecurityAlertModal";
import { ToastHost } from "./src/components/Toast";
import { TabAreaContext, useScreenBgColor } from "./src/components/UI";
import { themeHasQuickNav } from "./src/components/QuickNavBar";
import { getThemeName } from "./src/settings";
import { IS_TV } from "./src/tv";
import { TvLoginScreen } from "./src/tv/TvLoginScreen";
import { TvHomeScreen } from "./src/tv/TvHomeScreen";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any; resetKey: number }
> {
  state = { error: null as any, resetKey: 0 };
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" }}>
          <Text style={{ color: colors.red, fontWeight: "800", fontSize: 16, marginBottom: 12 }}>
            Ошибка приложения
          </Text>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {String(e?.message || e)}
          </Text>
          <Text style={{ color: colors.textDim, fontSize: 10, marginTop: 12 }}>
            {String(e?.stack || "").slice(0, 1200)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }))}
            style={{
              marginTop: 18,
              backgroundColor: colors.accentDeep,
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Перезапустить</Text>
          </Pressable>
        </View>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_META: Record<string, { icon: string; outline: string; label: string }> = {
  Главная: { icon: "home", outline: "home-outline", label: "Главная" },
  // «Статистика» и «Тарифы» остаются маршрутами (доступны с главной и из профиля),
  // но скрыты из нижнего меню — туда они не нужны.
  Профиль: { icon: "person", outline: "person-outline", label: "Профиль" },
  Настройки: { icon: "settings", outline: "settings-outline", label: "Настройки" },
};

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const items = state.routes
    .map((route: any) => ({ route, meta: TAB_META[route.name] }))
    .filter((e: any) => e.meta)
    .map((e: any) => ({
      key: e.route.key,
      name: e.route.name,
      icon: e.meta.icon,
      outline: e.meta.outline,
      label: e.meta.label,
    }));
  const focusedRoute = state.routes[state.index];
  const focusedIndex = items.findIndex((it: any) => it.name === focusedRoute.name);
  return (
    // «Плавающий» таб-бар: обёртка нулевой высоты — контент экрана занимает всю
    // высоту (под меню остаётся сплошной фон экрана), а само меню позиционируется
    // абсолютно поверх него. Под меню больше нет отдельного нативного слоя,
    // состыкованного с контентом, — исчезает «прямоугольник»-шов за меню.
    <View style={{ height: 0 }} pointerEvents="box-none">
      <View style={[tabStyles.bar, { paddingBottom: 8 + insets.bottom }]} pointerEvents="box-none">
        <TabChain
          items={items}
          focusedIndex={focusedIndex}
          onPress={(i: number) => {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(items[i].name);
          }}
        />
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    backgroundColor: "transparent",
    paddingTop: 10,
  },
});

function MainTabs() {
  return (
    <TabAreaContext.Provider value={true}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          transitionSpec: DOCK_SHIFT_SPEC,
          sceneStyleInterpolator: DOCK_SHIFT_INTERPOLATOR as any,
        }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen name="Главная" component={HomeScreen} />
        <Tabs.Screen name="Статистика" component={StatsScreen} />
        <Tabs.Screen name="Тарифы" component={PlansScreen} />
        <Tabs.Screen name="Профиль" component={ProfileScreen} />
        <Tabs.Screen name="Настройки" component={SettingsScreen} />
      </Tabs.Navigator>
    </TabAreaContext.Provider>
  );
}

function AuthStack() {
  useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="QRLogin" component={QRLoginScreen} />
      <Stack.Screen name="TelegramLogin" component={TelegramLoginScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}

/** Плавающая кнопка «назад» поверх без-хедерных экранов (в темах v2ray/happ
 *  навигация одноэкранная, как во Flutter-версии).
 *  В темах без нижнего меню стрелка возвращает сразу на главный экран
 *  (popToTop) — иначе она вела бы в промежуточный экран без возможности
 *  быстро попасть на главную.
 *  toParent=true — для вложенных разделов настроек («Внешний вид», «VPN и
 *  сеть»): стрелка возвращает на уровень выше (в хаб «Настройки»), а не на
 *  главную, иначе иерархия настроек ломается. */
function BackOverlay({ children, toParent }: { children: React.ReactNode; toParent?: boolean }) {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  // Фон push-экрана. В теме Liquid Glass экран НЕЛЬЗЯ оставлять прозрачным:
  // push-сцена лежит поверх вкладок, и сквозь прозрачный фон просвечивали их
  // блоки и нижний док («в настройках всё полупрозрачное/слишком светлое»).
  // Поэтому здесь — собственный непрозрачный слой фона темы (тот же SVG, что
  // рисует провайдер, пиксель-в-пиксель): экран полностью закрывает вкладки,
  // а стеклу есть что преломлять. В остальных темах — обычный colors.bg.
  const screenBg = useScreenBgColor();
  const glassBg = theme.style === "glass";
  const handleBack = React.useCallback(() => {
    // Не определяем маршрут по сохранённой теме: при смене темы во время
    // работы приложения это значение может не совпасть с реальным стеком.
    // Сам стек надёжно сообщает, есть ли экран, который можно закрыть.
    if (!toParent && (route.name === "Настройки" || route.name === "Профиль")) {
      nav.popToTop();
      return;
    }
    if (nav.canGoBack()) {
      nav.goBack();
      return;
    }
    // Запасной путь нужен только если экран был открыт без родительского
    // маршрута (например, после восстановления состояния навигации).
    nav.popToTop();
  }, [nav]);
  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      {glassBg ? <GlassScreenBackdrop /> : null}
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          // Ниже статус-бара/выреза: раньше стрелка рисовалась от top:0 и
          // наезжала на системный статус-бар (и тапы съедала системная зона).
          top: insets.top,
          left: 0,
          right: 0,
          height: 64,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 2,
        }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={16}
          style={{ width: 52, height: 48, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="arrow-back" size={23} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const SettingsWithBack = () => (
  <BackOverlay>
    <SettingsScreen />
  </BackOverlay>
);
const PlansWithBack = () => (
  <BackOverlay>
    <PlansScreen />
  </BackOverlay>
);
const StatsWithBack = () => (
  <BackOverlay>
    <StatsScreen />
  </BackOverlay>
);
const SubscriptionWithBack = () => (
  <BackOverlay>
    <SubscriptionScreen />
  </BackOverlay>
);
const NewsWithBack = () => (
  <BackOverlay>
    <NewsScreen />
  </BackOverlay>
);
const BugsWithBack = () => <BackOverlay toParent><BugsScreen /></BackOverlay>;
const BugDetailWithBack = () => <BackOverlay toParent><BugDetailScreen /></BackOverlay>;
const AppearanceWithBack = () => (
  <BackOverlay toParent>
    <AppearanceScreen />
  </BackOverlay>
);
const VpnNetworkWithBack = () => (
  <BackOverlay toParent>
    <VpnNetworkScreen />
  </BackOverlay>
);
const GlassPlaygroundWithBack = () => (
  <BackOverlay toParent>
    <GlassPlaygroundScreen />
  </BackOverlay>
);

/** Одноэкранная тема (v2ray / happ): домашний экран темы + все разделы
 *  открываются стеком поверх него — как во Flutter-версии. */
function ThemedFlow({ Home }: { Home: React.ComponentType }) {
  useTheme();
  const { isFoxcloud } = useApp();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="ThemeHome" component={Home} />
      <Stack.Screen name="Настройки" component={SettingsWithBack} />
      <Stack.Screen name="Профиль" component={ProfileScreen} />
      <Stack.Screen name="Новости канала" component={NewsWithBack} />
      <Stack.Screen name="Тарифы" component={PlansWithBack} />
      <Stack.Screen name="Статистика" component={StatsWithBack} />
      <Stack.Screen name="Подписка" component={SubscriptionWithBack} />
      <Stack.Screen
        name="Devices"
        component={DevicesScreen}
        options={{ headerShown: true, title: "Устройства", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="Referral"
        component={ReferralScreen}
        options={{ headerShown: true, title: "Рефералы", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="TopUp"
        component={TopUpScreen}
        options={{ headerShown: true, title: "Пополнение баланса", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{ headerShown: true, title: "Поддержка", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="SupportTicket"
        component={SupportTicketScreen}
        options={{ headerShown: true, title: "Обращение", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      <Stack.Screen name="SponsorLeaderboard" component={SponsorLeaderboardScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: "О программе", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      {!isFoxcloud && (
        <Stack.Screen
          name="Game"
          component={GameScreen}
          options={{ headerShown: true, title: "GhostCloud Run", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
        />
      )}
      <Stack.Screen
        name="Requests"
        component={RequestsScreen}
        options={{ headerShown: true, title: "Запросы", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      <Stack.Screen name="Bugs" component={BugsWithBack} />
      <Stack.Screen name="BugDetail" component={BugDetailWithBack} />
      <Stack.Screen name="Appearance" component={AppearanceWithBack} />
      <Stack.Screen name="VpnNetwork" component={VpnNetworkWithBack} />
      <Stack.Screen name="GlassPlayground" component={GlassPlaygroundWithBack} />
    </Stack.Navigator>
  );
}

function V2rayFlow() {
  return <ThemedFlow Home={V2rayScreen} />;
}

function HappFlow() {
  return <ThemedFlow Home={HappScreen} />;
}

// ── Темы с нижним доком: разделы открываются как вкладки, док остаётся на месте ──

const DockTabs = createBottomTabNavigator();

const DOCK_TABS: Array<{ name: string; icon: string; iconActive: string }> = [
  { name: "Главная", icon: "home-outline", iconActive: "home" },
  { name: "Подписка", icon: "card-outline", iconActive: "card" },
  { name: "Профиль", icon: "person-outline", iconActive: "person" },
];

/** Пункты для LiquidBottomTabs (glass-док): key/label из name маршрута. */
const GLASS_DOCK_ITEMS = DOCK_TABS.map((t) => ({
  key: t.name,
  label: t.name,
  icon: t.icon,
  iconActive: t.iconActive,
}));

/** Стеклянный док Liquid Glass — таб-бар потока темы.
 *  Порт LiquidBottomTabs из каталога Backdrop: стеклянная капсула 64dp
 *  (vibrancy + blur 8 + lens 24/24, containerColor @0.4) со скользящим
 *  индикатором активной вкладки. */
function GlassDockBar({ state, navigation }: any) {
  useTheme();
  const insets = useSafeAreaInsets();
  return (
    // «Плавающий» док: обёртка нулевой высоты — контент экрана тянется до самого
    // низа, и позади дока остаётся только фон темы. Иначе за доком видна полоса
    // нативного фона окна на всю ширину («прямоугольник» внизу).
    <View style={{ height: 0 }} pointerEvents="box-none">
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "transparent",
          paddingHorizontal: 24,
          paddingTop: 4,
          paddingBottom: Math.max(8, insets.bottom),
        }}
        pointerEvents="box-none"
      >
        <LiquidBottomTabs
          items={GLASS_DOCK_ITEMS}
          selectedIndex={state.index}
          onSelect={(i) => navigation.navigate(DOCK_TABS[i].name)}
          style={{ alignSelf: "stretch" }}
        />
      </View>
    </View>
  );
}

/** Док минимализма (и Pink / FoxCloud) — таб-бар потока темы */
function MinimalDockBar({ state, navigation }: any) {
  useTheme();
  const dockStyles = makeDockStyles();
  const insets = useSafeAreaInsets();
  return (
    // «Плавающий» док: как у GlassDockBar — позади дока только фон темы,
    // без полноширинной полосы нативного фона окна.
    <View style={{ height: 0 }} pointerEvents="box-none">
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "transparent",
          paddingHorizontal: 24,
          paddingTop: 4,
          paddingBottom: Math.max(8, insets.bottom),
        }}
        pointerEvents="box-none"
      >
        <View style={dockStyles.minimalBar}>
          {DOCK_TABS.map((t, index) => {
            const focused = state.index === index;
            const press = () => {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate(t.name);
            };
            if (focused) {
              return (
                <View key={t.name} style={dockStyles.slot}>
                  <Pressable onPress={press} style={dockStyles.minimalPill}>
                    <View style={[dockStyles.minimalPillCircle, { backgroundColor: colors.accent }]}>
                      <Ionicons name={t.iconActive as any} size={21} color="#fff" />
                    </View>
                    <Text style={[dockStyles.minimalPillText, { color: colors.text }]}>{t.name}</Text>
                  </Pressable>
                </View>
              );
            }
            return (
              <Pressable key={t.name} style={dockStyles.slot} onPress={press}>
                <View
                  style={[
                    dockStyles.minimalCircle,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name={t.icon as any} size={23} color={colors.textFaint} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const makeDockStyles = () =>
  StyleSheet.create({
  slot: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
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
  minimalBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  minimalPill: {
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
  minimalPillCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  minimalPillText: { fontSize: 15, fontWeight: "600", maxWidth: 100 },
  minimalCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

/** Плавный слайд-переход между вкладками дока: экраны «листаются» влево/вправо
 *  (как forShift из bottom-tabs, но шире — 96px — и мягче: 260 мс ease-out).
 *  Знаки как в forShift: progress +1 (вкладка правее текущей) → translateX +96,
 *  т.е. правая вкладка въезжает СПРАВА; progress -1 (левее) → -96, уходит влево.
 *
 *  БЕЗ fade (opacity): при прерванной/залипшей анимации сцена оставалась на
 *  opacity 0.35 — экран выглядел пустым («только фон, блоки прозрачные, пока
 *  не перезайдёшь в приложение»). Сцена всегда полностью непрозрачна. */
const DOCK_SHIFT_INTERPOLATOR = ({ current }: { current: { progress: any } }) => ({
  sceneStyle: {
    transform: [
      {
        translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-96, 0, 96] }),
      },
    ],
  },
});

const DOCK_SHIFT_SPEC = {
  animation: "timing" as const,
  config: { duration: 260, easing: Easing.out(Easing.cubic) },
};

/** Поток темы с доком: Главная / Подписка / Профиль — вкладки,
 *  остальные разделы — стеком поверх.
 *  transparent=true: стек и вкладки прозрачные — фон рисует провайдер темы
 *  (Liquid Glass), см. GlassFlow. */
function DockedThemedFlow({
  Home,
  DockBar,
  transparent,
  material = false,
}: {
  Home: React.ComponentType;
  DockBar: React.ComponentType<any>;
  transparent?: boolean;
  material?: boolean;
}) {
  useTheme();
  const { isFoxcloud } = useApp();
  // До чтения accessibility-настройки оставляем безопасный мгновенный переход.
  const [reduceMotion, setReduceMotion] = React.useState(true);
  React.useEffect(() => {
    if (!transparent) return;
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      changed = true;
      setReduceMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active && !changed) setReduceMotion(value);
    }).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, [transparent]);
  // Фон СЦЕНЫ стека. В glass-теме сцены push-экранов НЕЛЬЗЯ делать
  // прозрачными: сквозь них видны блоки вкладок и док, а native-stack
  // сохраняет нижнюю сцену прикреплённой. Поэтому фон сцены — непрозрачный
  // colors.bg (в glass это #0F0B1E/#F4F2FA), а «воздушный» фон темы рисует
  // BackOverlay своим <GlassScreenBackdrop/> поверх фона сцены. Прозрачная
  // сцена осталась только у ThemeTabs — её закрывают непрозрачные push-сцены.
  const screenBg = colors.bg;
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: screenBg },
        // Reanimated owns glass motion; never run two scene transitions.
        ...(transparent ? { animation: "none" as const, gestureEnabled: false,
          headerBackButtonMenuEnabled: false } : null),
      }}
      screenLayout={transparent ? ({ route, children }) => route.name === "ThemeTabs"
        ? <>{children}</>
        : <GlassNavigationMotion reduceMotion={reduceMotion}>{children}</GlassNavigationMotion>
        : undefined}
    >
      <Stack.Screen name="ThemeTabs">
        {() => (
          <TabAreaContext.Provider value={true}>
            <DockTabs.Navigator
              screenOptions={{
                headerShown: false,
                transitionSpec: DOCK_SHIFT_SPEC,
                sceneStyleInterpolator: DOCK_SHIFT_INTERPOLATOR as any,
                ...(transparent ? { sceneStyle: { backgroundColor: "transparent" } } : null),
              }}
              tabBar={(props) => <DockBar {...props} />}
            >
              <DockTabs.Screen name="Главная" component={Home} />
              {!material && <DockTabs.Screen name="Подписка" component={SubscriptionScreen} />}
              <DockTabs.Screen name="Профиль" component={ProfileScreen} />
              {material && <DockTabs.Screen name="Настройки" component={SettingsScreen} />}
            </DockTabs.Navigator>
          </TabAreaContext.Provider>
        )}
      </Stack.Screen>
      <Stack.Screen name="Настройки" component={SettingsWithBack} />
      <Stack.Screen name="Новости канала" component={NewsWithBack} />
      <Stack.Screen name="Тарифы" component={PlansWithBack} />
      <Stack.Screen name="Статистика" component={StatsWithBack} />
      <Stack.Screen
        name="Devices"
        component={DevicesScreen}
        options={{ headerShown: true, title: "Устройства", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="Referral"
        component={ReferralScreen}
        options={{ headerShown: true, title: "Рефералы", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="TopUp"
        component={TopUpScreen}
        options={{ headerShown: true, title: "Пополнение баланса", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{ headerShown: true, title: "Поддержка", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
      />
      <Stack.Screen
        name="SupportTicket"
        component={SupportTicketScreen}
        options={{ headerShown: true, title: "Обращение", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
      />
      <Stack.Screen name="SponsorLeaderboard" component={SponsorLeaderboardScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: true, title: "О программе", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
      />
      {!isFoxcloud && (
        <Stack.Screen
          name="Game"
          component={GameScreen}
          options={{ headerShown: true, title: "GhostCloud Run", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
        />
      )}
      <Stack.Screen
        name="Requests"
        component={RequestsScreen}
        options={{ headerShown: true, title: "Запросы", headerStyle: { backgroundColor: screenBg }, headerTintColor: colors.text }}
      />
      <Stack.Screen name="Bugs" component={BugsWithBack} />
      <Stack.Screen name="BugDetail" component={BugDetailWithBack} />
      <Stack.Screen name="Appearance" component={AppearanceWithBack} />
      <Stack.Screen name="VpnNetwork" component={VpnNetworkWithBack} />
      <Stack.Screen name="GlassPlayground" component={GlassPlaygroundWithBack} />
    </Stack.Navigator>
  );
}

function MaterialFlow() {
  return <MaterialProvider><DockedThemedFlow Home={MaterialScreen} DockBar={MaterialDockBar} material /></MaterialProvider>;
}

function MinimalistFlow() {
  return <DockedThemedFlow Home={MinimalistScreen} DockBar={MinimalDockBar} />;
}

function GlassFlow() {
  // Тема Liquid Glass: фон рисует GlassBackdropProvider (SVG-градиент с
  // блобами в тонах стандартной темы), поэтому навигация и экраны должны быть
  // прозрачными — иначе непрозрачный colors.bg экрана перекроет фон и
  // стеклянным поверхностям нечего будет преломлять.
  return (
    <GlassBackdropProvider>
      <DockedThemedFlow Home={GlassScreen} DockBar={GlassDockBar} transparent />
    </GlassBackdropProvider>
  );
}

function SimpleFlow() {
  return <ThemedFlow Home={SimpleScreen} />;
}

function AwgFlow() {
  return <ThemedFlow Home={AwgScreen} />;
}

/** Android TV: собственный одностраничный интерфейс с боковым рельсом
 *  (Главная / Серверы / Настройки) вместо телефонных экранов. */
function TvFlow() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="TvHome" component={TvHomeScreen} />
    </Stack.Navigator>
  );
}

/** На TV интерфейс один — фиксируем основную тёмную тему, чтобы сохранённая
 *  с телефона тема (glass/pickme/…) не перекрашивала TV-экран. */
function TvThemeLock() {
  const { style, mode } = useTheme();
  const switchTheme = useThemeSwitcher();
  React.useEffect(() => {
    if (IS_TV && (style !== "default" || mode !== "dark")) {
      switchTheme({ style: "default", mode: "dark" });
    }
  }, [style, mode, switchTheme]);
  return null;
}

function Root() {
  const { style } = useTheme();
  const { loading, session, isFoxcloud } = useApp();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  // Android TV: свои экраны входа и главная — телефонный стек не показываем
  if (IS_TV) {
    return session ? <TvFlow /> : <TvLoginScreen />;
  }
  const MainFlow =
    style === "v2ray"
      ? V2rayFlow
      : style === "happ"
        ? HappFlow
        : style === "material"
          ? MaterialFlow
          : style === "minimalist" || style === "pickme" || style === "foxcloud"
          ? MinimalistFlow
          : style === "glass"
            ? GlassFlow
            : style === "simple"
              ? SimpleFlow
              : style === "awg"
                ? AwgFlow
                : MainTabs;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainFlow} />
          <Stack.Screen
            name="Devices"
            component={DevicesScreen}
            options={{ headerShown: true, title: "Устройства", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
          <Stack.Screen
            name="Referral"
            component={ReferralScreen}
            options={{ headerShown: true, title: "Рефералы", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
          <Stack.Screen
            name="TopUp"
            component={TopUpScreen}
            options={{ headerShown: true, title: "Пополнение баланса", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
          <Stack.Screen
            name="Support"
            component={SupportScreen}
            options={{ headerShown: true, title: "Поддержка", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
          <Stack.Screen name="Новости канала" component={NewsWithBack} />
          <Stack.Screen
            name="SupportTicket"
            component={SupportTicketScreen}
            options={{ headerShown: true, title: "Обращение", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
          <Stack.Screen name="SponsorLeaderboard" component={SponsorLeaderboardScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="About"
            component={AboutScreen}
            options={{ headerShown: true, title: "О программе", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
          {!isFoxcloud && (
            <Stack.Screen
              name="Game"
              component={GameScreen}
              options={{ headerShown: true, title: "GhostCloud Run", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
            />
          )}
      <Stack.Screen
        name="Requests"
        component={RequestsScreen}
        options={{ headerShown: true, title: "Запросы", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
      />
      <Stack.Screen name="Bugs" component={BugsWithBack} />
      <Stack.Screen name="BugDetail" component={BugDetailWithBack} />
      <Stack.Screen name="Appearance" component={AppearanceWithBack} />
      <Stack.Screen name="VpnNetwork" component={VpnNetworkWithBack} />
      <Stack.Screen name="GlassPlayground" component={GlassPlaygroundWithBack} />
        </>
      )}
    </Stack.Navigator>
  );
}

function SecurityAlertHost() {
  const { securityAlert, securityBusy, securityConfirm, securityDisable2fa, securityKickAll } = useApp();
  return (
    <SecurityAlertModal
      alert={securityAlert}
      busy={securityBusy}
      onConfirm={securityConfirm}
      onDisable2fa={securityDisable2fa}
      onKick={securityKickAll}
      onClose={securityConfirm}
    />
  );
}

export default function App() {
  const [splashDone, setSplashDone] = React.useState(false);

  // Разрешение на уведомления — запрашиваем сразу после запуска (заставки),
  // не дожидаясь первого подключения VPN (Android 13+)
  React.useEffect(() => {
    if (!splashDone) return;
    if (Platform.OS !== "android" || Platform.Version < 33) return;
    const t = setTimeout(() => {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [splashDone]);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBarFollower />
          <AppProvider>
            {IS_TV && <TvThemeLock />}
            <ThemedContainer>
              <UpdateLayout><Root /></UpdateLayout>
            </ThemedContainer>
            <ToastHost />
            <SecurityAlertHost />
            {!splashDone && <FoxSplash onDone={() => setSplashDone(true)} />}
          </AppProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

/** Навигация и статус-бар, перекрашивающиеся при смене темы.
 *  При смене темы всё дерево перемонтируется (key=version) — гарантия,
 *  что ни один блок не останется в старой палитре. */
function ThemedContainer({ children }: { children: React.ReactNode }) {
  const { version } = useTheme();
  const navTheme = {
    ...DefaultTheme,
    dark: colors.text === "#FFFFFF",
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };
  return (
    // Корневая подложка цвета темы: гарантирует, что позади прозрачного таб-бара
    // (и любых других прозрачных зон) виден только фон темы, а не системный
    // фон окна и не подложки навигации — исключает любые «прямоугольники» за меню.
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavigationContainer theme={navTheme}>
        <React.Fragment key={version}>{children}</React.Fragment>
      </NavigationContainer>
    </View>
  );
}

function StatusBarFollower() {
  useTheme();
  return <ExpoStatusBar style={colors.text === "#FFFFFF" ? "light" : "dark"} />;
}
