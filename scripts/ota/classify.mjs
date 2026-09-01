#!/usr/bin/env node
/**
 * OTA / NATIVE_BUILD / REVIEW_REQUIRED классификатор изменений по git-диффу.
 *
 * Приоритеты (жёсткие, сверху вниз):
 *   1. Native safety rules   — детерминированные правила путей/расширений (ВЕТО)
 *   2. Runtime compatibility — runtimeVersion / версия Expo / RN / версии нативных пакетов
 *   3. Dependency analysis   — дельта package.json по реестру зависимостей
 *   4. Static analysis       — опционально (--static): tsc --noEmit (+ bundler)
 *   5. AI analysis           — ТОЛЬКО ужесточение (--ai-verdict), понизить вердикт нельзя
 *
 * Использование:
 *   node scripts/ota/classify.mjs [--range <refA>..<refB>] [--commit <sha>]
 *                                 [--root <dir>] [--static] [--ai-verdict <OTA|NATIVE_BUILD|REVIEW_REQUIRED>] [--quiet]
 *
 * По умолчанию анализируется последний коммит (HEAD~1..HEAD).
 * Выход: 0 = OTA, 10 = NATIVE_BUILD, 20 = REVIEW_REQUIRED. JSON-вердикт в stdout.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SEVERITY = { OTA: 0, REVIEW_REQUIRED: 1, NATIVE_BUILD: 2 };
const EXIT = { OTA: 0, NATIVE_BUILD: 10, REVIEW_REQUIRED: 20 };

function parseArgs(argv) {
  const args = { root: process.cwd(), range: null, commit: null, static: false, aiVerdict: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--range") args.range = argv[++i];
    else if (a === "--commit") args.commit = argv[++i];
    else if (a === "--root") args.root = path.resolve(argv[++i]);
    else if (a === "--static") args.static = true;
    else if (a === "--ai-verdict") args.aiVerdict = argv[++i];
    else if (a === "--quiet") args.quiet = true;
    else if (a === "--help" || a === "-h") {
      console.error(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 16).join("\n"));
      process.exit(2);
    }
  }
  if (args.aiVerdict && !(args.aiVerdict in SEVERITY)) {
    console.error(`--ai-verdict: недопустимое значение "${args.aiVerdict}"`);
    process.exit(2);
  }
  return args;
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function gitShow(root, ref, file) {
  try {
    return git(root, "show", `${ref}:${file}`);
  } catch {
    return null;
  }
}

function tryParseJson(text) {
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ---------- анализ списка файлов ----------

const NATIVE_PATH_RULES = [
  { re: /^android\/.*/, why: "нативный проект android/ (Gradle, манифест, ресурсы, Kotlin)" },
  { re: /^android\/app\/src\/main\/res\/.*/, why: "нативные ресурсы (картинки по имени, сплэш, иконки) — в OTA не попадают" },
  { re: /^core-src\/.*/, why: "исходники нативных VPN-ядер" },
  { re: /\.so$/i, why: "бинарная нативная библиотека (.so)" },
  { re: /\.aar$/i, why: "нативный архив Android (.aar)" },
  { re: /\.jar$/i, why: "Java-библиотека (.jar)" },
  { re: /\.keystore$|\.jks$/i, why: "ключ подписи" },
];

const MODULE_NATIVE_RE = /^modules\/[^/]+\/(?!.*\.(ts|tsx|js|jsx)$).*$/;
const JS_IN_MODULE_RE = /^modules\/[^/]+\/.*\.(ts|tsx|js|jsx)$/;

const OTA_SAFE_PREFIXES = [
  { re: /^src\/.*\.(ts|tsx|js|jsx)$/, why: "JS/TS исходники приложения" },
  { re: /^App\.tsx$/, why: "корневой компонент (чистый JS)" },
  { re: /^index\.ts$/, why: "точка входа (чистый JS)" },
];

const OTA_NEUTRAL = [
  { re: /^docs\/.*/, why: "документация" },
  { re: /^README\.md$|^AGENTS\.md$/, why: "документация" },
  { re: /^scripts\/.*/, why: "инструменты автоматизации (не входят в бандл)" },
  { re: /^\.gitignore$/, why: "git-конфиг" },
  { re: /^(build_log\.txt|tsc_out\.txt|build_apks\.ps1|build_now\.bat)$/, why: "локальные скрипты/логи сборки" },
  { re: /^\.hermes\/.*|^\.expo\/.*/, why: "кэши инструментов" },
];

