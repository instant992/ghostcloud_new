import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as api from "./api";
import { clearSession, loadSession, loadSelectedNodeId, saveSession, saveSelectedNodeId, Session, loadDismissedAlerts, addDismissedAlerts } from "./storage";
import { VpnNode } from "./vpn/parse";
import { isVpnRunning, onVpnStateChanged } from "./vpn/manager";
import type { SecurityAlert } from "./components/SecurityAlertModal";
import { useTheme, useThemeSwitcher } from "./theme";
import * as FileSystem from "expo-file-system/legacy";

const NODES_CACHE_FILE = "nodes_cache.json";
const ME_CACHE_FILE = "me_cache.json";

async function readCacheFile(file: string): Promise<any | null> {
  try {
    const uri = `${FileSystem.cacheDirectory}${file}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCacheFile(file: string, data: any) {
  try {
    const uri = `${FileSystem.cacheDirectory}${file}`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(data));
  } catch {}
}

async function readNodesCache(): Promise<{ nodes: VpnNode[]; unsupportedCount: number } | null> {
  try {
    const parsed = await readCacheFile(NODES_CACHE_FILE);
    if (!Array.isArray(parsed?.nodes)) return null;
    return { nodes: parsed.nodes, unsupportedCount: Number(parsed.unsupportedCount) || 0 };
  } catch {
    return null;
  }
}

async function writeNodesCache(nodes: VpnNode[], unsupportedCount: number) {
  await writeCacheFile(NODES_CACHE_FILE, { ts: Date.now(), nodes, unsupportedCount });
}

export type UserBadge = {
  id: number;
  name: string;
  description: string;
  image_url: string;
};

export type NickStyle = {
  badge_type?: string;
  no_sponsor?: boolean;
  [key: string]: any;
};

export type MeInfo = {
  login?: string;
  display_name?: string;
  email?: string;
  plan?: string;
  expire_at?: string;
  balance?: number;
  device_count?: number;
  device_limit?: number;
  telegram_linked?: boolean;
  avatar_url?: string;
  subscription_url?: string;
  hy2_subscription_url?: string | null;
  combined_subscription_url?: string | null;
  is_sponsor?: boolean;
  sponsor_device_bonus_claimed?: boolean;
  is_donor_eligible?: boolean;
  /** true = Telegram-авторизация (FoxiCloud): урезанный режим приложения */
  is_foxicloud?: boolean;
  nick_style?: NickStyle | null;
  badges?: UserBadge[];
  security_alerts?: SecurityAlert[];
};

type AppState = {
  loading: boolean;
  session: Session | null;
  me: MeInfo | null;
  nodes: VpnNode[];
  unsupportedCount: number;
  selectedNodeId: string | null;
  vpnRunning: boolean;
  subscriptionActive: boolean;
  /** Telegram-авторизация (FoxiCloud): урезанный режим — только тема FoxCloud,
   *  без спонсорских/платных фич приложения, профиль/баланс из Bedolaga API. */
  isFoxcloud: boolean;
  signIn: (loginStr: string, password?: string, totpCode?: string) => Promise<void>;
  signIn2fa: (totpCode: string) => Promise<void>;
  signInViaToken: (subscriptionUrl: string, user?: any, tgId?: string, isFoxcloud?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  reloadNodes: () => Promise<void>;
  selectNode: (id: string) => void;
  setVpnRunning: (v: boolean) => void;
  /** Уведомление безопасности (вход по 2FA) + действия из модалки */
  securityAlert: SecurityAlert | null;
  securityBusy: boolean;
  securityConfirm: () => Promise<void>;
  securityDisable2fa: () => Promise<void>;
  securityKickAll: () => Promise<void>;
};

const Ctx = createContext<AppState>(null as any);

export function useApp(): AppState {
  return useContext(Ctx);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [nodes, setNodes] = useState<VpnNode[]>([]);
  const [unsupportedCount, setUnsupportedCount] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [vpnRunning, setVpnRunning] = useState(false);
  /** Текущее уведомление безопасности (модалка «Вход по коду 2FA») */
  const [securityAlert, setSecurityAlert] = useState<SecurityAlert | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  /** Полная лента непрочитанных алертов (для «Это был я» — закрыть все сразу) */
  const securityAlertsRef = useRef<SecurityAlert[]>([]);
  /** ID алертов, которые пользователь уже закрыл — не показывать снова */
  const dismissedAlertsRef = useRef<number[]>([]);
  const mounted = useRef(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  /** Счётчик автоповторов загрузки серверов после входа */
  const nodesRetryRef = useRef(0);
  /** Актуальная длина списка узлов (для фоновых повторов без доступа к state) */
  const nodesLenRef = useRef(0);
  /** Ref на signInViaToken: boot-эффект объявлен раньше самого callback,
   *  поэтому вызываем через ref, чтобы не упереться в TDZ. */
  const signInViaTokenRef = useRef<
    (subscriptionUrl: string, user?: any, tgId?: string, isFoxcloud?: boolean) => Promise<void>
  >(async () => {});

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  // ── Telegram-авторизация (FoxiCloud): приложение работает только в теме
  // FoxCloud — стиль переключается принудительно, остальные темы недоступны.
  const themeCtx = useTheme();
  const switchTheme = useThemeSwitcher();
  const isFoxcloudMode = !!(session?.isFoxcloud || me?.is_foxicloud);
  // FoxCloud (вход через Telegram): стиль закреплён на FoxCloud, режим — тёмный.
  // Фиксируем и mode тоже: сохранённый ранее «авто»/«светлая» иначе продолжал бы
  // переключать вариацию темы по времени, хотя контролы в настройках скрыты.
  useEffect(() => {
    if (isFoxcloudMode && (themeCtx.style !== "foxcloud" || themeCtx.mode !== "dark")) {
      switchTheme({ style: "foxcloud", mode: "dark" });
    }
  }, [isFoxcloudMode, themeCtx.style, themeCtx.mode, switchTheme]);

  // Загружаем список закрытых уведомлений безопасности (не показывать их снова)
  useEffect(() => {
    loadDismissedAlerts().then((ids) => {
      dismissedAlertsRef.current = ids;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const off = onVpnStateChanged((running) => setVpnRunning(running));
    setVpnRunning(isVpnRunning());
    return off;
  }, []);

  // Автопроверка APK-обновлений при старте (как в старом приложении):
  // молча, без всплывающих сообщений — баннер появится сам, если есть обновление.
  // EAS OTA (expo-updates) при этом продолжает работать независимо.
  useEffect(() => {
    const t = setTimeout(() => {
      import("./update")
        .then((u) => u.checkForUpdate({ silent: true }))
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  // Фильтр соединения: при смене сети (Wi-Fi ↔ LTE) перезапускаем туннель,
  // если активны профили с сетевым режимом — как в эталонном приложении.
  const nodesRef = useRef<VpnNode[]>([]);
  const meRef = useRef<MeInfo | null>(null);
  useEffect(() => {
    nodesRef.current = nodes;
    meRef.current = me;
  }, [nodes, me]);
  useEffect(() => {
    let off: () => void = () => {};
    let cancelled = false;
    import("./vpn/native")
      .then((native) => {
        if (cancelled || !native.onNetworkTypeChanged) return;
        off = native.onNetworkTypeChanged(async () => {
          try {
            const mgr = await import("./vpn/manager");
            if (!(await mgr.isVpnRunning())) return;
            const { loadFilterSettings, hasNetworkDependentProfiles } = await import("./vpn/connectionFilter");
            const s = loadFilterSettings();
            if (!hasNetworkDependentProfiles(s)) return;
            const all = nodesRef.current;
            const { AUTO_SERVER_ID } = await import("./vpn/autoSelect");
            await mgr.disconnect();
            let node;
            if (selectedNodeIdRef.current === AUTO_SERVER_ID) {
              // В режиме автовыбора — настоящий тест через прокси (VPN уже выключен)
              const best = await mgr.pickBestNode(all);
              node = best[0];
            } else {
              node = all.find((n) => n.id === selectedNodeIdRef.current) || all[0];
            }
            if (!node) return;
            await mgr.connect(node, { isSponsor: meRef.current?.is_sponsor === true });
          } catch {}
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Пул серверов-кандидатов для авто-файловера (нативный монитор переключает
  // на запасной сервер при обрыве, даже при выключенном экране)
  useEffect(() => {
    import("./vpn/manager").then((m) => m.setFailoverPool(nodes)).catch(() => {});
    nodesLenRef.current = nodes.length;
  }, [nodes]);

  // Учёт трафика: опрашиваем TrafficStats раз в 3 сек, дельту пишем в локальную статистику.
  // Параллельно считаем дельты по UID приложений — «куда идёт трафик».
  // Базовый замер приложений берётся ДО первого тика, чтобы статистика
  // по приложениям появилась уже в первую сессию подключения.
  useEffect(() => {
    if (!vpnRunning) return;
    let stopped = false;
    let last = { tx: 0, rx: 0 };
    let lastApps: Map<number, { rx: number; tx: number }> | null = null;
    (async () => {
      const native = await import("./vpn/native");
      const snap = await native.getTrafficSnapshot();
      last = snap;
      // Базовый замер по приложениям — сразу, не дожидаясь первого тика
      try {
        const apps = await native.getUidTraffic();
        if (apps.length > 0) {
          lastApps = new Map(apps.map((a) => [a.uid, { rx: a.rx, tx: a.tx }]));
        }
      } catch {}
      if (stopped) return;
      let ticking = false;
      const timer = setInterval(async () => {
        if (stopped || !mounted.current || ticking) return;
        ticking = true;
        try {
          // Общий трафик + разбивка по серверу
          try {
            const cur = await native.getTrafficSnapshot();
            const dTx = cur.tx - last.tx;
            const dRx = cur.rx - last.rx;
            // Пишем, если вырос хотя бы один счётчик (второй может отстать на
            // один цикл опроса) — отрицательные дельты обнуляются в addDelta
            if (dTx > 0 || dRx > 0) {
              last = cur;
              const stats = await import("./stats");
              // Фактически подключённый узел (выбранный может быть не задан)
              const nodeId = selectedNodeIdRef.current || (await import("./vpn/manager")).getLastConnectedNodeId();
              await stats.addDelta(dRx, dTx, nodeId);
            }
          } catch {}
        // Трафик по приложениям
        try {
          const apps = await native.getUidTraffic();
          const deltas: Array<{ pkg: string; name: string; rx: number; tx: number }> = [];
          if (lastApps && apps.length > 0) {
            for (const a of apps) {
              const prev = lastApps.get(a.uid);
              if (!prev) continue; // новое приложение — базовый замер на следующем цикле
              const dRx = a.rx - prev.rx;
              const dTx = a.tx - prev.tx;
              // отрицательная дельта = сброс счётчиков (перезагрузка) — пропускаем
              if (dRx > 0 || dTx > 0) {
                deltas.push({
                  pkg: a.packageName,
                  name: a.appName,
                  rx: Math.max(0, dRx),
                  tx: Math.max(0, dTx),
                });
              }
            }
            if (deltas.length > 0) {
              const stats = await import("./stats");
              await stats.addAppDeltas(deltas);
            }
          }
          // Пустой/ошибочный ответ не сбрасывает базовый замер — иначе
          // все приложения снова считались бы «новыми» и дельты терялись бы
          if (apps.length > 0) {
            lastApps = new Map(apps.map((a) => [a.uid, { rx: a.rx, tx: a.tx }]));
          }
        } catch {}
        } finally {
          ticking = false;
        }
      }, 3000);
      cleanupRef.current = () => clearInterval(timer);
    })();
    return () => {
      stopped = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [vpnRunning]);

  const refreshMe = useCallback(async () => {
    const data = await api.getMe();
    if (!data?.success) {
      // Кик: сервер отозвал мобильную сессию — разлогиниваемся
      if (data?.session_revoked) {
        if (!mounted.current) return;
        try {
          const mod = await import("./vpn/manager");
          await mod.disconnect();
        } catch {}
        await clearSession();
        setSession(null);
        setMe(null);
        setNodes([]);
        setSecurityAlert(null);
        const err: any = new Error(data?.error || "Сессия завершена — войдите заново");
        err.sessionRevoked = true;
        throw err;
      }
      throw new Error(data?.error || "Не удалось получить профиль");
    }
    if (!mounted.current) return;
    setMe(data as MeInfo);
    writeCacheFile(ME_CACHE_FILE, data);
    // Лента уведомлений безопасности (вход по 2FA): показать последнее, если ещё не показывали
    const rawAlerts: SecurityAlert[] = (data.security_alerts as SecurityAlert[]) || [];
    const alerts: SecurityAlert[] = rawAlerts.filter(
      (a: SecurityAlert) => !dismissedAlertsRef.current.includes(a.id)
    );
    securityAlertsRef.current = alerts;
    if (alerts.length > 0) {
      setSecurityAlert((prev) => (prev && prev.id === alerts[0].id ? prev : alerts[0]));
    }
    const newSession = await loadSession();
    const rw = data.subscription_url || newSession?.rwSubUrl;
    const combined = data.combined_subscription_url || undefined;
    // Telegram-авторизация (FoxiCloud): держим tgId/флаг в сессии в актуальном
    // состоянии, чтобы X-Tg-Id слался и после перезапуска.
    if (newSession) {
      const tgId = newSession.tgId;
      const isFox = data.is_foxicloud === true || (newSession.isFoxcloud ?? false);
      const changed =
        rw !== newSession.rwSubUrl ||
        combined !== newSession.combinedSubUrl ||
        isFox !== newSession.isFoxcloud;
      if (changed) {
        const updated: Session = {
          ...newSession,
          subUrl: newSession.subUrl || rw || "",
          rwSubUrl: rw,
          combinedSubUrl: combined,
          tgId,
          isFoxcloud: isFox,
        };
        await saveSession(updated);
        setSession(updated);
      }
    }
  }, []);

  const reloadNodes = useCallback(async () => {
    const mod = await import("./vpn/manager");
    const api = await import("./api");

    const subResult = await mod.fetchNodes().catch(() => ({ nodes: [], unsupportedCount: 0 }));
    const lteNodes: VpnNode[] = [];

    // Extra-профили (LTE Open): content — URL подписки или сам конфиг
    try {
      const r = await api.getExtraProfiles();
      const profiles = Array.isArray(r?.profiles) ? r.profiles : [];
      for (const p of profiles) {
        if (!p?.is_active && p.is_active !== undefined) continue;
        let text = "";
        if (p.profile_type === "url" && typeof p.content === "string" && p.content.startsWith("http")) {
          text = await mod.fetchSubscriptionText(p.content);
        } else if (typeof p.content === "string") {
          text = p.content;
        }
        if (!text) continue;
        const { nodes: parsed } = await import("./vpn/parse").then((m) => m.parseSubscriptionText(text));
        for (const n of parsed) lteNodes.push({ ...n, id: `lte-${n.id}`, source: "lte" });
      }
    } catch {}

    if (!mounted.current) return;
    const allNodes = [...subResult.nodes.map((n) => ({ ...n, source: "sub" as const })), ...lteNodes];
    // Если сеть недоступна и пришёл пустой список — не затираем сохранённый кэш
    setNodes((prev) => (allNodes.length === 0 && prev.length > 0 ? prev : allNodes));
    if (allNodes.length > 0) {
      setUnsupportedCount(subResult.unsupportedCount);
      // кэш для офлайн-запуска
      writeNodesCache(allNodes, subResult.unsupportedCount);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (!mounted.current) return;
      setSession(s);
      if (s) {
        // Сначала подгружаем список закрытых алертов, иначе refreshMe ниже
        // может показать уже закрытое уведомление (гонка при холодном старте)
        try {
          dismissedAlertsRef.current = await loadDismissedAlerts();
        } catch {}
        // Push: регистрация FCM-токена для уведомлений безопасности
        import("./push").then((p) => p.initPush()).catch(() => {});
        // Тап по security-push -> сразу подтянуть ленту (/mobile/me покажет модалку)
        import("./push").then((p) =>
          p.addPushResponseListener(() => {
            refreshMe().catch(() => {});
          })
        ).catch(() => {});
        // Мгновенный старт: показываем кэш профиля и серверов, сеть догоняет в фоне.
        // Так приложение полноценно работает офлайн.
        const [cachedMe, cachedNodes] = await Promise.all([readCacheFile(ME_CACHE_FILE), readNodesCache()]);
        if (mounted.current) {
          if (cachedMe && typeof cachedMe === "object") setMe(cachedMe as MeInfo);
          if (cachedNodes && cachedNodes.nodes.length > 0) {
            setNodes(cachedNodes.nodes);
            setUnsupportedCount(cachedNodes.unsupportedCount);
          }
          setLoading(false);
        }
        try {
          await refreshMe();
        } catch {}
        try {
          await reloadNodes();
        } catch {}
        const savedId = await loadSelectedNodeId();
        if (savedId) setSelectedNodeId(savedId);
        if (mounted.current) setLoading(false);
      } else {
        // Cold-start по deep link ghostcloud://tg-auth (Android убил приложение,
        // пока пользователь был в браузере на Telegram Login) — если сессии нет,
        // но есть ссылка возврата, входим в FoxCloud-режим по ней.
        try {
          const { Linking } = await import("react-native");
          const initial = await Linking.getInitialURL();
          if (initial) {
            const { parseTgAuthUrl } = await import("./screens/auth/TelegramLoginScreen");
            const p = parseTgAuthUrl(initial);
            if (p && p.subscription_url && !p.error) {
              await signInViaTokenRef.current(
                p.subscription_url,
                { login: p.tg_id ? `tg_${p.tg_id}` : undefined },
                p.tg_id,
                p.source === "foxicloud" || !!p.tg_id
              );
              if (mounted.current) setLoading(false);
              return;
            }
          }
        } catch {}
        setLoading(false);
      }
    })();
  }, [refreshMe, reloadNodes]);

  /** После авторизации подписка на бэкенде может активироваться с задержкой,
   *  поэтому первая загрузка серверов часто приходит пустой. Повторяем в фоне
   *  несколько раз, пока список не заполнится. */
  const scheduleNodesRetry = useCallback(() => {
    nodesRetryRef.current = 0;
    const delays = [2500, 6000, 12000];
    delays.forEach((delay, i) => {
      setTimeout(() => {
        if (!mounted.current) return;
        if (nodesLenRef.current > 0) return; // уже загрузились
        nodesRetryRef.current = i + 1;
        reloadNodes().catch(() => {});
      }, delay);
    });
  }, [reloadNodes]);

  const applyLoginResult = useCallback(async (data: any) => {
    await saveSession({
      subUrl: data.subscription_url,
      combinedSubUrl: data.subscription_url,
      login: data.user?.login,
      email: data.user?.email,
    });
    const s = await loadSession();
    setSession(s);
    // Push: регистрируем FCM-токен устройства для уведомлений безопасности
    import("./push").then((p) => p.initPush()).catch(() => {});
    try {
      await refreshMe();
      await reloadNodes();
    } catch {}
    scheduleNodesRetry();
  }, [refreshMe, reloadNodes]);

  const signIn = useCallback(async (loginStr: string, password?: string, totpCode?: string) => {
    const data = await api.login(loginStr, password, totpCode);
    if (!data?.success) {
      const err: any = new Error(data?.error || "Неверный логин или пароль");
      err.requires2fa = !!data?.requires_2fa;
      throw err;
    }
    await applyLoginResult(data);
  }, [applyLoginResult]);

  const signIn2fa = useCallback(async (totpCode: string) => {
    // Вход только по коду 2FA — без логина и пароля
    const data = await api.login2fa(totpCode);
    if (!data?.success) {
      throw new Error(data?.error || "Неверный код 2FA");
    }
    await applyLoginResult(data);
  }, [applyLoginResult]);

  // ── Действия из модалки уведомления безопасности ──
  const securityConfirm = useCallback(async () => {
    if (!securityAlert) return;
    setSecurityBusy(true);
    try {
      // «Это был я» — закрываем ВСЮ накопившуюся ленту, а не только верхний алерт
      const all = securityAlertsRef.current.length > 0
        ? securityAlertsRef.current
        : [securityAlert];
      const ids = all.map((a) => a.id);
      // Локально запоминаем как закрытые — модалка не вернётся, даже если
      // сервер снова пришлёт эти алерты в ленте
      dismissedAlertsRef.current = [...new Set([...dismissedAlertsRef.current, ...ids])];
      await addDismissedAlerts(ids);
      await Promise.all(ids.map((id) => api.securityAlertRead(id).catch(() => {})));
      securityAlertsRef.current = [];
    } catch {}
    setSecurityAlert(null);
    setSecurityBusy(false);
  }, [securityAlert]);

  const securityDisable2fa = useCallback(async () => {
    if (!securityAlert) return;
    setSecurityBusy(true);
    try {
      const r = await api.securityDisable2fa(securityAlert.id);
      if (!r?.success) throw new Error(r?.error || "Не удалось отключить 2FA");
      // Сервер чистит всю ленту; локально тоже запоминаем — страховка от повторов
      const ids = (securityAlertsRef.current.length > 0
        ? securityAlertsRef.current
        : [securityAlert]).map((a) => a.id);
      dismissedAlertsRef.current = [...new Set([...dismissedAlertsRef.current, ...ids])];
      await addDismissedAlerts(ids);
      securityAlertsRef.current = [];
      setSecurityAlert(null);
      try { await refreshMe(); } catch {}
    } finally {
      setSecurityBusy(false);
    }
  }, [securityAlert, refreshMe]);

  const securityKickAll = useCallback(async () => {
    if (!securityAlert) return;
    setSecurityBusy(true);
    try {
      const r = await api.securityKick(securityAlert.id);
      if (!r?.success) throw new Error(r?.error || "Не удалось выкинуть устройства");
      // Кик отзывает и текущую сессию — разлогиниваемся сами
      try {
        const mod = await import("./vpn/manager");
        await mod.disconnect();
      } catch {}
      await clearSession();
      setSession(null);
      setMe(null);
      setNodes([]);
      setSecurityAlert(null);
    } finally {
      setSecurityBusy(false);
    }
  }, [securityAlert]);

  const signInViaToken = useCallback(async (subscriptionUrl: string, user?: any, tgId?: string, isFoxcloud?: boolean) => {
    const tg = String(tgId || user?.id || "");
    await saveSession({
      subUrl: subscriptionUrl,
      combinedSubUrl: subscriptionUrl,
      login: user?.login,
      email: user?.email,
      tgId: tg || undefined,
      isFoxcloud: isFoxcloud ?? false,
    });
    const s = await loadSession();
    setSession(s);
    try {
      await refreshMe();
      await reloadNodes();
    } catch {}
    scheduleNodesRetry();
  }, [refreshMe, reloadNodes]);

  // Держим ref актуальным для boot-эффекта (объявлен раньше)
  useEffect(() => {
    signInViaTokenRef.current = signInViaToken;
  }, [signInViaToken]);

  const signOut = useCallback(async () => {
    const mod = await import("./vpn/manager");
    try {
      await mod.disconnect();
    } catch {}
    await clearSession();
    setSession(null);
    setMe(null);
    setNodes([]);
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    saveSelectedNodeId(id).catch(() => {});
  }, []);

  const subscriptionActive = useMemo(() => {
    if (!me?.expire_at) return false;
    const d = new Date(String(me.expire_at));
    return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
  }, [me]);

  const value = useMemo<AppState>(
    () => ({
      loading,
      session,
      me,
      nodes,
      unsupportedCount,
      selectedNodeId,
      vpnRunning,
      subscriptionActive,
      isFoxcloud: isFoxcloudMode,
      signIn,
      signIn2fa,
      signInViaToken,
      signOut,
      refreshMe,
      reloadNodes,
      selectNode,
      setVpnRunning,
      securityAlert,
      securityBusy,
      securityConfirm,
      securityDisable2fa,
      securityKickAll,
    }),
    [loading, session, me, nodes, unsupportedCount, selectedNodeId, vpnRunning, subscriptionActive, isFoxcloudMode, signIn, signIn2fa, signInViaToken, signOut, refreshMe, reloadNodes, selectNode, securityAlert, securityBusy, securityConfirm, securityDisable2fa, securityKickAll]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
