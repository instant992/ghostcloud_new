# Project Rules

## Git workflow
- После каждого завершённого блока изменений — коммит и пуш в ветку **`release`** (НЕ в `main`).
- Репозиторий: `https://github.com/instant992/ghostcloud_new.git`
- Автор коммитов: `GhostCloud <ghostcloud@example.local>`
- Сообщения коммитов — краткие, но перечислять затронутые фичи/фиксы.
- Не спрашивать разрешения на пуш — пушить сразу по завершении работы.

## Исключено из git (.gitignore)
- `node_modules/`, `android/build/`, `android/app/build/`, `apks/`, `credentials/`, `*.keystore`, `core-src/`

## Сборка
- Отдельные APK под архитектуры: `.\build_apks.ps1` (или `build_now.bat` в фоне).
- Инструменты на машине: `C:\Tools\node` (Node 22), `C:\Tools\jdk17` (JDK 17), `C:\Android\Sdk` (SDK 36 + NDK 27.1), `C:\Tools\git` (git 2.55).
- Проверка типов: `node node_modules\typescript\bin\tsc --noEmit`.
