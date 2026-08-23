import { registerRootComponent } from "expo";
import "./src/fontPatch";
import App from "./App";

declare const global: any;

const g: any = global;
if (g.ErrorUtils?.setGlobalHandler) {
  const prevHandler = g.ErrorUtils.getGlobalHandler?.();
  g.ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
    try {
      const { Alert } = require("react-native");
      const message = String(error?.message || error);
      const stack = String(error?.stack || "").slice(0, 800);
      Alert.alert("Ошибка приложения", `${message}\n\n${stack}`, [{ text: "Закрыть" }]);
    } catch {}
    if (prevHandler && !isFatal) prevHandler(error, isFatal);
  });
}

registerRootComponent(App);
