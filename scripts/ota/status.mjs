#!/usr/bin/env node
/**
 * Статус обновлений: каналы, ветки, последние группы, локальная история.
 * Использование: node scripts/ota/status.mjs [--branch <ветка>]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OTA_DIR = path.join(ROOT, "scripts", "ota");

const argv = process.argv.slice(2);
const branch = argv.includes("--branch") ? argv[argv.indexOf("--branch") + 1] : null;

function eas(args) {
  return execFileSync(process.execPath, [path.join(ROOT, "node_modules/eas-cli/bin/run"), ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] });
}

try { eas(["whoami"]); } catch { console.error("⚠ Нет авторизации — серверные данные недоступны. Выполните: npx eas login\n"); }

console.error("== Каналы ==");
try { eas(["channel:list"]); } catch (e) { console.error("(недоступно)"); }

console.error("\n== Последние обновления ==");
try {
  eas(branch ? ["update:list", "--branch", branch, "--limit", "10"] : ["update:list", "--all", "--limit", "10"]);
} catch { console.error("(недоступно)"); }

console.error("\n== Локальная история публикаций (скриптом) ==");
try {
  const h = JSON.parse(fs.readFileSync(path.join(OTA_DIR, "history.json"), "utf8"));
  if (!h.length) console.error("(пусто)");
  for (const e of h.slice(0, 10)) console.error(`  ${e.time}  ${e.branch.padEnd(10)} ${e.commit}  ${e.groupId || "?"}  ${e.message}`);
} catch { console.error("(history.json отсутствует — будет создан первой публикацией)"); }
