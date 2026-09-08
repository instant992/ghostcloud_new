import React, { useRef, useState } from "react";
import { View, StyleSheet, useWindowDimensions, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, isLightPalette } from "../theme";

/**
 * Экран мини-игры «Лиса-раннер».
 * Загружает HTML5-игру из assets (offline) через WebView.
 * Игра шлёт события gameover/run_start через postMessage.
 * В прототипе прогресс хранится в localStorage WebView; подключение
 * серверных наград (+1 день за 75 монет) — следующим этапом.
 */
export default function GameScreen() {
  useTheme();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  // игра сама читает ?theme из URL
  const theme = isLightPalette() ? "light" : "dark";
  const src = Platform.select({
    android: "file:///android_asset/game/index.html?theme=" + theme,
    default: "file:///android_asset/game/index.html?theme=" + theme,
  });

  const onMessage = (ev: any) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data);
      if (msg.type === "gameover") {
        setLastResult(msg);
      }
    } catch {}
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webRef}
        source={{ uri: src }}
        onMessage={onMessage}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mediaPlaybackRequiresUserAction={false}
        scalesPageToFit={false}
        overScrollMode="never"
        bounces={false}
        style={styles.web}
        containerStyle={styles.container}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0F0B1E" },
  web: { flex: 1, backgroundColor: "#0F0B1E" },
  container: { backgroundColor: "#0F0B1E" },
});
