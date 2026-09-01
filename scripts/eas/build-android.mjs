#!/usr/bin/env node
/**
 * Обёртка для черновой облачной сборки: `eas build --platform android --profile production`.
 * Устанавливает EAS_NO_VCS=1: на этой машине внутренний `git clone --depth 1 file:///C:/...`
 * у eas-cli падает (особенность MSYS/пути), поэтому проект загружается архивом без git.
 * Публикация НЕ выполняется автоматически — только сборка артефакта.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = { ...process.env, EAS_NO_VCS: "1" };
const args = process.argv.slice(2);
if (!args.includes("--platform")) args.push("--platform", "android");
if (!args.includes("--profile")) args.push("--profile", "production");
if (!args.includes("--non-interactive")) args.push("--non-interactive");
if (!args.includes("--no-wait")) args.push("--no-wait");

console.error(`➤ eas build ${args.join(" ")}`);
const child = spawn(process.execPath, [path.join(ROOT, "node_modules/eas-cli/bin/run"), "build", ...args], {
  cwd: ROOT, env, stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
