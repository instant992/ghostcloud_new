/**
 * Push-уведомления (FCM) — регистрация токена устройства на сервере и
 * настройка показа уведомлений, когда приложение открыто (foreground).
 *
 * Сервер шлёт push при входе по 2FA (data payload event=login_2fa), поэтому
 * модалка безопасности откроется даже если приложение было в фоне.
 * Если FCM недоступен (например, устройство без Google Play) — уведомление
 * всё равно придёт лентой через поллинг /mobile/me (дублирующая доставка).
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { registerFcmToken as apiRegisterFcmToken } from "./api";

const CHANNEL_ID = "GhostCloud_Security";
let _configured = false;
let _lastToken = "";

/** Показывать уведомление целиком, когда приложение открыто */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Безопасность",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#A855F7",
    sound: "default",
  });
}

/** Запрашивает разрешение и регистрирует FCM-токен на сервере.
 *  Вызывается после успешного входа и при старте с активной сессией.
 *  Ошибки глушатся: push — улучшение, а не требование для работы. */
export async function initPush(): Promise<void> {
  try {
    if (_configured) return;
    _configured = true;

    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }
    if (!granted) return;

    await ensureChannel();

    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = typeof tokenData.data === "string" ? tokenData.data : "";
    if (!token) return;

    await registerFcmToken(token);
  } catch (e) {
    console.warn("[Push] init error:", e);
  }
}

/** Отправляет FCM-токен на сервер (привязка к user_id через X-Sub-Url). */
export async function registerFcmToken(token: string): Promise<boolean> {
  if (!token) return false;
  _lastToken = token;
  try {
    const data = await apiRegisterFcmToken(token);
    return !!data?.success;
  } catch (e) {
    console.warn("[Push] register error:", e);
    return false;
  }
}

export function getLastPushToken(): string {
  return _lastToken;
}

/** Слушатель тапов по push-уведомлениям: security-событие -> onSecurityTap().
 *  Возвращает функцию отписки. */
export function addPushResponseListener(onSecurityTap: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response.notification.request.content?.data as Record<string, any> | undefined;
      if (data && (data.event === "login_2fa" || data.event === "security")) {
        onSecurityTap();
      }
    } catch {}
  });
  // Приложение могло быть открыто тапом по уведомлению из убитого состояния
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const data = response?.notification.request.content?.data as Record<string, any> | undefined;
      if (data && (data.event === "login_2fa" || data.event === "security")) onSecurityTap();
    })
    .catch(() => {});
  return () => sub.remove();
}
