#!/usr/bin/env node
/**
 * Тесты OTA-классификатора на реальных git-диффах во временных репозиториях.
 * Сценарии:
 *   1. OTA              — только JS/TS изменения
 *   2. NATIVE_BUILD     — Kotlin/манифест/ресурсы/права/смена рантайма/нативные зависимости
 *   3. REVIEW_REQUIRED  — неизвестные файлы/пакеты/новые нативные вызовы
 *   + проверка, что AI-вердикт может только ужесточать, но не понижать.
 * Запуск: node scripts/ota/__tests__/run-tests.mjs
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OTA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLASSIFY = path.join(OTA_DIR, "classify.mjs");
const GIT_ARGS = ["-c", "user.email=test@test.local", "-c", "user.name=test"];

let passed = 0, failed = 0;
const failures = [];

function git(repo, ...args) {
  return execFileSync("git", [...GIT_ARGS, "-C", repo, ...args], { encoding: "utf8" });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ota-classify-"));
  execFileSync("git", [...GIT_ARGS, "init", "-b", "main"], { cwd: dir, encoding: "utf8", stdio: "ignore" });
  return dir;
}

function writeFile(repo, rel, content) {
  const p = path.join(repo, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const BASE_APP_JSON = JSON.stringify({
  expo: { name: "T", version: "1.1.5", runtimeVersion: "1.0.0", updates: { url: "https://u.expo.dev/x" } },
}, null, 2);

const BASE_PKG_JSON = JSON.stringify({
  name: "t", version: "1.1.5",
  dependencies: { "react-native": "0.86.2", "react": "19.2.3", "@react-navigation/native": "^7.3.17" },
}, null, 2);

function setupBase(repo, extraFiles = {}) {
  writeFile(repo, "app.json", BASE_APP_JSON);
  writeFile(repo, "package.json", BASE_PKG_JSON);
  writeFile(repo, "src/screens/HomeScreen.tsx", "export default function HomeScreen(){return null}\n");
  writeFile(repo, "src/api.ts", "export const BASE_URL='https://example.com'\n");
  writeFile(repo, "src/vpn/native.ts", "export const x = 1;\n");
  writeFile(repo, "android/app/src/main/java/t/Main.kt", "class Main\n");
  writeFile(repo, "android/app/src/main/res/values/strings.xml", "<resources/>\n");
  for (const [rel, content] of Object.entries(extraFiles)) writeFile(repo, rel, content);
  // реестры — копия реальных
  fs.mkdirSync(path.join(repo, "scripts", "ota"), { recursive: true });
  fs.copyFileSync(path.join(OTA_DIR, "deps-registry.json"), path.join(repo, "scripts", "ota", "deps-registry.json"));
  fs.copyFileSync(path.join(OTA_DIR, "native-api.json"), path.join(repo, "scripts", "ota", "native-api.json"));
  execFileSync("git", [...GIT_ARGS, "-C", repo, "add", "-A"], { stdio: "ignore" });
  git(repo, "commit", "-m", "base");
  return git(repo, "rev-parse", "HEAD").trim();
}

function commitChange(repo, files, msg = "change") {
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) { fs.rmSync(path.join(repo, rel), { recursive: true, force: true }); }
    else writeFile(repo, rel, content);
  }
  execFileSync("git", [...GIT_ARGS, "-C", repo, "add", "-A"], { stdio: "ignore" });
  git(repo, "commit", "-m", msg);
  return git(repo, "rev-parse", "HEAD").trim();
}

function classify(repo, range, extraArgs = []) {
  try {
    const out = execFileSync(process.execPath, [CLASSIFY, "--root", repo, "--range", range, "--quiet", ...extraArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, json: JSON.parse(out) };
  } catch (e) {
    if (e.status === 10 || e.status === 20) {
      const raw = String(e.stdout || "");
      let json = null;
      try { json = JSON.parse(raw); } catch {}
      return { code: e.status, json };
    }
    throw e;
  }
}

const CODE = { OTA: 0, NATIVE_BUILD: 10, REVIEW_REQUIRED: 20 };

function check(name, expected, actual, json) {
  const ok = actual === CODE[expected];
  if (ok) { passed++; console.log(`  ✔ ${name} → ${expected}`); }
  else {
    failed++;
    const got = Object.keys(CODE).find((k) => CODE[k] === actual) ?? `code ${actual}`;
    failures.push({ name, expected, got, json });
    console.log(`  ✘ ${name} → ждали ${expected}, получили ${got}`);
    if (json) for (const r of json.reasons || []) console.log(`      причина: ${r}`);
  }
}

console.log("Тесты классификатора OTA/NATIVE_BUILD/REVIEW_REQUIRED\n");

// ---------- 1. OTA ----------
console.log("Сценарий 1: OTA (чистый JS)");
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "src/screens/HomeScreen.tsx": "export default function HomeScreen(){return 'v2'}\n",
    "src/api.ts": "export const BASE_URL='https://example.com/v2'\n",
    "src/components/NewCard.tsx": "export function Card(){return null}\n",
    "App.tsx": "export default function App(){return null}\n",
    "docs/NOTES.md": "заметки\n",
    "scripts/ota/history.json": "[]\n",
  });
  const res = classify(r, `${a}..${b}`);
  check("только JS/новые экраны/доки", "OTA", res.code, res.json);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "package.json": JSON.stringify({
      name: "t", version: "1.1.5",
      dependencies: { "react-native": "0.86.2", "react": "19.2.3", "@react-navigation/native": "^7.3.17", "react-native-qrcode-svg": "^6.3.21" },
    }, null, 2),
  });
  const res = classify(r, `${a}..${b}`);
  check("добавлен pure-js пакет из реестра", "OTA", res.code, res.json);
}

// ---------- 2. NATIVE_BUILD ----------
console.log("\nСценарий 2: NATIVE_BUILD");
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "android/app/src/main/java/t/Main.kt": "class Main2\n" });
  check("изменён Kotlin-код", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "android/app/src/main/res/drawable/pic.png": "binary" });
  check("новый нативный ресурс", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "app.json": JSON.stringify({ expo: { name: "T", version: "1.1.5", runtimeVersion: "1.0.1", updates: { url: "https://u.expo.dev/x" } } }, null, 2),
  });
  check("сменён runtimeVersion", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "app.json": JSON.stringify({ expo: { name: "T", version: "1.1.5", runtimeVersion: "1.0.0", updates: { url: "https://u.expo.dev/x" }, android: { permissions: ["android.permission.CAMERA"] } } }, null, 2),
  });
  check("добавлены permissions", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "package.json": JSON.stringify({
      name: "t", version: "1.1.5",
      dependencies: { "react-native": "0.86.2", "react": "19.2.3", "@react-navigation/native": "^7.3.17", "expo-camera": "~57.0.4" },
    }, null, 2),
  });
  check("добавлен нативный пакет", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "package.json": JSON.stringify({
      name: "t", version: "1.1.5",
      dependencies: { "react-native": "0.87.0", "react": "19.2.3", "@react-navigation/native": "^7.3.17" },
    }, null, 2),
  });
  check("смена версии react-native", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "modules/xray-core/android/src/main/java/expo/modules/xraycore/New.kt": "class New\n" });
  check("изменена нативная часть локального модуля", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "libs/libfoo.so": "binary" });
  check("добавлен .so", "NATIVE_BUILD", classify(r, `${a}..${b}`).code);
}

// ---------- 3. REVIEW_REQUIRED ----------
console.log("\nСценарий 3: REVIEW_REQUIRED");
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "weird-plugin.config.js": "module.exports={}\n" });
  check("неизвестный файл без правила", "REVIEW_REQUIRED", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "package.json": JSON.stringify({
      name: "t", version: "1.1.5",
      dependencies: { "react-native": "0.86.2", "react": "19.2.3", "@react-navigation/native": "^7.3.17", "some-new-lib": "^1.0.0" },
    }, null, 2),
  });
  check("новый пакет не в реестре", "REVIEW_REQUIRED", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, {
    "src/vpn/native.ts": "export const x = 1;\nexport function f(n:any){ return n?.XrayNative?.totallyNewMethod?.(); }\n",
  });
  check("вызов неизвестного нативного метода", "REVIEW_REQUIRED", classify(r, `${a}..${b}`).code);
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "eas.json": "{\"build\":{}}\n" });
  check("изменён eas.json", "REVIEW_REQUIRED", classify(r, `${a}..${b}`).code);
}

// ---------- 4. AI: только ужесточение ----------
console.log("\nСценарий 4: AI не может понизить вердикт");
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "android/app/src/main/java/t/Main.kt": "class MainX\n" });
  const res = classify(r, `${a}..${b}`, ["--ai-verdict", "OTA"]);
  check("AI просит OTA для нативного диффа — отклонено", "NATIVE_BUILD", res.code, res.json);
  if (res.json?.aiApplied?.ignored) { passed++; console.log("  ✔ AI-вердикт проигнорирован с пометкой"); }
  else { failed++; failures.push({ name: "aiApplied.ignored", got: JSON.stringify(res.json?.aiApplied) }); console.log("  ✘ нет пометки об игнорировании"); }
}
{
  const r = makeRepo();
  const a = setupBase(r);
  const b = commitChange(r, { "src/screens/HomeScreen.tsx": "export default function HomeScreen(){return 'v3'}\n" });
  const res = classify(r, `${a}..${b}`, ["--ai-verdict", "REVIEW_REQUIRED"]);
  check("AI ужесточает OTA → REVIEW_REQUIRED", "REVIEW_REQUIRED", res.code, res.json);
}

// ---------- итог ----------
console.log(`\nИтог: ${passed} прошло, ${failed} упало`);
if (failed) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("Все сценарии классификатора подтверждены.");
