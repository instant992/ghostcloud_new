import React, { useSyncExternalStore } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { BlurView } from "expo-blur";
import { isPrivacyBlur, subscribePrivacy } from "../privacy";

/** Текст, который закрывается настоящим блюром при детекте скриншота
 *  (LTE, обход и т.п.). Поверх текста кладётся BlurView — размытие видно
 *  и на экране, и на снимке. На Android < 12 BlurView работает как
 *  полупрозрачная плёнка (тоже скрывает текст). */
export function PrivacyText({
  children,
  style,
  ...rest
}: TextProps & { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const blurred = useSyncExternalStore(subscribePrivacy, isPrivacyBlur);
  if (!blurred) {
    return (
      <Text style={style} {...rest}>
        {children}
      </Text>
    );
  }
  return (
    <View collapsable={false}>
      <Text style={style} {...rest}>
        {children}
      </Text>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <BlurView intensity={60} tint="default" style={{ flex: 1 }} />
      </View>
    </View>
  );
}