const CONFIG_REVIEW = [
  { re: /^eas\.json$/, why: "конфигурация EAS-сборок (не меняет JS-бандл, но влияет на каналы/сборки)" },
  { re: /^metro\.config\.js$/, why: "конфигурация банделера — проверить влияние" },
  { re: /^modules\/[^/]+\/package\.json$/, why: "package.json локального нативного модуля — проверить" },
];

function classifyFiles(files, reasons, warnings) {
  let verdict = "OTA";
  const raise = (v, why) => {
    reasons.push(why);
    if (SEVERITY[v] > SEVERITY[verdict]) verdict = v;
  };

  for (const f of files) {
    const p = f.path;

    let hit = NATIVE_PATH_RULES.find((r) => r.re.test(p));
    if (!hit && /^modules\//.test(p) && !JS_IN_MODULE_RE.test(p)) {
      hit = { re: MODULE_NATIVE_RE, why: "нативная часть локального Expo-модуля (Kotlin/gradle/манифест)" };
    }
    if (hit) { raise("NATIVE_BUILD", `NATIVE: ${p} — ${hit.why}`); continue; }

    if (JS_IN_MODULE_RE.test(p)) { warnings.push(`JS-обёртка нативного модуля изменена: ${p} (убедитесь, что новых нативных методов нет)`); continue; }
    if (OTA_SAFE_PREFIXES.some((r) => r.re.test(p))) continue;
    if (OTA_NEUTRAL.some((r) => r.re.test(p))) { warnings.push(`Служебный файл (вне рантайма): ${p}`); continue; }

    if (/^assets\//.test(p)) {
      if (/icon|adaptive-icon|splash/i.test(p)) warnings.push(`Иконка/сплэш изменены (${p}) — применяются только в новой нативной сборке, для OTA безвредно`);
      continue; // новые картинки подключаются через require() и попадают в бандл
    }
    if (/^(babel\.config\.js|tsconfig\.json)$/.test(p)) continue;
    if (CONFIG_REVIEW.some((r) => r.re.test(p))) { raise("REVIEW_REQUIRED", `REVIEW: ${p} — ${CONFIG_REVIEW.find((r) => r.re.test(p)).why}`); continue; }
    if (p === "app.json") continue; // разбирается отдельно по содержимому
    if (p === "package.json" || p === "package-lock.json") continue; // отдельно

    raise("REVIEW_REQUIRED", `REVIEW: неизвестный файл ${p} — нет правила, требуется ручная оценка`);
  }
  return verdict;
}

// ---------- app.json ----------

function classifyAppJson(root, rangeA, rangeB, reasons) {
  const oldJson = tryParseJson(gitShow(root, rangeA, "app.json"));
  const newJson = tryParseJson(gitShow(root, rangeB, "app.json"));
  if (!newJson) return "OTA";
  if (!oldJson) { reasons.push("REVIEW: app.json добавлен — проверить нативные поля вручную"); return "REVIEW_REQUIRED"; }
  if (JSON.stringify(oldJson) === JSON.stringify(newJson)) return "OTA";

  const o = oldJson.expo || oldJson;
  const n = newJson.expo || newJson;
  const changed = (getter) => JSON.stringify(getter(o)) !== JSON.stringify(getter(n));

  let verdict = "OTA";
  const nativeFields = [
    ["runtimeVersion", (c) => c.runtimeVersion, "изменение рантайм-версии = новые бинарники"],
    ["версия приложения (expo.version)", (c) => c.version, "версия запекается в нативную сборку"],
    ["секция android (права/пакет/иконки)", (c) => c.android, "permissions/конфиг упаковки — только нативная сборка"],
    ["список plugins", (c) => c.plugins, "config-плагины меняют нативный код/манифест"],
    ["обновления: updates", (c) => c.updates && { url: c.updates.url, requestHeaders: c.updates.requestHeaders }, "URL обновлений и канал запекаются в манифест"],
  ];
  for (const [label, getter, why] of nativeFields) {
    if (changed(getter)) {
      reasons.push(`NATIVE: app.json → ${label}: ${why}`);
      verdict = "NATIVE_BUILD";
    }
  }
  if (verdict === "OTA") {
    reasons.push("REVIEW: app.json изменён в полях вне белого списка (имя/иконка/фон) — проверить вручную");
    verdict = "REVIEW_REQUIRED";
  }
  return verdict;
}

