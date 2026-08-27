# Сборка отдельных APK под каждую архитектуру (armeabi-v7a, arm64-v8a, x86, x86_64).
# Результат складывается в apks\GhostCloud-<версия>-<abi>.apk
# Требования: JAVA_HOME (JDK 17+), Android SDK (путь в android\local.properties), Node.js.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js не найден в PATH — установите его и повторите"
}
if (-not $env:JAVA_HOME -and -not (Get-Command java -ErrorAction SilentlyContinue)) {
  Write-Error "JAVA_HOME не задан и java не найдена в PATH — установите JDK 17"
}

Write-Host "==> gradlew assembleRelease (ABI splits: armeabi-v7a, arm64-v8a, x86, x86_64)"
& "$PSScriptRoot\android\gradlew.bat" -p "$PSScriptRoot\android" assembleRelease
if ($LASTEXITCODE -ne 0) { throw "Сборка завершилась с ошибкой" }

$version = (Select-String -Path "$PSScriptRoot\android\app\build.gradle" -Pattern 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value
$outDir = Join-Path $PSScriptRoot "apks"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$apkDir = "$PSScriptRoot\android\app\build\outputs\apk\release"
Get-ChildItem $apkDir -Filter *.apk | ForEach-Object {
  if ($_.Name -match "^app-(.+)-release\.apk$") {
    $abi = $Matches[1]
    $dst = Join-Path $outDir "GhostCloud-$version-$abi.apk"
    Copy-Item $_.FullName $dst -Force
    Write-Host "OK: apks\GhostCloud-$version-$abi.apk"
  }
}
Write-Host "Готово — $($version)"
