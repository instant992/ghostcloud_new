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
import { clearVpnConnected } from "./vpn/timer";
import type { SecurityAlert } from "./components/SecurityAlertModal";
import { useTheme, useThemeSwitcher } from "./theme";
import * as FileSystem from "expo-file-system/legacy";

const NODES_CACHE_FILE = "nodes_cache.json";
const ME_CACHE_FILE = "me_cache.json";
/** Кэш серверов живёт в documentDirectory, а не в cacheDirectory: Android может
 *  вычистить cacheDirectory в любой момент (и тогда без интернета список
 *  пустой), а документная директория переживает очистку кэша ОС и удаление
 *  обновлений — чистится только при удалении приложения. */
const NODES_DIR = "nodes_store";
const NODES_SEGMENTS = { sub: "sub.json", lte: "lte.json" } as const;

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

async function readNodesStoreFile(name: string): Promise<any | null> {
  try {
    const uri = `${FileSystem.documentDirectory}${NODES_DIR}/${name}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(uri));
  } catch {
    return null;
  }
}

async function writeNodesStoreFile(name: string, data: any) {
  try {
    const dir = `${FileSystem.documentDirectory}${NODES_DIR}`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(`${dir}/${name}`, JSON.stringify(data));
  } catch {}
}

/** Один раз переносим старый единый кэш (cacheDirectory) в сегменты,
 *  чтобы у текущих пользователей список не пропал после обновления. */
async function migrateLegacyNodesCache() {
  try {
    const [subSeg, legacy] = await Promise.all([
      readNodesStoreFile(NODES_SEGMENTS.sub),
      readCacheFile(NODES_CACHE_FILE),
    ]);
    if (subSeg || !Array.isArray(legacy?.nodes) || legacy.nodes.length === 0) return;
    const sub: VpnNode[] = [];
    const lte: VpnNode[] = [];
    for (const n of legacy.nodes) {
      (n?.source === "lte" ? lte : sub).push(n);
    }
    if (sub.length) {
      await writeNodesStoreFile(NODES_SEGMENTS.sub, {
        ts: legacy.ts || Date.now(),
        nodes: sub,
        unsupportedCount: Number(legacy.unsupportedCount) || 0,
      });
    }
    if (lte.length) await writeNodesStoreFile(NODES_SEGMENTS.lte, { ts: legacy.ts || Date.now(), nodes: lte });
  } catch {}
}

type NodesCache = { nodes: VpnNode[]; unsupportedCount: number };

/** Сохранённые серверы по сегментам: подписка и LTE Open отдельно — сбой
 *  скачивания одного сегмента не затирает другой (раньше общий кэш
 *  перезаписывался половинкой, если, например, LTE не ответил). */
async function readNodesCache(): Promise<NodesCache | null> {
  try {
    const [sub, lte] = await Promise.all([
      readNodesStoreFile(NODES_SEGMENTS.sub),
      readNodesStoreFile(NODES_SEGMENTS.lte),
    ]);
    const subNodes: VpnNode[] = Array.isArray(sub?.nodes) ? sub.nodes : [];
    const lteNodes: VpnNode[] = Array.isArray(lte?.nodes) ? lte.nodes : [];
    if (subNodes.length === 0 && lteNodes.length === 0) return null;
    return {
      nodes: [...subNodes, ...lteNodes],
      unsupportedCount: Number(sub?.unsupportedCount) || 0,
    };
  } catch {
    return null;
  }
}

/** Пишет только те сегменты, для которых есть свежие данные (fresh=true).
 *  Нескачанные сегменты остаются на диске как есть. */
async function writeNodesSegment(
  seg: keyof typeof NODES_SEGMENTS,
  nodes: VpnNode[],
  unsupportedCount?: number
) {
  await writeNodesStoreFile(NODES_SEGMENTS[seg], {
    ts: Date.now(),
    nodes,
    ...(unsupportedCount === undefined ? {} : { unsupportedCount }),
  });
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
  refreshMe: () => Promise<MeInfo | null>;
  reloadNodes: () => Promise<VpnNode[] | null>;
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
    const off = onVpnStateChanged((running) => {
      setVpnRunning(running);
      // VPN остановлен не через disconnect() (кнопка в шторке, onRevoke, сбой) —
      // сбрасываем метку таймера, иначе после повторного включения он продолжит
      // считать от старого момента.
      if (!running) clearVpnConnected();
    });
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
            // Выбранный сервер; если его нет в списке — НЕ переподключаемся
            // на первый попавшийся (иначе при смене сети пользователя молча
            // перекидывало на «🚀 Лучший сервер» — первый узел подписки).
            const sel = selectedNodeIdRef.current;
            let node = all.find((n) => n.id === sel) || null;
            // Вторичный матч: сохранённый id мог «осиротеть» (разные форматы id
            // у share-link и Clash-парсера после перезагрузки подписки) —
            // пробуем id последнего фактически подключённого узла.
            if (!node && sel) {
              const prev = (await import("./vpn/manager")).getLastConnectedNodeId();
              if (prev && prev !== sel) node = all.find((n) => n.id === prev) || null;
            }
            if (!node) return; // нет выбранного сервера в списке — не трогаем туннель
            await mgr.disconnect();
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

  const refreshMe = useCallback(async (): Promise<MeInfo | null> => {
    const data = await api.getMe();
    if (!data?.success) {
      // Кик: сервер отозвал мобильную сессию — разлогиниваемся
      if (data?.session_revoked) {
        if (!mounted.current) return null;
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
    if (!mounted.current) return data as MeInfo;
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
    return data as MeInfo;
  }, []);

  const reloadNodes = useCallback(async () => {
    const mod = await import("./vpn/manager");
    const api = await import("./api");

    // Подписка: качаем свежую; если не получилось (нет сети и т.п.) — берём
    // сохранённую копию, чтобы список серверов никогда не пустел.
    const subResult = await mod.fetchNodes().catch(() => null);
    const cached = await readNodesCache();
    const cachedSub = cached ? cached.nodes.filter((n) => n.source !== "lte") : [];
    const cachedLte = cached ? cached.nodes.filter((n) => n.source === "lte") : [];

    const subNodes: VpnNode[] = subResult && subResult.nodes.length > 0
      ? subResult.nodes.map((n) => ({ ...n, source: "sub" as const }))
      : cachedSub;
    const subFresh = !!(subResult && subResult.nodes.length > 0);

    const lteNodes: VpnNode[] = [];
    let lteFresh = false;

    // Extra-профили (LTE Open): содержимое берём через бэкенд-прокси —
    // провайдер stealthsurf отдаёт пустое тело на User-Agent okhttp (RN не
    // может его переопределить), поэтому подписку скачивает наш сервер.
    // Ошибки изолируем на профиль: битая подписка не глушит остальные.
    try {
      const r = await api.getExtraProfiles();
      const profiles = Array.isArray(r?.profiles) ? r.profiles : [];
      for (const p of profiles) {
        try {
          if (!p?.is_active && p.is_active !== undefined) continue;
          let text = "";
          if (p.profile_type === "url" && typeof p.content === "string" && p.content.startsWith("http")) {
            text = await api.getExtraProfileContent(p.id);
          } else if (typeof p.content === "string") {
            text = p.content;
          }
          if (!text) continue;
          const { nodes: parsed } = await import("./vpn/parse").then((m) => m.parseSubscriptionText(text));
          for (const n of parsed) lteNodes.push({ ...n, id: `lte-${n.id}`, source: "lte" });
        } catch (e) {
          console.warn("[reloadNodes] LTE profile failed:", p?.id, String((e as any)?.message || e).slice(0, 80));
        }
      }
      lteFresh = lteNodes.length > 0;
    } catch {}
    const lteFinal = lteFresh ? lteNodes : cachedLte;

    if (!mounted.current) return null;
    const allNodes = [...subNodes, ...lteFinal];
    // Если сеть недоступна и пришёл пустой список — не затираем состояние
    setNodes((prev) => (allNodes.length === 0 && prev.length > 0 ? prev : allNodes));
    if (subFresh) {
      setUnsupportedCount(subResult!.unsupportedCount);
      // кэш для офлайн-запуска — только сегменты со свежими данными
      writeNodesSegment("sub", subNodes, subResult!.unsupportedCount);
    }
    if (lteFresh) writeNodesSegment("lte", lteFinal);
    return allNodes.length > 0 ? allNodes : null;
  }, []);

  useEffect(() => {
    (async () => {
      // Перенос старого единого кэша узлов в сегментный (один раз)
      await migrateLegacyNodesCache();
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
        let freshMe: MeInfo | null = null;
        try {
          freshMe = await refreshMe();
        } catch {}
        let freshNodes: VpnNode[] | null = null;
        try {
          freshNodes = await reloadNodes();
        } catch {}
        const savedId = await loadSelectedNodeId();
        if (savedId) setSelectedNodeId(savedId);
        if (mounted.current) setLoading(false);

        // Автоподключение при запуске (настройка «Подключать при запуске»):
        // только с активной подпиской, только если VPN ещё не поднят.
        // Сервер — сохранённый выбор, иначе «Лучший сервер» (pickBestNode).
        try {
          const { getAutoConnect } = await import("./settings");
          if (getAutoConnect() && mounted.current) {
            const mgr = await import("./vpn/manager");
            if (!(await mgr.isVpnRunning())) {
              const meInfo = freshMe || ((cachedMe && typeof cachedMe === "object" ? (cachedMe as MeInfo) : null));
              // подписка активна? (та же логика, что subscriptionActive)
              const exp = meInfo?.expire_at ? new Date(String(meInfo.expire_at)).getTime() : 0;
              const subActive = exp > Date.now();
              const pool = freshNodes || cachedNodes?.nodes || [];
              if (subActive && pool.length > 0) {
                let node = pool.find((n) => n.id === savedId) || null;
                if (!node) {
                  try {
                    const best = await mgr.pickBestNode(pool, { max: 1 });
                    node = best[0] || null;
                  } catch {
                    node = pool.find((n) => n.source !== "lte") || null;
                  }
                }
                if (node) {
                  if (savedId && node.id !== savedId) setSelectedNodeId(node.id);
                  await mgr.connect(node, { isSponsor: meInfo?.is_sponsor === true });
                }
              }
            }
          }
        } catch (e) {
          console.warn("[autoconnect] failed:", String((e as any)?.message || e).slice(0, 120));
        }
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
