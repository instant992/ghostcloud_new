import * as FileSystem from "expo-file-system/legacy";

const REFRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;
type Metadata = { url: string; file: string; checked: number };
type Slot = {
  url: string | null; uri: string | null; generation: number; checked: number;
  attempted: number; ready?: Promise<void>; flight?: Promise<void>; queue: Promise<void>;
};

/** SHA-256 keeps session credentials out of paths/metadata (and keys do not collide
 * when accounts share a login, an avatar URL, or change their display name). */
export function avatarOwner(session: { subUrl: string; tgId?: string } | null): string | null {
  if (!session) return null;
  const text = JSON.stringify([session.subUrl, session.tgId || ""]);
  const bytes = Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
  const bits = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
  const k: number[] = [], h: number[] = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) {
      if (h.length < 8) h.push((Math.sqrt(n) % 1 * 0x100000000) | 0);
      k.push((Math.cbrt(n) % 1 * 0x100000000) | 0);
    }
  }
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w: number[] = [];
    for (let i = 0; i < 16; i++) w[i] = (bytes[offset + i * 4] << 24) | (bytes[offset + i * 4 + 1] << 16) | (bytes[offset + i * 4 + 2] << 8) | bytes[offset + i * 4 + 3];
    for (let i = 16; i < 64; i++) w[i] = (w[i - 16] + (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10))) | 0;
    let [a, b, c, d, e, f, g, z] = h;
    for (let i = 0; i < 64; i++) {
      const t = (z + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const u = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      z = g; g = f; f = e; e = (d + t) | 0; d = c; c = b; b = a; a = (t + u) | 0;
    }
    [a, b, c, d, e, f, g, z].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
  }
  return h.map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
}

