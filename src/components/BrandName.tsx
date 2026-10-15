import React, { useId, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";

/** Shared wordmark; native text measures font scaling and layout. */
export function BrandName({ style, solidColor }: { style?: StyleProp<TextStyle>; solidColor?: string }) {
  const id = `brand${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const s = StyleSheet.flatten(style) || {};
  const { fontScale } = useWindowDimensions();
  const fontSize = s.fontSize || 22;
  const renderedFontSize = fontSize * fontScale;
  return (
    <View style={style} accessible accessibilityRole="text" accessibilityLabel="GhostCloud">
      <Text
        accessible={false}
        style={{ fontFamily: s.fontFamily, fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, opacity: 0 }}
        numberOfLines={1}
        onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}
      >GhostCloud</Text>
      {size.width > 0 && <Svg pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
        {solidColor ? (
          <SvgText x={s.textAlign === "center" ? size.width / 2 : 0} y={size.height / 2 + renderedFontSize * 0.35} textAnchor={s.textAlign === "center" ? "middle" : "start"} fill={solidColor} fontFamily={s.fontFamily} fontSize={renderedFontSize} fontWeight={s.fontWeight} letterSpacing={s.letterSpacing}>GhostCloud</SvgText>
        ) : (
          <>
            <Defs>
              <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0" stopColor="#D8C7FA" />
                <Stop offset="0.5" stopColor="#BE9CEC" />
                <Stop offset="1" stopColor="#A580D9" />
              </LinearGradient>
            </Defs>
            <SvgText x={s.textAlign === "center" ? size.width / 2 : 0} y={size.height / 2 + renderedFontSize * 0.35} textAnchor={s.textAlign === "center" ? "middle" : "start"} fill={`url(#${id})`} fontFamily={s.fontFamily} fontSize={renderedFontSize} fontWeight={s.fontWeight} letterSpacing={s.letterSpacing}>GhostCloud</SvgText>
          </>
        )}
      </Svg>}
    </View>
  );
}
