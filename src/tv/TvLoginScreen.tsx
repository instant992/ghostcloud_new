import { BrandName } from "../components/BrandName";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import { saveSession } from "../storage";
import { qrCreateSession, qrStatus } from "../api";
import { useApp } from "../context";
import { colors, useTheme } from "../theme";
import { TvFocusable } from "./TvFocusable";

/** Вход на Android TV. Основной способ — QR-код (сканируется телефоном с
 *  уже выполненным входом: Профиль → «Отсканировать QR»); запасной — логин и
 *  пароль с экранной клавиатуры. Крупные элементы, полная навигация D-pad'ом. */
export function TvLoginScreen() {
  useTheme();
  const { signIn, signIn2fa, refreshMe, reloadNodes } = useApp();
  const [mode, setMode] = useState<"main" | "qr" | "password">("main");
  const [sessionId, setSessionId] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);
  const [qrError, setQrError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loginStr, setLoginStr] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);

  const createSession = useCallback(async () => {
    setCreating(true);
    setQrError(null);
    setExpired(false);
    setSessionId("");
    try {
      const r = await qrCreateSession();
      if (!r?.success) throw new Error(r?.error || "Не удалось создать QR-код");
      setSessionId(r.session_id);
      setExpiresIn(typeof r.expires_in === "number" ? r.expires_in : 300);
    } catch (e: any) {
      setQrError(e?.message || "Ошибка");
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "qr") createSession();
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (countdown.current) clearInterval(countdown.current);
    };
  }, [mode, createSession]);

  // Обратный отсчёт срока жизни кода
  useEffect(() => {
    if (mode !== "qr" || !sessionId) return;
    countdown.current = setInterval(() => {
      setExpiresIn((s) => {
        if (s <= 1) {
          setExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (countdown.current) clearInterval(countdown.current);
    };
  }, [mode, sessionId]);

  // Поллинг подтверждения (сканирование с телефона)
  useEffect(() => {
    if (mode !== "qr" || !sessionId || expired) return;
    timer.current = setInterval(async () => {
      try {
        const r = await qrStatus(sessionId);
        if (r?.status === "expired") {
          setExpired(true);
          return;
        }
        if (r?.status === "confirmed" && r.subscription_url) {
          if (timer.current) clearInterval(timer.current);
          await saveSession({ subUrl: r.subscription_url });
          await refreshMe().catch(() => {});
          await reloadNodes().catch(() => {});
        }
      } catch {}
    }, 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [mode, sessionId, expired, refreshMe, reloadNodes]);

  const doLogin = async () => {
    if (!loginStr.trim() || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(loginStr.trim(), password, totp.trim() || undefined);
    } catch (e: any) {
      setError(e?.message || "Ошибка входа");
    } finally {
      setBusy(false);
    }
  };

  const doLogin2fa = async () => {
    if (!totp.trim()) {
      setError("Введите код из приложения-аутентификатора");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn2fa(totp.trim());
    } catch (e: any) {
      setError(e?.message || "Ошибка входа");
    } finally {
      setBusy(false);
    }
  };

  const qrData = sessionId ? `ghostcloud://qr-auth/${sessionId}` : "";
  const minutes = Math.max(0, Math.ceil(expiresIn / 60));

  return (
    <View style={styles.screen}>
      {/* Левая колонка — бренд */}
      <View style={styles.left}>
        <Image source={{ uri: "app_icon" }} style={styles.logo} resizeMode="cover" />
        <BrandName style={styles.brandName} />
        <Text style={styles.brandSub}>Ваш приватный доступ в интернет</Text>
        <View style={styles.hintBox}>
          <Ionicons name="game-controller-outline" size={18} color={colors.textDim} />
          <Text style={styles.hintText}>Навигация — стрелками пульта, выбор — кнопкой «ОК»</Text>
        </View>
      </View>

      {/* Правая колонка — способ входа */}
      <View style={styles.right}>
        {mode === "main" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Вход в аккаунт</Text>
            <Text style={styles.cardSub}>
              Самый быстрый способ — отсканировать QR-код телефоном, где вы уже вошли
            </Text>
            <TvFocusable autoFocus onPress={() => setMode("qr")} style={styles.btn} borderRadius={16}>
              <View style={[styles.btnInner, styles.btnPrimary]}>
                <Ionicons name="qr-code-outline" size={22} color="#fff" />
                <Text style={styles.btnPrimaryText}>Войти по QR-коду</Text>
              </View>
            </TvFocusable>
            <TvFocusable onPress={() => setMode("password")} style={styles.btn} borderRadius={16}>
              <View style={[styles.btnInner, styles.btnGhost]}>
                <Ionicons name="key-outline" size={22} color={colors.text} />
                <Text style={styles.btnGhostText}>Логин и пароль</Text>
              </View>
            </TvFocusable>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>вход по коду 2FA</Text>
              <View style={styles.orLine} />
            </View>
            <TvFocusable onPress={() => setMode("password")} style={styles.btn} borderRadius={16}>
              <View style={[styles.btnInner, styles.btnGhost]}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
                <Text style={styles.btnGhostText}>Только код 2FA</Text>
              </View>
            </TvFocusable>
          </View>
        )}

        {mode === "qr" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Вход по QR-коду</Text>
            <View style={styles.qrRow}>
              <View style={styles.qrBox}>
                {creating ? (
                  <View style={styles.qrPlaceholder}>
                    <ActivityIndicator color={colors.accent} size="large" />
                    <Text style={styles.qrHint}>Создаём QR-код…</Text>
                  </View>
                ) : expired ? (
                  <View style={styles.qrPlaceholder}>
                    <Ionicons name="time-outline" size={44} color={colors.red} />
                    <Text style={styles.qrExpired}>QR-код истёк</Text>
                    <Text style={styles.qrHint}>Создайте новый код</Text>
                  </View>
                ) : qrData ? (
                  <QRCode value={qrData} size={230} backgroundColor="#FFFFFF" color="#111111" />
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <Text style={styles.qrHint}>{qrError || "Ошибка создания кода"}</Text>
                  </View>
                )}
              </View>
              <View style={styles.qrInfo}>
                <View style={styles.qrStep}>
                  <View style={styles.qrStepNum}><Text style={styles.qrStepNumText}>1</Text></View>
                  <Text style={styles.qrStepText}>Откройте GhostCloud на телефоне, где уже выполнен вход</Text>
                </View>
                <View style={styles.qrStep}>
                  <View style={styles.qrStepNum}><Text style={styles.qrStepNumText}>2</Text></View>
                  <Text style={styles.qrStepText}>Профиль → «Отсканировать QR»</Text>
                </View>
                <View style={styles.qrStep}>
                  <View style={styles.qrStepNum}><Text style={styles.qrStepNumText}>3</Text></View>
                  <Text style={styles.qrStepText}>Наведите камеру на этот код и подтвердите вход</Text>
                </View>
                {!!sessionId && !expired && !creating && (
                  <Text style={styles.qrCountdown}>Код действителен ещё ~{minutes} мин.</Text>
                )}
                <View style={{ flex: 1 }} />
                <TvFocusable autoFocus onPress={() => (expired || qrError ? createSession() : setMode("main"))} style={styles.btnSmall} borderRadius={14}>
                  <View style={[styles.btnInner, styles.btnGhost]}>
                    <Ionicons name={expired || qrError ? "refresh" : "arrow-back"} size={20} color={colors.text} />
                    <Text style={styles.btnGhostText}>{expired || qrError ? "Обновить код" : "Назад"}</Text>
                  </View>
                </TvFocusable>
              </View>
            </View>
          </View>
        )}

        {mode === "password" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Вход по паролю</Text>
            <Text style={styles.cardSub}>Для ввода текста подключите клавиатуру или используйте экранную</Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Логин или email</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Логин или email"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                value={loginStr}
                onChangeText={setLoginStr}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Пароль</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Ваш пароль"
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={doLogin}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Код 2FA (если включён) — или войдите только им</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="000000 или резервный XXXX-XXXX"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                value={totp}
                onChangeText={(t) => setTotp(t.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 9))}
                onSubmitEditing={doLogin2fa}
              />
            </View>
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <View style={styles.btnRowStack}>
              <TvFocusable autoFocus onPress={doLogin} disabled={busy} style={styles.btnFull} borderRadius={16}>
                <View style={[styles.btnInner, styles.btnPrimary]}>
                  {busy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={20} color="#fff" />
                      <Text style={styles.btnPrimaryText}>Войти</Text>
                    </>
                  )}
                </View>
              </TvFocusable>
              <View style={styles.btnRowInline}>
                <TvFocusable onPress={doLogin2fa} disabled={busy} style={styles.btnFlex} borderRadius={14}>
                  <View style={[styles.btnInner, styles.btnGhost, styles.btnInnerSm]}>
                    <Text style={styles.btnGhostText}>Войти по коду 2FA</Text>
                  </View>
                </TvFocusable>
                <TvFocusable onPress={() => { setMode("main"); setError(null); }} style={styles.btnFlex} borderRadius={14}>
                  <View style={[styles.btnInner, styles.btnGhost, styles.btnInnerSm]}>
                    <Ionicons name="arrow-back" size={18} color={colors.text} />
                    <Text style={styles.btnGhostText}>Назад</Text>
                  </View>
                </TvFocusable>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: "row", backgroundColor: "#0F0B1E", paddingHorizontal: 64, alignItems: "center", gap: 48 },
  left: { width: 400, alignItems: "flex-start" },
  logo: { width: 96, height: 96, borderRadius: 24, marginBottom: 20 },
  brandName: { color: "#FFFFFF", fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  brandSub: { color: "#9C93B8", fontSize: 18, marginTop: 8 },
  hintBox: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 48, backgroundColor: "#1C1433", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#2E2150", width: "100%" },
  hintText: { color: "#9C93B8", fontSize: 14, flex: 1 },
  right: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#1C1433", borderRadius: 26, borderWidth: 1, borderColor: "#2E2150", padding: 36, width: "100%", maxWidth: 900 },
  cardTitle: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", marginBottom: 6 },
  cardSub: { color: "#9C93B8", fontSize: 15, marginBottom: 22 },
  btn: { width: "100%", marginBottom: 12 },
  btnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 58, paddingHorizontal: 24, borderRadius: 16 },
  btnPrimary: { backgroundColor: "#7C3AED" },
  btnPrimaryText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  btnGhost: { backgroundColor: "#251A42", borderWidth: 1, borderColor: "#2E2150" },
  btnGhostText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  btnSmall: { marginBottom: 12 },
  btnHalf: { flex: 1 },
  rowBtns: { flexDirection: "row", gap: 12, alignItems: "center" },
  // Кнопки формы пароля: «Войти» на всю ширину, под ней две половинки —
  // иначе три кнопки в ряд слишком узкие и тексты переносятся/обрезаются.
  btnRowStack: { gap: 10 },
  btnFull: { width: "100%" },
  btnRowInline: { flexDirection: "row", gap: 10 },
  btnFlex: { flex: 1 },
  btnInnerSm: { height: 50 },
  orRow: { flexDirection: "row", alignItems: "center", marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: "#2E2150" },
  orText: { color: "#8F84AC", fontSize: 13, marginHorizontal: 14 },
  qrRow: { flexDirection: "row", gap: 32, alignItems: "stretch" },
  qrBox: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 18, alignItems: "center", justifyContent: "center", width: 266, height: 266 },
  qrPlaceholder: { alignItems: "center", justifyContent: "center", gap: 10, width: 230, height: 230 },
  qrHint: { color: "#666", fontSize: 14, textAlign: "center" },
  qrExpired: { color: "#DC2626", fontSize: 18, fontWeight: "800" },
  qrInfo: { flex: 1, justifyContent: "center", gap: 16 },
  qrStep: { flexDirection: "row", alignItems: "center", gap: 14 },
  qrStepNum: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  qrStepNumText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  qrStepText: { color: "#FFFFFF", fontSize: 16, flex: 1 },
  qrCountdown: { color: "#8F84AC", fontSize: 13, marginTop: 4 },
  field: { marginBottom: 14 },
  fieldLabel: { color: "#9C93B8", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  fieldInput: { backgroundColor: "#160F2B", borderRadius: 14, borderWidth: 1, borderColor: "#2E2150", color: "#FFFFFF", paddingHorizontal: 18, paddingVertical: 14, fontSize: 17 },
  errorBox: { backgroundColor: "rgba(248,113,113,0.12)", borderColor: "rgba(248,113,113,0.35)", borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  errorText: { color: "#F87171", fontSize: 14 },
});
