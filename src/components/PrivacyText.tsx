import React, { useSyncExternalStore } from "react";
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { isPrivacyBlur, subscribePrivacy } from "../privacy";

/** Текст, который размывается при детекте скриншота (LTE, обход и т.п.).
 *  Размытие рисуется прямо на экране, поэтому и на снимке текст не читается. */
export function PrivacyText({
  children,
  style,
  ...rest
}: TextProps & { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const blurred = useSyncExternalStore(subscribePrivacy, isPrivacyBlur);
  if (!blurred) return <Text style={style} {...rest}>{children}</Text>;
  const flat: any = StyleSheet.flatten(style) || {};
  const color = typeof flat?.color === "string" ? flat.color : "#FFFFFF";
  return (
    <Text
      {...rest}
      style={[
        style,
        {
          color: "transparent",
          textShadowColor: color,
          textShadowRadius: 8,
          textShadowOffset: { width: 0, height: 0 },
        },
      ]}
    >
      {children}
    </Text>
  );
}
