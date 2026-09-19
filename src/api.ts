import { loadSession } from "./storage";

export const BASE_URL = "https://ghostcloud.space";
export const SERVERS_TOKEN = "YxaWExtSvpfVTE1qx5O87tC!sQ6IWK-k!86";
export const BOT_USERNAME = "vpnghostbot";

export type ApiResult = Record<string, any> & { success?: boolean; error?: string };

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const session = await loadSession();
  const headers: Record<string, string> = { ...extra };
  if (session?.subUrl) headers["X-Sub-Url"] = session.subUrl;
  // FoxiCloud (Telegram-авторизация): бэкенд приоритетно ищет юзера по tg_id
  if (session?.tgId) headers["X-Tg-Id"] = session.tgId;
  return headers;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: any,
  opts: { auth?: boolean; rawBody?: boolean } = {}
): Promise<any> {
  const useAuth = opts.auth !== false;
  const headers: Record<string, string> = useAuth ? await authHeaders() : {};
  let payload: string | undefined;
  if (body !== undefined) {
    if (!opts.rawBody) headers["Content-Type"] = "application/json";
    payload = typeof body === "string" ? body : JSON.stringify(body);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    throw new ApiError("Нет соединения с сервером", 0, e);
  }
  clearTimeout(timeout);
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok && !data) {
    throw new ApiError(`Ошибка сети (${res.status})`, res.status, null);
  }
  return data;
}

// ── Auth ──

export async function login(loginStr: string, password?: string, totpCode?: string) {
  // Пароль и код 2ФА — взаимозаменяемые способы входа: достаточно любого одного.
  const body: Record<string, unknown> = { login: loginStr };
  if (password) body.password = password;
  if (totpCode) body.totp_code = totpCode;
  return request("POST", "/api/auth/login", body, { auth: false });
}

export async function login2fa(totpCode: string) {
  // Вход ТОЛЬКО по коду 2FA — без логина и пароля (сервер найдёт аккаунт по коду).
  return request("POST", "/api/auth/login-2fa", { totp_code: totpCode }, { auth: false });
}

export async function checkEmail(email: string) {
  return request("POST", "/api/check-email", { email }, { auth: false });
}

export async function sendEmailCode(email: string) {
  return request("POST", "/api/register/send-email-code", { email }, { auth: false });
}

export async function verifyEmailCode(email: string, code: string) {
  return request("POST", "/api/register/verify-email-code", { email, code }, { auth: false });
}

export async function resetPassword(payload: Record<string, unknown>) {
  return request("POST", "/api/reset-password", payload, { auth: false });
}

// ── Profile ──

export async function getMe() {
  return request("GET", "/api/auth/mobile/me");
}

// ── Push / Security alerts ──

export async function registerFcmToken(fcmToken: string) {
  return request("POST", "/api/auth/mobile/fcm-register", { fcm_token: fcmToken });
}

export async function securityAlertRead(alertId: number) {
  return request("POST", "/api/auth/mobile/security/alert-read", { alert_id: alertId });
}

export async function securityDisable2fa(alertId: number) {
  return request("POST", "/api/auth/mobile/security/disable-2fa", { alert_id: alertId });
}

export async function securityKick(alertId: number) {
  return request("POST", "/api/auth/mobile/security/kick", { alert_id: alertId });
}

export async function updateDisplayName(displayName: string) {
  return request("PUT", "/api/auth/mobile/display-name", { display_name: displayName });
}

export async function updateLogin(login: string, sponsorNick = false) {
  return request("PUT", "/api/auth/mobile/login", { login, sponsor_nick: sponsorNick });
}

export async function uploadAvatar(uri: string): Promise<any> {
  const session = await loadSession();
  const form = new FormData();
  form.append("avatar", { uri, name: "avatar.jpg", type: "image/jpeg" } as any);
  const headers: Record<string, string> = {};
  if (session?.subUrl) headers["X-Sub-Url"] = session.subUrl;
  if (session?.tgId) headers["X-Tg-Id"] = session.tgId;
  const res = await fetch(`${BASE_URL}/api/auth/mobile/avatar`, {
    method: "POST",
    headers,
    body: form,
  });
  try {
    return await res.json();
  } catch {
    return { success: false, error: `Ошибка ${res.status}` };
  }
}

export async function getDevices() {
  return request("GET", "/api/auth/mobile/devices");
}

export async function banDevice(hwid: string, os?: string, model?: string) {
  return request("POST", "/api/auth/mobile/devices/ban", { hwid, os, model });
}