/** Public avatar URLs only: never attach auth credentials to image requests. */
export function resolveAvatarUrl(base: string, path?: string | null): string | null {
  if (!path) return null;
  try {
    const url = new URL(path, base);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function createAvatarCache(fs: typeof FileSystem, options: { now?: () => number; timeoutMs?: number } = {}) {
  const now = options.now || Date.now;
  const slots = new Map<string, Slot>();
  const listeners = new Set<() => void>();
  const root = fs.documentDirectory ? `${fs.documentDirectory}user_avatars/` : null;
  const nonce = Math.random().toString(36).slice(2);
  let seq = 0;
  const emit = () => listeners.forEach(fn => fn());
  const slot = (owner: string) => {
    let s = slots.get(owner);
    if (!s) { s = { url: null, uri: null, generation: 0, checked: 0, attempted: -Infinity, queue: Promise.resolve() }; slots.set(owner, s); }
    return s;
  };
  const dir = (owner: string) => `${root}${owner}/`;
  const remove = (uri: string) => fs.deleteAsync(uri, { idempotent: true }).catch(() => {});
  const serial = (s: Slot, fn: () => Promise<void>) => {
    const p = s.queue.then(fn);
    s.queue = p.catch(() => {});
    return p;
  };
  async function refresh(owner: string, s: Slot, generation: number, url: string) {
    if (!root) return;
    const temp = `${dir(owner)}pending-${nonce}-${++seq}`;
    const valid = () => s.generation === generation && s.url === url;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await fs.makeDirectoryAsync(dir(owner), { intermediates: true });
      if (!valid()) return;
      const task = fs.createDownloadResumable(url, temp, {
        md5: true, cache: false, headers: { "Cache-Control": "no-cache" },
        sessionType: fs.FileSystemSessionType.FOREGROUND,
      });
      let timedOut = false;
      const download = task.downloadAsync().then(async result => {
        if (timedOut) { await remove(temp); return undefined; }
        return result;
      });
      const result = await Promise.race([download, new Promise<undefined>((_, reject) => {
        timer = setTimeout(() => { timedOut = true; void task.cancelAsync().catch(() => {}); reject(new Error("Avatar timeout")); }, options.timeoutMs ?? 15000);
      })]);
      if (timer) clearTimeout(timer);
      if (!valid() || !result || result.status !== 200) return;
      const mime = (result.mimeType || Object.entries(result.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").split(";")[0].toLowerCase();
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime) || !/^[a-f0-9]{32}$/i.test(result.md5 || "")) return;
      const info = await fs.getInfoAsync(temp);
      if (!info.exists || info.isDirectory || info.size <= 0 || info.size > 10 * 1024 * 1024) return;
      const head = await fs.readAsStringAsync(temp, { encoding: fs.EncodingType.Base64, position: 0, length: 16 });
      const signature = mime === "image/png" ? head.startsWith("iVBORw0KGgo")
        : mime === "image/jpeg" ? head.startsWith("/9j/")
        : mime === "image/gif" ? /^R0lGOD[lh]/.test(head)
        : /^UklGR.{10}V0VCUA/.test(head);
      if (!signature) return;
      await serial(s, async () => {
        if (!valid()) return;
        const file = `${result.md5!.toLowerCase()}.image`;
        const destination = `${dir(owner)}${file}`;
        const existing = await fs.getInfoAsync(destination);
        if (!existing.exists) await fs.moveAsync({ from: temp, to: destination });
        const checked = now();
        const metadata: Metadata = { url, file, checked };
        const manifest = `${dir(owner)}manifest-${nonce}-${++seq}.json`;
        await fs.writeAsStringAsync(manifest, JSON.stringify(metadata));
        if (!valid()) { await remove(manifest); return; }
        await fs.moveAsync({ from: manifest, to: `${dir(owner)}manifest.json` });
        if (!valid()) return;
        const old = s.uri;
        s.uri = destination; s.checked = checked; emit();
        if (old && old !== destination) await remove(old);
      });
    } catch { /* Offline / invalid responses never replace the last good image. */ }
    finally { if (timer) clearTimeout(timer); await remove(temp); }
  }
  async function load(owner: string, url: string | null, force = false): Promise<string | null> {
    const s = slot(owner);
    if (!url) { await clear(owner); return null; }
    if (s.url !== url || force) {
      s.url = url; s.generation++; s.checked = 0; s.attempted = -Infinity; s.flight = undefined;
    }
    const generation = s.generation;
    if (!s.ready) {
      s.ready = (async () => {
        if (!root) return;
        try {
          const data: Metadata = JSON.parse(await fs.readAsStringAsync(`${dir(owner)}manifest.json`));
          if (!/^[a-f0-9]{32}\.image$/.test(data.file) || !Number.isFinite(data.checked)) return;
          const uri = `${dir(owner)}${data.file}`;
          const info = await fs.getInfoAsync(uri);
          if (s.generation !== generation || !info.exists || info.isDirectory || info.size <= 0) return;
          s.uri = uri;
          s.checked = data.url === url && !force ? data.checked : 0;
          emit();
        } catch {}
      })();
    }
    await s.ready;
    if (s.generation !== generation) return s.uri;
    if ((!s.uri || now() - s.checked >= REFRESH_MS || s.checked === 0) && now() - s.attempted >= RETRY_MS) {
      if (!s.flight) {
        s.attempted = now();
        const flight = refresh(owner, s, generation, url);
        s.flight = flight;
        void flight.finally(() => { if (s.flight === flight) s.flight = undefined; });
      }
      if (!s.uri) await s.flight;
    }
    return s.uri;
  }
  async function clear(owner: string) {
    const s = slot(owner);
    s.generation++; s.url = null; s.uri = null; s.flight = undefined;
    s.ready = Promise.resolve(); s.checked = 0; s.attempted = -Infinity; emit();
    if (root) await serial(s, () => remove(dir(owner).slice(0, -1)));
  }
  return {
    load, clear,
    peek: (owner: string | null) => owner ? slots.get(owner)?.uri || null : null,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

export const userAvatarCache = createAvatarCache(FileSystem);
