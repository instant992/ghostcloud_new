import React from "react";
import { ActivityIndicator, PermissionsAndroid, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer, DefaultTheme, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { APP_FONT } from "./src/fontPatch";
import { AppProvider, useApp } from "./src/context";
import { colors, ThemeProvider, useTheme } from "./src/theme";

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
import SupportTicketScreen from "./src/screens/SupportTicketScreen";
import SponsorLeaderboardScreen from "./src/screens/SponsorLeaderboardScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import V2rayScreen from "./src/screens/themes/V2rayScreen";
import HappScreen from "./src/screens/themes/HappScreen";
import MinimalistScreen from "./src/screens/themes/MinimalistScreen";
import GlassScreen, { GlassCard } from "./src/screens/themes/GlassScreen";
import SimpleScreen from "./src/screens/themes/SimpleScreen";
import { TabIcon } from "./src/components/TabIcon";
import FoxSplash from "./src/components/FoxSplash";
import { ToastHost } from "./src/components/Toast";
import { TabAreaContext } from "./src/components/UI";

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
  return (
    <View style={[tabStyles.bar, { paddingBottom: 12 + insets.bottom }]}>
      {state.routes.map((route: any, index: number) => {
        const meta = TAB_META[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            hitSlop={8}
            style={tabStyles.tabSlot}
            accessibilityRole="tab"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate(route.name);
            }}
          >
            <TabIcon
              name={focused ? meta.icon : meta.outline}
              focused={focused}
              label={meta.label}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "transparent",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  tabSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

function MainTabs() {
  return (
    <TabAreaContext.Provider value={true}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
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
 *  навигация одноэкранная, как во Flutter-версии) */
function BackOverlay({ children }: { children: React.ReactNode }) {
  const nav = useNavigation<any>();
  useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 64,
          flexDirection: "row",
          alignItems: "flex-end",
          paddingBottom: 4,
          paddingHorizontal: 2,
        }}
      >
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={12}
          style={{ width: 46, height: 42, alignItems: "center", justifyContent: "center" }}
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

/** Одноэкранная тема (v2ray / happ): домашний экран темы + все разделы
 *  открываются стеком поверх него — как во Flutter-версии. */
function ThemedFlow({ Home }: { Home: React.ComponentType }) {
  useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="ThemeHome" component={Home} />
      <Stack.Screen name="Настройки" component={SettingsWithBack} />
      <Stack.Screen name="Профиль" component={ProfileScreen} />
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

/** Стеклянный док Liquid Glass — таб-бар потока темы */
function GlassDockBar({ state, navigation }: any) {
  useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: "transparent",
        paddingHorizontal: 24,
        paddingTop: 4,
        paddingBottom: Math.max(8, insets.bottom),
      }}
    >
      <GlassCard
        radius={28}
        intensity={70}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 6 }}
      >
        {DOCK_TABS.map((t, index) => {
          const focused = state.index === index;
          const press = () => {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(t.name);
          };
          if (focused) {
            return (
              <View key={t.name} style={dockStyles.slot}>
                <Pressable onPress={press} style={dockStyles.glassPill}>
                  <Ionicons name={t.iconActive as any} size={22} color={colors.accent} />
                  <Text style={dockStyles.glassPillText}>{t.name}</Text>
                </Pressable>
              </View>
            );
          }
          return (
            <Pressable key={t.name} style={dockStyles.slot} onPress={press}>
              <Ionicons name={t.icon as any} size={24} color={colors.textFaint} />
            </Pressable>
          );
        })}
      </GlassCard>
    </View>
  );
}

/** Док минимализма (и Pink / FoxCloud) — таб-бар потока темы */
function MinimalDockBar({ state, navigation }: any) {
  useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: "transparent",
        paddingHorizontal: 24,
        paddingTop: 4,
        paddingBottom: Math.max(8, insets.bottom),
      }}
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
  );
}

const dockStyles = StyleSheet.create({
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

/** Поток темы с доком: Главная / Подписка / Профиль — вкладки,
 *  остальные разделы — стеком поверх. */
function DockedThemedFlow({
  Home,
  DockBar,
}: {
  Home: React.ComponentType;
  DockBar: React.ComponentType<any>;
}) {
  useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="ThemeTabs">
        {() => (
          <DockTabs.Navigator
            screenOptions={{ headerShown: false }}
            tabBar={(props) => <DockBar {...props} />}
          >
            <DockTabs.Screen name="Главная" component={Home} />
            <DockTabs.Screen name="Подписка" component={SubscriptionScreen} />
            <DockTabs.Screen name="Профиль" component={ProfileScreen} />
          </DockTabs.Navigator>
        )}
      </Stack.Screen>
      <Stack.Screen name="Настройки" component={SettingsWithBack} />
      <Stack.Screen name="Тарифы" component={PlansWithBack} />
      <Stack.Screen name="Статистика" component={StatsWithBack} />
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
    </Stack.Navigator>
  );
}

function MinimalistFlow() {
  return <DockedThemedFlow Home={MinimalistScreen} DockBar={MinimalDockBar} />;
}

function GlassFlow() {
  return <DockedThemedFlow Home={GlassScreen} DockBar={GlassDockBar} />;
}

function SimpleFlow() {
  return <ThemedFlow Home={SimpleScreen} />;
}

function Root() {
  const { style } = useTheme();
  const { loading, session } = useApp();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  const MainFlow =
    style === "v2ray"
      ? V2rayFlow
      : style === "happ"
        ? HappFlow
        : style === "minimalist" || style === "pickme" || style === "foxcloud"
          ? MinimalistFlow
          : style === "glass"
            ? GlassFlow
            : style === "simple"
              ? SimpleFlow
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
          <Stack.Screen
            name="SupportTicket"
            component={SupportTicketScreen}
            options={{ headerShown: true, title: "Обращение", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
          <Stack.Screen name="SponsorLeaderboard" component={SponsorLeaderboardScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
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
            <ThemedContainer>
              <Root />
            </ThemedContainer>
            <ToastHost />
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
    <NavigationContainer theme={navTheme}>
      <React.Fragment key={version}>{children}</React.Fragment>
    </NavigationContainer>
  );
}

function StatusBarFollower() {
  useTheme();
  return <ExpoStatusBar style={colors.text === "#FFFFFF" ? "light" : "dark"} />;
}
