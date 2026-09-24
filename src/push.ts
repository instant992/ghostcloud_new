/**
 * Push-уведомления (FCM) — регистрация токена устройства на сервере и
 * настройка показа уведомлений, когда приложение открыто (foreground).
 *
 * Сервер шлёт push при входе по 2FA (data payload event=login_2fa), поэтому
 * модалка безопасности откроется даже если приложение было в фоне.
 * Рассылки из админки (Инфраструктура → Уведомления) приходят notification-
 * payload'ом на канал GhostCloud_Subscription — канал ОБЯЗАТЕЛЬНО должен
 * существовать в приложении, иначе Android 8+ молча выбрасывает уведомление.
 * Если FCM недоступен (например, устройство без Google Play) — уведомления
 * всё равно доставляются лентой: поллинг /mobile/notifications показывает
 * их локально (фолбэк-доставка).
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { fetchNotifications, registerFcmToken as apiRegisterFcmToken } from "./api";
import { getSetting, setSetting } from "./settings";

const CHANNEL_ID = "GhostCloud_Security";
/** Канал рассылок/объявлений — совпадает с channel_id в fcm_service.py
 *  (send_push_notification / broadcast). Без него серверные рассылки
 *  не отображаются на Android 8+. */
const SUBSCRIPTION_CHANNEL_ID = "GhostCloud_Subscription";
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
  await Notifications.setNotificationChannelAsync(SUBSCRIPTION_CHANNEL_ID, {
    name: "Новости и рассылки",
    importance: Notifications.AndroidImportance.DEFAULT,
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

    let fcmOk = false;
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      const token = typeof tokenData.data === "string" ? tokenData.data : "";
      if (token) {
        fcmOk = await registerFcmToken(token);
      }
    } catch (e) {
      console.warn("[Push] FCM token error:", e);
    }
    if (!fcmOk) {
      // Нет Google Play / FCM-токен не зарегистрировался — фолбэк:
      // лента серверных уведомлений поллингом.
      startNotificationFeed();
    }
  } catch (e) {
    console.warn("[Push] init error:", e);
    startNotificationFeed();
  }
}

// ── Фолбэк-доставка: поллинг ленты уведомлений без FCM ──
// Сервер хранит историю рассылок (push_notifications), /mobile/notifications
// отдаёт всё с id > after_id. Показываем их локально в шторке.

const FEED_LAST_ID_KEY = "notif_feed_last_id";
const FEED_POLL_MS = 60_000;
let _feedTimer: ReturnType<typeof setInterval> | null = null;
let _feedBusy = false;

export function startNotificationFeed(): void {
  if (_feedTimer || Platform.OS !== "android") return;
  // Первый прогон сразу, дальше — по таймеру (процесс живёт, пока
  // приложение открыто или VPN-сервис держит его в foreground).
  pollFeed().catch(() => {});
  _feedTimer = setInterval(() => pollFeed().catch(() => {}), FEED_POLL_MS);
}

export function stopNotificationFeed(): void {
  if (_feedTimer) {
    clearInterval(_feedTimer);
    _feedTimer = null;
  }
}

async function pollFeed(): Promise<void> {
  if (_feedBusy) return;
  _feedBusy = true;
  try {
    const lastId = parseInt(getSetting(FEED_LAST_ID_KEY, "0"), 10) || 0;
    const data = await fetchNotifications(lastId);
    const list: Array<{ id: number; title: string; message: string }> =
      data?.success && Array.isArray(data.notifications) ? data.notifications : [];
    if (list.length === 0) return;
    const maxId = list.reduce((m, n) => Math.max(m, n.id || 0), lastId);
    if (lastId === 0) {
      // Первый запуск: не показываем всю историю — просто запоминаем
      // последний id, чтобы следующие рассылки уже долетали.
      setSetting(FEED_LAST_ID_KEY, String(maxId));
      return;
    }
    for (const n of list) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title: n.title || "GhostCloud", body: n.message || "" },
          trigger: null, // сразу
        });
      } catch {}
    }
    setSetting(FEED_LAST_ID_KEY, String(maxId));
  } catch {
    // сеть недоступна — попробуем в следующий тик
  } finally {
    _feedBusy = false;
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
