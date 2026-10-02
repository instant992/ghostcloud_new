import type { CoreName } from "../../settings";

/** Каталог скачиваемых ядер VPN и работа с ним — вынесено из настроек,
 *  чтобы подэкран «VPN и сеть» и главный экран настроек не дублировали данные. */
export const CORES_REPO_MANIFEST =
  "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/manifest.json";

export const CORES: Array<{
  key: CoreName;
  label: string;
  file: string;
  lib: "singbox" | "uwuray" | null;
  note: string;
  mb: number;
}> = [
  { key: "xray", label: "Xray", file: "", lib: null, note: "встроен · VLESS, VMess, Trojan, SS, Hysteria2", mb: 0 },
  { key: "sing-box", label: "Sing-box", file: "libsingbox.so", lib: "singbox", note: "альтернативное ядро · все протоколы", mb: 36 },
  { key: "uwuray", label: "UwuRay", file: "libuwuray.so", lib: "uwuray", note: "форк Xray · расширенный BT-снаффер", mb: 34 },
];

// Фолбэк, если манифест недоступен
export const FALLBACK: Record<string, Record<string, { url: string; sha256: string; size: number }>> = {
  "sing-box": {
    "arm64-v8a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/arm64-v8a/libsingbox.so",
      sha256: "4e2c79b5b1d721ba957afd9815868f95439e7e1ea989cfded49de09f234ff286",
      size: 35185576,
    },
    "armeabi-v7a": {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/armeabi-v7a/libsingbox.so",
      sha256: "e775d76a702a90e0d0285d07bcb388d09d9fab0b199afbff793aed7f07509a65",
      size: 33308520,
    },
    x86_64: {
      url: "https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/cores/sing-box-2/x86_64/libsingbox.so",
      sha256: "100ce32a90b74f98156ad3406ee099ff6359188c1042efa4917c420b385d40e3",
      size: 37628544,
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
  try {
    const res = await fetch(CORES_REPO_MANIFEST);
    const manifest = await res.json();
    const entry = manifest?.cores?.[core];
    const file = entry?.files?.[abi];
    if (!file?.path) return null;
    return {
      url: `https://gitlab.com/instant99/ghostcloudcore_new/-/raw/main/${file.path}`,
      sha256: String(file.sha256 || ""),
      size: Number(file.size || 0),
      version: String(entry.version || ""),
    };
  } catch {
    return null;
  }
}
