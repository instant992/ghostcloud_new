import React from "react";
import { StyleSheet } from "react-native";
import * as ReactNative from "react-native";

export const APP_FONT = "Huninn-Regular";

const OriginalText = (ReactNative as any).Text;
const OriginalTextInput = (ReactNative as any).TextInput;

const withFont = (style: any) => StyleSheet.compose({ fontFamily: APP_FONT }, style);

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
