# GhostCloud (Android)

React Native / Expo VPN-клиент для панели vpnghost.space (Remnawave).

## Сборка

```bash
npm install
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
```

APK по архитектурам: `android/app/build/outputs/apk/release/`.

### libXray

Нативное ядро не хранится в репозитории. Перед сборкой скачай AAR:

```bash
curl -L -o /tmp/libxray-android.zip \
  "https://github.com/XTLS/libXray/releases/download/v26.9.9/libxray-android.zip"
# затем распаковать zip и взять libXray.aar в android/xraylibs/libXray.aar
```

Или запусти готовый хук: `bash scripts/eas/download-libxray.sh`.

Ядро — Xray-core **v26.9.9** (libXray apiVersion 3: `XrayApi.kt` читает версию
из `LibXray.LibXrayAPIVersion`, поэтому при следующей пересборке aar править
Kotlin не нужно).

### Подпись

Ключ лежит в `credentials/ghostcloud-release.keystore`, параметры в `credentials/keystore.properties`
(в git не входят). `storeFile` в properties указывается относительно `android/app/`.

## Обновления по воздуху

Проект привязан к `@ghost552/ghostcloud` (EAS). Полная документация по
автоматизации, классификатору и откатам: [`docs/EAS_AUTOMATION.md`](docs/EAS_AUTOMATION.md).

Кратко:
- `runtimeVersion` зафиксирован `1.0.0`; каналы: `development` / `preview` / `production`;
- `npm run ota:analyze` — классификатор изменения по последнему коммиту (OTA / NATIVE_BUILD / REVIEW_REQUIRED);
- `npm run ota:preview` — публикация в тестовый канал;
- `npm run ota:production` — только с двойным подтверждением (флаг + переменная окружения);
- `npm run ota:rollback` — откат на предыдущую рабочую версию.

Нативные изменения (всё в `android/`, `modules/*/android/`, права, зависимости с
нативным кодом) требуют новой сборки: `npm run build:eas:android`.
