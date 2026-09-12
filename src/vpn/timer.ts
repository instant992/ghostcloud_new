import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../settings";

/** Единый источник времени подключения.
 *
 *  Раньше каждый экран вёл свой локальный счётчик setInterval(s => s+1):
 *  при ремаунте экрана/вкладок он стартовал с нуля, а на переходе через час
 *  формат «ММ:СС → ЧЧ:ММ:СС» выглядел как обнуление. Теперь храним ОДНУ
 *  абсолютную метку connectedAt (мс) в нативных настройках — она переживает
 *  ремаунт и даже убийство JS-процесса (VPN-сервис при этом живёт), а прошедшее
 *  время всегда считаем как Date.now() - connectedAt.
 */
const KEY = "vpn_connected_at";

/** Отметить момент (пере)подключения VPN. */
export function markVpnConnected(): void {
  setSetting(KEY, String(Date.now()));
}

/** Сбросить метку при отключении. */
export function clearVpnConnected(): void {
  setSetting(KEY, "");
}

/** Абсолютная метка текущего подключения (0 = не подключено). */
export function getConnectedAt(): number {
  const v = Number(getSetting(KEY, ""));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Прошедшие секунды с момента подключения (0, если не подключено). */
export function elapsedSeconds(): number {
  const at = getConnectedAt();
  if (!at) return 0;
  return Math.max(0, Math.floor((Date.now() - at) / 1000));
}

/**
 * Формат прошедшего времени подключения.
 *  < 1 ч     → «ММ:СС»
 *  < 1 дн    → «ЧЧ:ММ:СС»
 *  < 7 дн    → «N д ЧЧ:ММ:СС»
 *  ≥ 7 дн    → «N нед M д ЧЧ:ММ:СС»
 */
export function formatElapsed(total: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d >= 7) {
    const w = Math.floor(d / 7);
    const rd = d % 7;
    return `${w} нед ${rd} д ${p(h)}:${p(m)}:${p(s)}`;
  }
  if (d >= 1) return `${d} д ${p(h)}:${p(m)}:${p(s)}`;
  if (h >= 1) return `${p(h)}:${p(m)}:${p(s)}`;
  return `${p(m)}:${p(s)}`;
}

/**
 * Хук: прошедшие секунды VPN-сессии, обновляется раз в секунду, пока running.
 *  Считается от абсолютной метки, поэтому НЕ обнуляется при ремаунте экрана.
 */
export function useVpnTimerSeconds(running: boolean): number {
  const [sec, setSec] = useState(() => (running ? elapsedSeconds() : 0));
  useEffect(() => {
    if (!running) {
      setSec(0);
      return;
    }
    // VPN работает, но метки нет (холодный старт JS при живом VPN-сервисе,
    // либо подключение из версии без метки) — ставим её сейчас, чтобы таймер
    // шёл, а не стоял на нуле.
    if (!getConnectedAt()) markVpnConnected();
    // Сразу синхронизируемся с абсолютной меткой (важно после ремаунта)
    setSec(elapsedSeconds());
    const t = setInterval(() => setSec(elapsedSeconds()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return sec;
}