export async function unbanDevice(hwid: string) {
  return request("POST", "/api/auth/mobile/devices/unban", { hwid });
}

export async function deleteDevice(hwid: string) {
  return request("POST", "/api/auth/mobile/devices/delete", { hwid });
}

export async function buyDevices(count: number) {
  return request("POST", "/api/auth/mobile/devices/buy", { count });
}

// ── Payments ──

export async function getPrices() {
  return request("GET", "/api/auth/mobile/prices");
}

export async function createPayment(payload: Record<string, unknown>) {
  return request("POST", "/api/create-payment", payload, { auth: false });
}

export async function paymentStatus(paymentId: string) {
  return request("GET", `/api/payment-status?payment_id=${encodeURIComponent(paymentId)}`, undefined, { auth: false });
}

export async function createTopup(amount: number, provider?: string, foxMethod?: string, foxOption?: string) {
  return request("POST", "/api/auth/mobile/topup", {
    amount,
    provider,
    ...(foxMethod ? { method: foxMethod } : {}),
    ...(foxOption ? { option: foxOption } : {}),
  });
}

/** Способы оплаты FoxCloud (Bedolaga): { methods: [{id, name, requires_amount, min_amount_kopeks, options:[{id,title,icon}]}] } */
export async function getFoxPaymentMethods() {
  return request("GET", "/api/auth/mobile/fox/payment-methods");
}

/** Доступные платёжные системы: { providers: [{id, name, description, default, is_extra}], default } */
export async function getPaymentProviders() {
  return request("GET", "/api/payment-providers", undefined, { auth: false });
}

export async function topupStatus(orderId: string) {
  return request("GET", `/api/auth/mobile/topup/status?order_id=${encodeURIComponent(orderId)}`);
}

export async function applyPromo(code: string) {
  return request("POST", "/api/auth/mobile/promo/apply", { code });
}

export async function checkPromo(code: string, plan: string) {
  return request("POST", "/api/promo/check", { code, plan }, { auth: false });
}

export async function extendFromBalance(plan: string) {
  return request("POST", "/api/auth/mobile/extend", { plan });
}

// ── FoxiCloud (Telegram-авторизация): продление через Bedolaga API ──

export async function foxRenewalOptions() {
  return request("GET", "/api/auth/mobile/fox/renewal-options");
}

export async function foxRenew(periodDays: number) {
  return request("POST", "/api/auth/mobile/fox/renew", { period_days: periodDays });
}

export async function autoRenewGet() {
  return request("GET", "/api/auth/mobile/auto-renew");
}

export async function autoRenewSet(enabled: boolean, plan: string) {
  return request("POST", "/api/auth/mobile/auto-renew", { enabled, plan });
}

export async function savedCards() {
  return request("GET", "/api/auth/mobile/saved-cards");
}

export async function balanceHistory() {
  return request("GET", "/api/auth/mobile/balance/history");
}

// ── Referral ──

export async function referralInfo() {
  return request("GET", "/api/auth/mobile/referral");
}

export async function referralApply(code: string) {
  return request("POST", "/api/auth/mobile/referral/apply", { code });
}

// ── Telegram link ──

export async function telegramLink() {
  return request("POST", "/api/auth/mobile/telegram-link");
}

export async function telegramUnlink() {
  return request("POST", "/api/auth/mobile/telegram-unlink");
}

// ── QR login ──

export async function qrCreateSession() {
  return request("POST", "/api/auth/mobile/qr-session", undefined, { auth: false });
}

export async function qrStatus(sessionId: string) {
  return request("GET", `/api/auth/mobile/qr-status/${sessionId}`, undefined, { auth: false });
}

export async function qrConfirm(sessionId: string) {
  return request("POST", "/api/auth/mobile/qr-confirm", { session_id: sessionId });
}

// ── Support ──

export async function supportSend(text: string, imageBase64?: string) {
  const body: Record<string, any> = {};
  if (text.trim()) body.text = text.trim();
  if (imageBase64) body.image = imageBase64;
  return request("POST", "/api/auth/mobile/support/send", body);
}

export async function supportMessages(afterId?: number) {
  const q = afterId ? `?after_id=${afterId}` : "";
  return request("GET", `/api/auth/mobile/support/messages${q}`);
}

export async function supportClose() {
  return request("POST", "/api/auth/mobile/support/close");
}

/** Список всех обращений (история тикетов) */
export async function supportHistory() {
  return request("GET", "/api/auth/mobile/support/history");
}

