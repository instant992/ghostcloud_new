import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomNavigation } from "react-native-paper";
import { CommonActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const icons: Record<string, string> = { "Главная": "home", "Профиль": "account-circle", "Настройки": "cog" };
export default function MaterialDockBar({ state, navigation, descriptors }: any) {
  const insets = useSafeAreaInsets();
  return <BottomNavigation.Bar navigationState={state} safeAreaInsets={{ bottom: insets.bottom }} keyboardHidesNavigationBar
    onTabPress={({ route, preventDefault }) => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (event.defaultPrevented) preventDefault();
      else navigation.dispatch({ ...CommonActions.navigate(state.routes.find((item: any) => item.key === route.key).name, state.routes.find((item: any) => item.key === route.key).params), target: state.key });
    }}
    renderIcon={({ route, focused, color }) => <MaterialCommunityIcons name={`${icons[state.routes.find((item: any) => item.key === route.key).name] || "circle"}${focused ? "" : "-outline"}` as any} size={24} color={color} />}
    getLabelText={({ route }) => descriptors[route.key]?.options.tabBarLabel || state.routes.find((item: any) => item.key === route.key).name} />;
}
