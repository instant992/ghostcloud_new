#!/usr/bin/env node
/**
 * Безопасный откат (rollback) EAS Update.
 *
 * Варианты:
 *   --previous            откатить ветку на предыдущую группу обновлений
 *                         (предпоследняя группа переиздаётся поверх последней)
 *   --group <groupId>     переиздать конкретную старую группу (полная точность)
 *
 * Как определить последний/предыдущий апдейт:
 *   - локальная история:  scripts/ota/history.json (пишется каждой публикацией)
 *   - сервер:             npx eas update:list --branch <ветка> --json
 *
 * Как работает откат:
 *   `eas update:republish --branch <ветка> --destination-branch <ветка>` —
 *   переиздаёт выбранную группу как новую «последнюю»; клиенты подтянут её
 *   при следующем запуске. Это атомарная серверная операция.
 *
 * Использование:
 *   node scripts/ota/rollback.mjs --branch preview --previous [-m "откат: причина"]
 *   node scripts/ota/rollback.mjs --branch production --group <groupId> --confirm-production -m "..."
 *
 * Крайний случай: если переиздать нечего, откатываемся через сборку:
 *   `git checkout <тег-рабочей-версии> && npx eas update --branch <ветка>`
 *   (гарантируется тем, что каждый релиз тегируется: ota/v<версия>)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OTA_DIR = path.join(ROOT, "scripts", "ota");
const config = JSON.parse(fs.readFileSync(path.join(OTA_DIR, "config.json"), "utf8"));

const argv = process.argv.slice(2);
const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const has = (flag) => argv.includes(flag);

const branch = get("--branch") || config.defaultOtaBranch;
const group = get("--group");
const previous = has("--previous");
const message = get("-m") || get("--message") || `rollback on ${branch} ${new Date().toISOString()}`;

if (!group && !previous) {
  console.error("Укажите --previous (откат на предыдущую группу) или --group <groupId>.");
  process.exit(1);
}

const isProd = branch === config.production.channel;
if (isProd) {
  const envOk = process.env[config.production.envVarGate] === config.production.envVarValue;
  if (!has("--confirm-production") || !envOk) {
    console.error(`Откат production требует: флаг --confirm-production И переменную ${config.production.envVarGate}=${config.production.envVarValue}`);
    process.exit(1);
  }
}

function eas(args) {
  return execFileSync(process.execPath, [path.join(ROOT, "node_modules/eas-cli/bin/run"), ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] });
}
function easJson(args) {
  const out = execFileSync(process.execPath, [path.join(ROOT, "node_modules/eas-cli/bin/run"), ...args, "--json", "--non-interactive"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}

let targetGroup = group;
if (previous) {
  const list = easJson(["update:list", "--branch", branch, "--limit", "10"]);
  const groups = Array.isArray(list) ? list : (list?.currentPage || []);
  if (groups.length < 2) {
    console.error("✖ На ветке меньше двух групп — переиздавать нечего. Альтернатива: пересоберите рабочую версию из тега и опубликуйте.");
    process.exit(1);
  }
  targetGroup = groups[1].group;
  console.error(`Найдена предыдущая группа: ${targetGroup} (${groups[1].message || ""})`);
}

console.error(`➤ eas update:republish --group ${targetGroup} --destination-branch ${branch}`);
eas(["update:republish", "--group", targetGroup, "--destination-branch", branch, "-m", message, "--non-interactive"]);
console.error(`✔ Откат выполнен: ветка "${branch}" указывает на группу ${targetGroup}. Клиенты получат её при следующем запуске.`);
