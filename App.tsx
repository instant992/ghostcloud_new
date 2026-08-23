import React from "react";
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { APP_FONT } from "./src/fontPatch";
import { AppProvider, useApp } from "./src/context";
import { colors } from "./src/theme";

import LoginScreen from "./src/screens/auth/LoginScreen";
import RegisterScreen from "./src/screens/auth/RegisterScreen";
import QRLoginScreen from "./src/screens/auth/QRLoginScreen";
import TelegramLoginScreen from "./src/screens/auth/TelegramLoginScreen";
import ResetPasswordScreen from "./src/screens/auth/ResetPasswordScreen";

import HomeScreen from "./src/screens/HomeScreen";
import PlansScreen from "./src/screens/PlansScreen";
import StatsScreen from "./src/screens/StatsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import DevicesScreen from "./src/screens/DevicesScreen";
import ReferralScreen from "./src/screens/ReferralScreen";
import TopUpScreen from "./src/screens/TopUpScreen";
import SupportScreen from "./src/screens/SupportScreen";
import { TabIcon } from "./src/components/TabIcon";

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

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_META: Record<string, { icon: string; outline: string; label: string }> = {
  Главная: { icon: "home", outline: "home-outline", label: "Главная" },
  Статистика: { icon: "stats-chart", outline: "stats-chart-outline", label: "Статистика" },
  Тарифы: { icon: "card", outline: "card-outline", label: "Тарифы" },
  Профиль: { icon: "person", outline: "person-outline", label: "Профиль" },
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
            onPress={() => navigation.navigate(route.name)}
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
    </Tabs.Navigator>
  );
}

function AuthStack() {
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
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ExpoStatusBar style="light" />
        <AppProvider>
          <NavigationContainer theme={navTheme}>
            <Root />
          </NavigationContainer>
        </AppProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
