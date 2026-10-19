import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BASE_URL } from "../api";
import { colors, useTheme } from "../theme";

/** Встроенная лента новостей канала. Сама страница и API новостей живут на сайте. */
export default function NewsScreen() {
  const { style: themeStyle } = useTheme();
  const insets = useSafeAreaInsets();
  const isGlass = themeStyle === "glass";

  return (
    <View style={[styles.root, { backgroundColor: isGlass ? "transparent" : colors.bg }]}>
      <View style={[styles.heading, { paddingTop: insets.top + 68 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Новости канала</Text>
        <Text style={[styles.subtitle, { color: colors.textDim }]}>Обновления, акции и новости GhostCloud</Text>
      </View>
      <WebView
        source={{ uri: `${BASE_URL}/news` }}
        style={styles.webView}
        originWhitelist={["https://*"]}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#A855F7" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heading: { paddingHorizontal: 18, paddingBottom: 14 },
  title: { fontSize: 25, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 5 },
  webView: { flex: 1, backgroundColor: "transparent" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
