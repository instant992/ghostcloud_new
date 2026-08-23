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
import { clearSession, loadSession, loadSelectedNodeId, saveSession, saveSelectedNodeId, Session } from "./storage";
import { VpnNode } from "./vpn/parse";
import { isVpnRunning, onVpnStateChanged } from "./vpn/manager";

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
  subscription_url?: string;
  hy2_subscription_url?: string | null;
  combined_subscription_url?: string | null;
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
  signIn: (loginStr: string, password: string) => Promise<void>;
  signInViaToken: (subscriptionUrl: string, user?: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  reloadNodes: () => Promise<void>;
  selectNode: (id: string) => void;
  setVpnRunning: (v: boolean) => void;
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
  const mounted = useRef(true);
  const cleanupRef = useRef<(() => void) | null>(null);

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

  // Учёт трафика: опрашиваем TrafficStats раз в 3 сек, дельту пишем в локальную статистику
  useEffect(() => {
    if (!vpnRunning) return;
    let stopped = false;
    let last = { tx: 0, rx: 0 };
    (async () => {
      const { getTrafficSnapshot } = await import("./vpn/native");
      const snap = await getTrafficSnapshot();
      last = snap;
      const timer = setInterval(async () => {
        if (stopped) return;
        try {
          const cur = await getTrafficSnapshot();
          const dTx = cur.tx - last.tx;
          const dRx = cur.rx - last.rx;
          if (dTx > 0 || dRx > 0) {
            last = cur;
            const stats = await import("./stats");
            await stats.addDelta(dRx, dTx);
          }
        } catch {}
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
    if (!data?.success) throw new Error(data?.error || "Не удалось получить профиль");
    if (!mounted.current) return;
    setMe(data as MeInfo);
    const newSession = await loadSession();
    const rw = data.subscription_url || newSession?.rwSubUrl;
    const combined = data.combined_subscription_url || undefined;
    if (newSession && (rw !== newSession.rwSubUrl || combined !== newSession.combinedSubUrl)) {
      const updated: Session = {
        ...newSession,
        subUrl: newSession.subUrl || rw || "",
        rwSubUrl: rw,
        combinedSubUrl: combined,
      };
      await saveSession(updated);
      setSession(updated);
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
    setNodes([...subResult.nodes.map((n) => ({ ...n, source: "sub" as const })), ...lteNodes]);
    setUnsupportedCount(subResult.unsupportedCount);
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (!mounted.current) return;
      setSession(s);
      if (s) {
        try {
          await refreshMe();
        } catch {}
        try {
          await reloadNodes();
        } catch {}
        const savedId = await loadSelectedNodeId();
        if (savedId) setSelectedNodeId(savedId);
      }
      if (mounted.current) setLoading(false);
    })();
  }, [refreshMe, reloadNodes]);

  const signIn = useCallback(async (loginStr: string, password: string) => {
    const data = await api.login(loginStr, password);
    if (!data?.success) throw new Error(data?.error || "Неверный логин или пароль");
    await saveSession({
      subUrl: data.subscription_url,
      combinedSubUrl: data.subscription_url,
      login: data.user?.login,
      email: data.user?.email,
    });
    const s = await loadSession();
    setSession(s);
    try {
      await refreshMe();
      await reloadNodes();
    } catch {}
  }, [refreshMe, reloadNodes]);

  const signInViaToken = useCallback(async (subscriptionUrl: string, user?: any) => {
    await saveSession({
      subUrl: subscriptionUrl,
      combinedSubUrl: subscriptionUrl,
      login: user?.login,
      email: user?.email,
    });
    const s = await loadSession();
    setSession(s);
    try {
      await refreshMe();
      await reloadNodes();
    } catch {}
  }, [refreshMe, reloadNodes]);

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
      signIn,
      signInViaToken,
      signOut,
      refreshMe,
      reloadNodes,
      selectNode,
      setVpnRunning,
    }),
    [loading, session, me, nodes, unsupportedCount, selectedNodeId, vpnRunning, subscriptionActive, signIn, signOut, refreshMe, reloadNodes, selectNode]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