/** Сообщения конкретного тикета (просмотр истории) */
export async function supportTicketMessages(ticketId: number) {
  return request("GET", `/api/auth/mobile/support/history/${ticketId}`);
}

/** Переоткрыть закрытый тикет (в течение 24 часов) */
export async function supportReopen(ticketId: number) {
  return request("POST", "/api/auth/mobile/support/reopen", { ticket_id: ticketId });
}

/** Аватар сотрудника поддержки */
export async function supportAvatar() {
  return request("GET", "/api/auth/mobile/support/avatar", undefined, { auth: false });
}

// ── Серверы ──

export async function getExtraProfiles() {
  return request("GET", "/api/extra-profiles", undefined, { auth: false });
}

/** Содержимое LTE-профиля через наш бэкенд-прокси: некоторые провайдеры
 *  (stealthsurf) отдают пустое тело на User-Agent мобильных клиентов (okhttp),
 *  поэтому подписку скачивает сервер, а не приложение. */
export async function getExtraProfileContent(profileId: string): Promise<string> {
  const r = await request(
    "GET",
    `/api/extra-profiles/${encodeURIComponent(profileId)}/content`,
    undefined,
    { auth: false }
  );
  if (!r?.success || typeof r.content !== "string" || !r.content) {
    throw new Error("Профиль недоступен");
  }
  return r.content;
}

// ─── Спонсоры ───

export async function claimSponsorDevice() {
  return request("POST", "/api/auth/mobile/sponsor/claim-device");
}

export async function getGiftKeyStatus() {
  return request("GET", "/api/auth/mobile/gift-key/status");
}

export async function generateGiftKey() {
  return request("POST", "/api/auth/mobile/gift-key/generate");
}

export async function getSponsorNewsMirror() {
  return request("GET", "/api/auth/mobile/news-mirror");
}

export async function activateGiftKey(token: string) {
  return request("POST", "/api/auth/mobile/gift-key/activate", { token });
}

export async function getDonorLeaderboard() {
  return request("GET", "/api/auth/mobile/donors/leaderboard");
}

export async function getReferralLeaderboard() {
  return request("GET", "/api/auth/mobile/referral/leaderboard");
}

// ─── Подарить подписку за деньги (другому пользователю) ───

export async function giftSubscription(recipient: string, plan: string) {
  return request("POST", "/api/auth/mobile/gift", { recipient, plan });
}

export async function getGiftHistory() {
  return request("GET", "/api/auth/mobile/gifts");
}

// ─── 2FA (TOTP) ───

export async function twoFaStatus() {
  return request("GET", "/api/auth/mobile/2fa/status");
}

export async function twoFaSetup() {
  return request("POST", "/api/auth/mobile/2fa/setup");
}

export async function twoFaConfirm(code: string) {
  return request("POST", "/api/auth/mobile/2fa/confirm", { code });
}

export async function twoFaDisable(code: string, password?: string) {
  return request("POST", "/api/auth/mobile/2fa/disable", { code, password });
}

export async function twoFaRegenerateBackup(code: string, password?: string) {
  return request("POST", "/api/auth/mobile/2fa/regenerate-backup", { code, password });
}

// ─── Объявления ───

export type AnnouncementButton = { label?: string; text?: string; url?: string };

export type Announcement = {
  id: number;
  text: string;
  bg_color?: string;
  text_color?: string;
  is_dismissible?: number | boolean;
  buttons?: AnnouncementButton[];
  created_at?: string;
};

export async function getAnnouncements(): Promise<Announcement[]> {
  const r = await request("GET", "/api/auth/mobile/announcements");
  return Array.isArray(r?.announcements) ? r.announcements : [];
}

// ─── Мини-игра «GhostCloud Run» ───

export type GameLeaderRow = { login: string; best_coins: number; best_distance: number };

export async function gameRunStart(clientVer?: string) {
  return request("POST", "/api/auth/mobile/game/run-start", { client_ver: clientVer || "1.1.5" });
}

export async function gameRunSubmit(roundToken: string, coins: number, distance: number, durationMs: number, powerupsUsed?: string[]) {
  return request("POST", "/api/auth/mobile/game/run-submit", {
    round_token: roundToken,
    coins,
    distance,
    duration_ms: durationMs,
    powerups_used: JSON.stringify(powerupsUsed || []),
  });
}

export async function gameLeaderboard() {
  return request("GET", "/api/auth/mobile/game/leaderboard");
}
