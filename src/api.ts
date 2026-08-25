import { loadSession } from "./storage";

export const BASE_URL = "https://ghostcloud.space";
export const SERVERS_TOKEN = "YxaWExtSvpfVTE1qx5O87tC!sQ6IWK-k!86";
export const BOT_USERNAME = "vpnghostbot";

export type ApiResult = Record<string, any> & { success?: boolean; error?: string };

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const session = await loadSession();
  const headers: Record<string, string> = { ...extra };
  if (session?.subUrl) headers["X-Sub-Url"] = session.subUrl;
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

export async function login(loginStr: string, password: string) {
  return request("POST", "/api/auth/login", { login: loginStr, password }, { auth: false });
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

export async function updateDisplayName(displayName: string) {
  return request("PUT", "/api/auth/mobile/display-name", { display_name: displayName });
}

export async function updateLogin(login: string) {
  return request("PUT", "/api/auth/mobile/login", { login });
}

export async function uploadAvatar(uri: string): Promise<any> {
  const session = await loadSession();
  const form = new FormData();
  form.append("avatar", { uri, name: "avatar.jpg", type: "image/jpeg" } as any);
  const headers: Record<string, string> = {};
  if (session?.subUrl) headers["X-Sub-Url"] = session.subUrl;
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

export async function createTopup(amount: number, provider?: string) {
  return request("POST", "/api/auth/mobile/topup", { amount, provider });
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
  return request("POST", "/api/auth/mobile/support/send", { text, image: imageBase64 });
}

export async function supportMessages(afterId?: number) {
  const q = afterId ? `?after_id=${afterId}` : "";
  return request("GET", `/api/auth/mobile/support/messages${q}`);
}

export async function supportClose() {
  return request("POST", "/api/auth/mobile/support/close");
}

// ── Серверы ──

export async function getExtraProfiles() {
  return request("GET", "/api/extra-profiles", undefined, { auth: false });
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
