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
curl -L -o android/xraylibs/libXray.aar \
  "https://github.com/XTLS/libXray/releases/download/v26.7.28/libxray-android.zip"
# затем распаковать zip и взять libXray-android/libXray.aar
```

### Подпись

Ключ лежит в `credentials/ghostcloud-release.keystore`, параметры в `credentials/keystore.properties`
(в git не входят). `storeFile` в properties указывается относительно `android/app/`.

## Обновления по воздуху

EAS Update привязан к проекту `@ghost552/ghostcloud`:
`npx eas-cli update --branch production` — только для JS-изменений.
