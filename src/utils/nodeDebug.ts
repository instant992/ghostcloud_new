import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { buildXrayConfig } from "../vpn/xrayConfig";
import type { VpnNode } from "../vpn/parse";

export function showNodeConfig(node: VpnNode) {
  let config = "";
  try {
    config = buildXrayConfig(node, null);
    const parsed = JSON.parse(config);
    delete parsed.env;
    config = JSON.stringify(parsed, null, 2);
  } catch (e: any) {
    config = `Ошибка генерации: ${e?.message}`;
  }
  Alert.alert(
    node.name,
    config.length > 2800 ? `${config.slice(0, 2800)}\n…` : config,
    [
      { text: "Копировать", onPress: () => Clipboard.setStringAsync(config).catch(() => {}) },
      { text: "Закрыть", style: "cancel" },
    ]
  );
}
