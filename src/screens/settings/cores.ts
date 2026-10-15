import type { CoreName } from "../../settings";

/** Каталог скачиваемых ядер VPN и работа с ним — вынесено из настроек,
 *  чтобы подэкран «VPN и сеть» и главный экран настроек не дублировали данные. */
export const CORES_REPO_MANIFEST =
  "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/manifest.json";

export const JOLY_REPO_BASE = "https://raw.githubusercontent.com/instant992/ghostcloudcore_new/main/";

export const CORES: Array<{
  key: CoreName;
  label: string;
  file: string;
  lib: "singbox" | "uwuray" | "xray-last" | "xray-joly" | null;
  note: string;
  mb: number;
}> = [
  { key: "xray", label: "Xray", file: "", lib: null, note: "встроен · VLESS, VMess, Trojan, SS, Hysteria2", mb: 0 },
  { key: "sing-box", label: "Sing-box", file: "libsingbox.so", lib: "singbox", note: "альтернативное ядро · все протоколы", mb: 36 },
  { key: "uwuray", label: "UwuRay", file: "libuwuray.so", lib: "uwuray", note: "форк Xray · расширенный BT-снаффер", mb: 34 },
  { key: "xray-last", label: "Xray Last", file: "libxraylast.so", lib: "xray-last", note: "официальный XTLS/Xray-core · автообновление перед подключением", mb: 35 },
  { key: "xray-joly", label: "Xray Joly", file: "libxrayjoly.so", lib: "xray-joly", note: "форк Jolymmiles/Xray-core · автообновление перед подключением", mb: 35 },
];

// Фолбэк, если манифест недоступен
export const FALLBACK: Record<string, Record<string, { url: string; sha256: string; size: number; version?: string }>> = {
  "sing-box": {
    "arm64-v8a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/arm64-v8a/libsingbox.so",
      sha256: "56cfe9a22fadd4029c24b5db5b45a10a93bd61688aae7094b365b4e37fd34958",
      size: 28855696,
    },
    "armeabi-v7a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/armeabi-v7a/libsingbox.so",
      sha256: "4fa931fc252553577cd31c16d3427cea9af64b2a198c3a12a99098414921789f",
      size: 27316004,
    },
    x86_64: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/x86_64/libsingbox.so",
      sha256: "6a8924603fd73aea9da8db68c8d8a9300316f6f640e5bad57eb49a006958a3dc",
      size: 31023024,
    },
    x86: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/x86/libsingbox.so",
      sha256: "1f93e72b2f2c187fa16dba3fba2bb4338a61c2ea449eb83d591ddea79b2c490e",
      size: 27846700,
    },
  },
  uwuray: {
    "arm64-v8a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/arm64-v8a/libuwuray.so",
      sha256: "2935fd14447311507cf36338c20a316888f6ca7a2111aa0fc1fcefe88b46ed81",
      size: 35512232,
    },
    "armeabi-v7a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/armeabi-v7a/libuwuray.so",
      sha256: "c205b43ee8d6b70af450e363054397d2c2759c87352e4e6c75cfa1d398a6653f",
      size: 33888592,
    },
    x86_64: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/x86_64/libuwuray.so",
      sha256: "a06c60c05b4803e0c81fa8a6d4a00433a16edebb8a1dde454884e2baab08792d",
      size: 37804136,
    },
    x86: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/uwuray-1/x86/libuwuray.so",
      sha256: "50b096cb48e9c7e03834664a69ba3a744853a980449c38049a92c6d086747524",
      size: 34312536,
    },
  },
};

export type CoreMeta = { url: string; sha256: string; size: number; version: string };

export async function fetchCoreMeta(core: string, abi: string): Promise<CoreMeta | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const github = core === "xray-joly" || core === "xray-last";
    const base = github ? JOLY_REPO_BASE : "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/";
    const res = await fetch(github ? `${base}manifest.json` : CORES_REPO_MANIFEST, { signal: controller.signal });
    if (!res.ok) return null;
    const manifest = await res.json();
    const entry = manifest?.cores?.[core];
    const file = entry?.files?.[abi];
    if (!file?.path) return null;
    const versionPattern = /^\d+\.\d+\.\d+(?:-\d+)?$/;
    if (github) {
      const name = core === "xray-joly" ? "libxrayjoly.so" : "libxraylast.so";
      const escapedVersion = String(entry.version).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expectedPath = new RegExp(`^cores/${core}-v${escapedVersion}(?:-[0-9a-f]+-[0-9]+-[0-9]+)?/${abi}/${name}$`);
      if (!versionPattern.test(entry.version || "") || !["arm64-v8a", "armeabi-v7a", "x86", "x86_64"].includes(abi) ||
          !expectedPath.test(file.path) || !/^[0-9a-f]{64}$/i.test(file.sha256 || "") ||
          !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 150000000) return null;
    }
    return {
      url: `${base}${file.path}`,
      sha256: String(file.sha256 || ""),
      size: Number(file.size || 0),
      version: String(entry.version || ""),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