// ---------- package.json / зависимости ----------

function diffDeps(oldPkg, newPkg) {
  const oldAll = { ...(oldPkg?.dependencies || {}), ...(oldPkg?.devDependencies || {}) };
  const newAll = { ...(newPkg?.dependencies || {}), ...(newPkg?.devDependencies || {}) };
  const added = [], removed = [], changed = [];
  for (const name of Object.keys(newAll)) {
    if (!(name in oldAll)) added.push({ name, version: newAll[name] });
    else if (oldAll[name] !== newAll[name]) changed.push({ name, from: oldAll[name], to: newAll[name] });
  }
  for (const name of Object.keys(oldAll)) if (!(name in newAll)) removed.push({ name });
  return { added, removed, changed };
}

function classifyDeps(root, rangeA, rangeB, registry, reasons, warnings) {
  const oldPkg = tryParseJson(gitShow(root, rangeA, "package.json"));
  const newPkg = tryParseJson(gitShow(root, rangeB, "package.json"));
  if (!oldPkg || !newPkg) return "OTA";

  const { added, removed, changed } = diffDeps(oldPkg, newPkg);
  if (!added.length && !removed.length && !changed.length) {
    // только другие поля (например, scripts) — безвредно
    return "OTA";
  }

  let verdict = "OTA";
  const raise = (v, why) => { reasons.push(why); if (SEVERITY[v] > SEVERITY[verdict]) verdict = v; };
  const reg = registry.packages || {};

  for (const { name } of added) {
    const info = reg[name];
    if (!info) raise("REVIEW_REQUIRED", `REVIEW: новый пакет "${name}" отсутствует в реестре — нужна ручная классификация (добавить в scripts/ota/deps-registry.json)`);
    else if (info.native) raise("NATIVE_BUILD", `NATIVE: добавлен нативный пакет "${name}" (${info.kind}) — требуется новая сборка`);
    else warnings.push(`Добавлен JS-пакет "${name}" (${info.kind})`);
  }
  for (const { name } of removed) {
    const info = reg[name];
    if (!info) raise("REVIEW_REQUIRED", `REVIEW: удалён пакет "${name}", нет в реестре`);
    else if (info.native) raise("NATIVE_BUILD", `NATIVE: удалён нативный пакет "${name}" — бандл без него сломает нативные вызовы`);
  }
  for (const { name, from, to } of changed) {
    const info = reg[name];
    if (!info) raise("REVIEW_REQUIRED", `REVIEW: смена версии "${name}" (${from} → ${to}), нет в реестре`);
    else if (info.native) raise("NATIVE_BUILD", `NATIVE: смена версии нативного пакета "${name}" (${from} → ${to})`);
    else warnings.push(`Смена версии JS-пакета "${name}": ${from} → ${to}`);
  }
  return verdict;
}

// ---------- нативный API (новые вызовы) ----------

function classifyNativeApi(root, rangeA, rangeB, nativeApi, reasons) {
  let diff;
  try {
    diff = git(root, "diff", "--unified=0", `${rangeA}..${rangeB}`, "--", "*.ts", "*.tsx");
  } catch {
    return "OTA";
  }
  const known = new Set([...nativeApi.functions, ...nativeApi.asyncFunctions, ...nativeApi.events]);
  const addedCalls = new Set();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+")) continue;
    const matches = line.matchAll(/(?:XrayNative|XrayCore)\??\.\s*([A-Za-z_$][\w$]*)/g);
    for (const m of matches) {
      const name = m[1];
      if (!known.has(name) && !["then", "catch", "addListener", "removeListener"].includes(name)) addedCalls.add(name);
    }
  }
  if (addedCalls.size) {
    reasons.push(`REVIEW: в JS появились вызовы неизвестных нативных методов [${[...addedCalls].join(", ")}] — их нет в установленных бинарниках (нужна нативная сборка или защитный фолбэк)`);
    return "REVIEW_REQUIRED";
  }
  return "OTA";
}

