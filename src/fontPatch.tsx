import React from "react";
import { StyleSheet } from "react-native";
import * as ReactNative from "react-native";
import { getThemeName } from "./settings";

/** Шрифт по умолчанию (основная тема и все темы без собственного шрифта) */
export const APP_FONT = "Huninn-Regular";

/** Собственные шрифты тем — перенесены из старого проекта
 *  (ghostcloudapp-upgrade-kotlin-2-2): liquidGlass → Nunito, v2ray → ChironHeiHK */
const THEME_FONTS: Record<string, string> = {
  glass: "Nunito-Medium",
  v2ray: "ChironHeiHK-Medium",
};

export function fontForTheme(style: string): string {
  return THEME_FONTS[style] || APP_FONT;
}

/** Текущий шрифт приложения. Меняется при смене темы через setAppFont —
 *  все перерисовки подхватывают новое значение. */
let currentFont: string = (() => {
  try {
    return fontForTheme(getThemeName());
  } catch {
    return APP_FONT;
  }
})();

export function getAppFont(): string {
  return currentFont;
}

export function setAppFont(font: string): void {
  currentFont = font;
}

const OriginalText = (ReactNative as any).Text;
const OriginalTextInput = (ReactNative as any).TextInput;

const withFont = (style: any) => StyleSheet.compose({ fontFamily: currentFont }, style);

function safePatch(name: string, Original: any, Patched: any) {
  try {
    (ReactNative as any)[name] = Patched;
  } catch (e) {
    // Не удалось пропатчить — шрифт применится только там, где задан явно
  }
}

const PatchedText = React.forwardRef<any, any>((props, ref) => (
  <OriginalText {...props} ref={ref} style={withFont(props.style)} />
));
PatchedText.displayName = "Text";

const PatchedTextInput = React.forwardRef<any, any>((props, ref) => (
  <OriginalTextInput {...props} ref={ref} style={withFont(props.style)} />
));
PatchedTextInput.displayName = "TextInput";

safePatch("Text", OriginalText, PatchedText);
safePatch("TextInput", OriginalTextInput, PatchedTextInput);
