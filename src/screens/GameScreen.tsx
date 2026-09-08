import React, { useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, isLightPalette } from "../theme";
import { gameRunStart, gameRunSubmit } from "../api";

/**
 * Экран мини-игры «Лиса-раннер».
 * Загружает HTML5-игру из assets (offline) через WebView.
 * Мост с сервером (лидерборд + награда +1 день за 500 монет):
 *  - игра шлёт {type:"run_start"} → RN берёт round_token и топ, передаёт обратно;
 *  - игра шлёт {type:"gameover", coins, distance, durMs, powers} → RN отправляет
 *    результат на сервер и возвращает {rewarded, leaderboard}.
 */
export default function GameScreen() {
  useTheme();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const roundToken = useRef<string | null>(null);

  const theme = isLightPalette() ? "light" : "dark";
  const src = Platform.select({
    android: "file:///android_asset/game/index.html?theme=" + theme,
    default: "file:///android_asset/game/index.html?theme=" + theme,
  });

  // Отправка данных обратно в игру
  const sendToGame = (payload: Record<string, unknown>) => {
    const js = `window.__onRN && window.__onRN(${JSON.stringify(payload)}); true;`;
    webRef.current?.injectJavaScript(js);
  };

  const onMessage = async (ev: any) => {
    let msg: any;
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    try {
      if (msg.type === "run_start") {
        const r = await gameRunStart("1.1.5");
        if (r?.success && r.round_token) {
          roundToken.current = r.round_token;
          sendToGame({
            kind: "run_ready",
            round_token: r.round_token,
            leaderboard: r.leaderboard || [],
            reward_coins: r.reward_coins || 500,
          });
        } else {
          // без сервера игра продолжает работать локально
          sendToGame({ kind: "run_ready", offline: true });
        }
      } else if (msg.type === "gameover") {
        if (!roundToken.current) {
          sendToGame({ kind: "submit_result", offline: true });
          return;
        }
        const r = await gameRunSubmit(
          roundToken.current,
          Number(msg.coins) || 0,
          Number(msg.distance) || 0,
          Number(msg.durMs) || 0,
          Array.isArray(msg.powers) ? msg.powers : []
        );
        roundToken.current = null;
        if (r?.success) {
          sendToGame({
            kind: "submit_result",
            rewarded: !!r.rewarded,
            reward_reason: r.reward_reason || "",
            leaderboard: r.leaderboard || [],
          });
        } else {
          sendToGame({ kind: "submit_result", offline: true, error: r?.error || "" });
        }
      }
    } catch {
      // сеть/сервер недоступны — игра остаётся играбельной офлайн
      sendToGame({ kind: msg.type === "run_start" ? "run_ready" : "submit_result", offline: true });
    }
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
        allowFileAccessFromFileURLs
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