// ---------- lockfile без package.json ----------

function classifyLockOnly(files, root, rangeA, reasons) {
  const names = files.map((f) => f.path);
  if (names.includes("package-lock.json") && !names.includes("package.json")) {
    reasons.push("REVIEW: изменён только package-lock.json (без package.json) — возможна переустановка зависимостей, проверить руками");
    return "REVIEW_REQUIRED";
  }
  return "OTA";
}

// ---------- static analysis ----------

function runStatic(root, warnings) {
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit"], {
      cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    warnings.push(`STATIC FAIL: tsc --noEmit завершился с ошибками:\n${String(e.stdout || "").slice(0, 2000)}`);
    return false;
  }
  return true;
}

// ---------- main ----------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  const otaDir = path.join(root, "scripts", "ota");
  const registry = tryParseJson(fs.readFileSync(path.join(otaDir, "deps-registry.json"), "utf8")) || { packages: {} };
  const nativeApi = tryParseJson(fs.readFileSync(path.join(otaDir, "native-api.json"), "utf8")) || { functions: [], asyncFunctions: [], events: [] };

  let rangeA, rangeB;
  if (args.commit) { rangeA = `${args.commit}~1`; rangeB = args.commit; }
  else if (args.range) { [rangeA, rangeB] = args.range.split(".."); }
  else { rangeA = "HEAD~1"; rangeB = "HEAD"; }

  const statusRaw = git(root, "diff", "--name-status", `${rangeA}..${rangeB}`);
  const files = statusRaw.trim().split("\n").filter(Boolean).map((l) => {
    const [st, ...rest] = l.split("\t");
    return { status: st[0], path: st.startsWith("R") ? rest[1] : rest[0] };
  });

  const reasons = [];
  const warnings = [];
  const severities = [];

  severities.push(classifyFiles(files, reasons, warnings));
  severities.push(classifyAppJson(root, rangeA, rangeB, reasons));
  severities.push(classifyDeps(root, rangeA, rangeB, registry, reasons, warnings));
  severities.push(classifyNativeApi(root, rangeA, rangeB, nativeApi, reasons));
  severities.push(classifyLockOnly(files, root, rangeA, reasons));

  let verdict = severities.reduce((acc, v) => (SEVERITY[v] > SEVERITY[acc] ? v : acc), "OTA");

  if (args.static) {
    if (!runStatic(root, warnings)) {
      if (SEVERITY[verdict] < SEVERITY.REVIEW_REQUIRED) verdict = "REVIEW_REQUIRED";
      reasons.push("REVIEW: статическая проверка типов не прошла");
    }
  }

  // 5. AI-стадия: может ТОЛЬКО ужесточить вердикт, никогда понизить
  let aiApplied = null;
  if (args.aiVerdict && SEVERITY[args.aiVerdict] > SEVERITY[verdict]) {
    aiApplied = { from: verdict, to: args.aiVerdict };
    reasons.push(`AI: вердикт ужесточён ${verdict} → ${args.aiVerdict}`);
    verdict = args.aiVerdict;
  } else if (args.aiVerdict && args.aiVerdict !== verdict) {
    aiApplied = { from: verdict, to: verdict, requested: args.aiVerdict, ignored: "AI не может понизить вердикт правил" };
    warnings.push(`AI предложил "${args.aiVerdict}", но правила дают "${verdict}" — не понижается`);
  }

  if (files.length === 0) warnings.push("Дифф пуст");

  const out = {
    verdict,
    range: `${rangeA}..${rangeB}`,
    files: files.map((f) => `${f.status} ${f.path}`),
    reasons,
    warnings,
    aiApplied,
  };
  console.log(JSON.stringify(out, null, 2));
  if (!args.quiet) {
    console.error(`\nВЕРДИКТ: ${verdict}  (файлов: ${files.length})`);
    for (const r of reasons) console.error(`  • ${r}`);
  }
  process.exit(EXIT[verdict]);
}

main();
