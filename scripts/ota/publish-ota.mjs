#!/usr/bin/env node
/**
 * Безопасная публикация EAS Update.
 *
 * По умолчанию публикует ТОЛЬКО в ветку/канал `preview` (безопасно).
 * Публикация в `production` требует ДВУХ независимых подтверждений:
 *   1. флаг --confirm-production
 *   2. переменная окружения GC_PUBLISH_PROD=yes
 *
 * Перед публикацией проверяет:
 *   - авторизацию (eas whoami)
 *   - чистоту рабочего дерева (публикуется только закоммиченное)
 *   - вердикт классификатора (--range / HEAD~1..HEAD): публикация разрешена только при OTA
 *     (обход --force допустим только для preview, для production — никогда)
 *
 * Использование:
 *   node scripts/ota/publish-ota.mjs -m "описание" [--branch preview|production]
 *                                    [--confirm-production] [--force] [--range A..B]
 *                                    [--environment production] [--dry-run]
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OTA_DIR = path.join(ROOT, "scripts", "ota");
const HISTORY_FILE = path.join(OTA_DIR, "history.json");
const config = JSON.parse(fs.readFileSync(path.join(OTA_DIR, "config.json"), "utf8"));

function parseArgs(argv) {
  const a = { message: "", branch: config.defaultOtaBranch, confirmProd: false, force: false, range: null, environment: "production", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "-m" || k === "--message") a.message = argv[++i];
    else if (k === "--branch") a.branch = argv[++i];
    else if (k === "--confirm-production") a.confirmProd = true;
    else if (k === "--force") a.force = true;
    else if (k === "--range") a.range = argv[++i];
    else if (k === "--environment") a.environment = argv[++i];
    else if (k === "--dry-run") a.dryRun = true;
  }
  return a;
}

function fail(msg) { console.error(`✖ ${msg}`); process.exit(1); }
function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"], ...opts });
}
function eas(args, opts = {}) {
  return execFileSync(process.execPath, [path.join(ROOT, "node_modules/eas-cli/bin/run"), ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"], ...opts });
}
function easJson(args) {
  const out = execFileSync(process.execPath, [path.join(ROOT, "node_modules/eas-cli/bin/run"), ...args, "--json", "--non-interactive"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}
function git(...args) { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim(); }

const args = parseArgs(process.argv.slice(2));

// 1. Канал/ветка
if (!config.channels.includes(args.branch)) {
  fail(`Неизвестный канал "${args.branch}". Разрешены: ${config.channels.join(", ")}`);
}
const isProd = args.branch === config.production.channel;

// 2. Гейты для production
if (isProd) {
  if (args.force) fail("Флаг --force для production запрещён. Всегда проверяйте классификатор.");
  const envOk = process.env[config.production.envVarGate] === config.production.envVarValue;
  if (!args.confirmProd || !envOk) {
    fail(`Публикация в production требует ДВУХ подтверждений:
   1. флаг ${config.production.flagGate}   (есть: ${args.confirmProd ? "да" : "нет"})
   2. переменная окружения ${config.production.envVarGate}=${config.production.envVarValue}   (есть: ${envOk ? "да" : "нет"})`);
  }
  console.error("⚠ Публикация в PRODUCTION подтверждена двойным гейтом.");
}

// 3. Сообщение
if (!args.message) {
  const subject = git("log", "-1", "--pretty=%s").slice(0, 120);
  args.message = subject;
  console.error(`Сообщение обновления: "${args.message}" (из последнего коммита)`);
}

// 4. Чистое рабочее дерево
const dirty = git("status", "--porcelain");
if (dirty) fail("Рабочее дерево не чистое — закоммитьте изменения перед публикацией (публикуется только состояние в коммитах).");

// 5. Авторизация
try {
  eas(["whoami"]);
} catch {
  fail("Нет авторизации в EAS: выполните `npx eas login` (или задайте EXPO_TOKEN).");
}

// 6. Классификатор
let verdict = "OTA";
try {
  const classArgs = [path.join(OTA_DIR, "classify.mjs"), "--quiet"];
  if (args.range) classArgs.push("--range", args.range);
  const out = execFileSync(process.execPath, classArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  verdict = JSON.parse(out).verdict;
} catch (e) {
  const code = e.status ?? -1;
  if (code === 10) verdict = "NATIVE_BUILD";
  else if (code === 20) verdict = "REVIEW_REQUIRED";
  else fail(`Классификатор завершился с ошибкой (код ${code})`);
}

if (verdict !== "OTA") {
  if (verdict === "NATIVE_BUILD") fail(`Классификатор: ${verdict} — изменения требуют новой сборки. Публикация запрещена для любых каналов.`);
  if (args.force && !isProd) console.error(`⚠ Классификатор: ${verdict}, но публикация в ${args.branch} форсирована (--force).`);
  else fail(`Классификатор: ${verdict} — безопасная публикация невозможна. Для preview можно форсировать флагом --force (на ваш риск).`);
}

// 7. Публикация
const commit = git("rev-parse", "--short", "HEAD");
console.error(`➤ eas update --branch ${args.branch} --environment ${args.environment} -m "${args.message}"`);
if (args.dryRun) { console.error("DRY RUN: публикация не выполняется."); process.exit(0); }

eas(["update", "--branch", args.branch, "--environment", args.environment, "-m", args.message, "--platform", config.platform, "--non-interactive"]);

// 8. История
let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch {}
const entry = { time: new Date().toISOString(), branch: args.branch, commit, message: args.message };
try {
  const list = easJson(["update:list", "--branch", args.branch, "--limit", "5"]);
  const latest = Array.isArray(list) ? list[0] : null;
  if (latest?.id) { entry.groupId = latest.id; entry.runtimeVersion = latest.runtimeVersion; }
} catch {}
history.unshift(entry);
fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 200), null, 2));
console.error(`✔ Опубликовано в ветку "${args.branch}" (коммит ${commit}). Запись добавлена в history.json.`);
