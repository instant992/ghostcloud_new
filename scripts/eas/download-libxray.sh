#!/usr/bin/env bash
# Хук для EAS Build (eas-build-pre-install): скачивает нативное ядро
# libXray.aar, которого нет в репозитории (см. README «libXray»).
# Если файл уже есть (локальная сборка / кэш) — пропускает.
set -euo pipefail

AAR_DIR="android/xraylibs"
AAR_PATH="$AAR_DIR/libXray.aar"

if [ -f "$AAR_PATH" ]; then
  echo "libXray.aar уже на месте ($(du -h "$AAR_PATH" | cut -f1))"
  exit 0
fi

URL="https://github.com/XTLS/libXray/releases/download/v26.9.9/libxray-android.zip"
TMP="$(mktemp -d)"
echo "Скачиваю $URL ..."
curl -fL --retry 3 -o "$TMP/libxray-android.zip" "$URL"
echo "Распаковываю..."
unzip -q "$TMP/libxray-android.zip" -d "$TMP/extracted"
SRC="$(find "$TMP/extracted" -name 'libXray.aar' | head -1)"
if [ -z "$SRC" ]; then
  echo "ОШИБКА: в архиве не найден libXray.aar" >&2
  exit 1
fi
mkdir -p "$AAR_DIR"
cp "$SRC" "$AAR_PATH"
rm -rf "$TMP"
echo "Готово: $AAR_PATH ($(du -h "$AAR_PATH" | cut -f1))"
