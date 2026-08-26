import React from "react";
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { APP_FONT } from "./src/fontPatch";
import { AppProvider, useApp } from "./src/context";
import { colors, isFlutterStyleTheme, withAlpha, ThemeProvider, useTheme } from "./src/theme";

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
import ScanQRScreen from "./src/screens/ScanQRScreen";
import { TabIcon } from "./src/components/TabIcon";
import FoxSplash from "./src/components/FoxSplash";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  state = { error: null as any };
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
        </View>
      );
    }
    return this.props.children;
  }
}

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_META: Record<string, { icon: string; outline: string; label: string }> = {
  Главная: { icon: "home", outline: "home-outline", label: "Главная" },
  Тарифы: { icon: "card", outline: "card-outline", label: "Тарифы" },
  Профиль: { icon: "person", outline: "person-outline", label: "Профиль" },
  Настройки: { icon: "settings", outline: "settings-outline", label: "Настройки" },
};

function CustomTabBar({ state, navigation }: any) {
  useTheme();
  const insets = useSafeAreaInsets();
  if (isFlutterStyleTheme()) {
    // Flutter floating dock: радиус 28, активная пилюля primary@0.2 + подпись
    return (
      <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
        <View
          style={{
            marginHorizontal: 24,
            paddingHorizontal: 6,
            paddingVertical: 6,
            borderRadius: 28,
            backgroundColor: colors.text === "#FFFFFF" ? colors.card : colors.cardLight,
            borderWidth: 1,
            borderColor: withAlpha(colors.border, colors.text === "#FFFFFF" ? 0.5 : 0.7),
            flexDirection: "row",
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 5 },
            elevation: 6,
          }}
        >
          {state.routes.map((route: any, index: number) => {
            const meta = TAB_META[route.name];
            if (!meta) return null;
            const focused = state.index === index;
            return (
              <Pressable
                key={route.key}
                hitSlop={4}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: focused ? withAlpha(colors.accent, 0.2) : "transparent",
                }}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  navigation.navigate(route.name);
                }}
              >
                <Ionicons
                  name={(focused ? meta.icon : meta.outline) as any}
                  size={23}
                  color={focused ? colors.accent : withAlpha(colors.text, 0.4)}
                />
                {focused && (
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}
                  >
                    {meta.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
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
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    paddingTop: 10,
  },
});

function MainTabs() {
  return (
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

function Root() {
  useTheme();
  const { loading, session } = useApp();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
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
            name="ScanQR"
            component={ScanQRScreen}
            options={{ headerShown: true, title: "Сканировать QR", headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = React.useState(false);
  // Разрешение на уведомления — сразу при запуске приложения
  React.useEffect(() => {
    import("./src/vpn/manager")
      .then((m) => m.requestNotificationPermission())
      .catch(() => {});
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBarFollower />
          <AppProvider>
            <ThemedContainer>
              <Root />
            </ThemedContainer>
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
