import { useEffect, useState } from "react";
import { MIHOMO_REPO_BASE, fetchCoreMeta } from "./cores";
import { downloadXrayLast, getCpuAbi, getXrayLastStatus } from "../../vpn/native";

export function compareCoreVersions(a: string, b: string): number {
  if (!/^v?\d+\.\d+\.\d+$/.test(a) || !/^v?\d+\.\d+\.\d+$/.test(b)) return 0;
  const aa = a.replace(/^v/, "").split(".").map(Number);
  const bb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  return 0;
}

export async function fetchLatestXrayVersion(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.github.com/repos/XTLS/Xray-core/releases?per_page=20", { signal: controller.signal });
    if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
    const releases = await res.json();
    if (!Array.isArray(releases)) throw new Error("Некорректный список релизов");
    const release = releases.find((r: any) => !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name));
    if (!release) throw new Error("Релиз Xray не найден");
    return release.tag_name.slice(1);
  } finally { clearTimeout(timer); }
}

export function useXrayLast() {
  const [status, setStatus] = useState(getXrayLastStatus);
  const [latest, setLatest] = useState("");
  const [available, setAvailable] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setStatus(getXrayLastStatus()); setChecking(true); setError("");
    try {
      const [version, meta] = await Promise.all([fetchLatestXrayVersion(), fetchCoreMeta("xray-last", getCpuAbi())]);
      setLatest(version); setAvailable(meta?.version || "");
    } catch (e: any) { setError(e.message || "Не удалось проверить обновление"); }
    finally { setChecking(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const meta = await fetchCoreMeta("xray-last", getCpuAbi());
      if (!meta) throw new Error("Сборка Xray Last ещё не опубликована для этой архитектуры");
      if (!meta.url.startsWith(`${MIHOMO_REPO_BASE}cores/xray-last-v`)) throw new Error("Недоверенный адрес сборки");
      await downloadXrayLast(meta.url, meta.sha256, meta.size, meta.version);
      setStatus(getXrayLastStatus()); setAvailable(meta.version);
    } finally { setBusy(false); }
  };
  const outdated = status.downloaded && !!latest && compareCoreVersions(latest, status.version) > 0;
  const canUpdate = !!available && compareCoreVersions(available, status.version) > 0 && !status.pendingVersion;
  const note = status.pendingVersion ? `Загружена ${status.pendingVersion} — перезапустите приложение`
    : `${status.downloaded ? `Установлено ${status.version || "неизвестно"}` : "Не установлено"}${latest ? ` · последний XTLS ${latest} (включая prerelease)` : ""}${outdated ? " · установлено старое ядро" : ""}${outdated && !canUpdate ? " · новая Android-сборка ещё не опубликована" : ""}${error ? ` · ${error}` : ""}`;
  return { status, note, busy, checking, canUpdate, install, refresh };
}
