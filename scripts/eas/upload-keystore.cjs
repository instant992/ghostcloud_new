/**
 * Одноразовый скрипт: загружает локальный keystore (credentials.json) на серверы EAS
 * без интерактивного меню. Запускается от залогиненного пользователя (сессия ~/.expo).
 * Использование: node scripts/eas/upload-keystore.cjs
 */
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..");
process.chdir(ROOT);

(async () => {
  const { readAndroidCredentialsAsync } = require("eas-cli/build/credentials/credentialsJson/read");
  const { getKeystoreWithType, validateKeystore } = require("eas-cli/build/credentials/android/utils/keystoreNew");
  const { createGraphqlClient } = require("eas-cli/build/commandUtils/context/contextUtils/createGraphqlClient");
  const SessionManager = require("eas-cli/build/user/SessionManager").default;
  const { AppQuery } = require("eas-cli/build/graphql/queries/AppQuery");
  const { UserQuery } = require("eas-cli/build/graphql/queries/UserQuery");
  const androidApi = require("eas-cli/build/credentials/android/api/GraphqlClient");

  const projectId = "610ee1ee-ed79-4bbc-93f4-f14e3e05c3e3";
  const projectName = "ghostcloud";
  const applicationId = "space.ghostcloud.app";

  // 1. Авторизация из сохранённой сессии
  const analyticsStub = { setActor() {}, addEvent() {} };
  const sm = new SessionManager(analyticsStub);
  const sessionSecret = sm.getSessionSecret();
  if (!sessionSecret) throw new Error("Нет сессии — выполните сначала `eas login`");
  const graphqlClient = createGraphqlClient({ accessToken: null, sessionSecret });
  const actor = await UserQuery.currentUserAsync(graphqlClient);
  console.log("Пользователь:", actor?.username || actor?.name || "?");

  // 2. Читаем локальные ключи
  const local = await readAndroidCredentialsAsync(ROOT);
  const keystore = getKeystoreWithType(local.keystore);
  console.log("Тип keystore:", keystore.type);
  validateKeystore(keystore);
  console.log("Keystore прошёл локальную валидацию");

  // 3. Определяем аккаунт-владельца проекта
  const app = await AppQuery.byIdAsync(graphqlClient, projectId);
  const account = app.ownerAccount;
  console.log("Аккаунт-владелец:", account.name);

  const appLookupParams = { account, projectName, androidApplicationIdentifier: applicationId };

  // 4. Создаём запись ключа на сервере
  const keystoreFragment = await androidApi.createKeystoreAsync(graphqlClient, account, keystore);
  console.log("Keystore загружен, id:", keystoreFragment.id);

  // 5. Привязываем к конфигурации сборки (создаём/обновляем)
  const name = "default";
  const buildCredentials = await androidApi.createOrUpdateAndroidAppBuildCredentialsByNameAsync(
    graphqlClient,
    appLookupParams,
    name,
    { androidKeystoreId: keystoreFragment.id }
  );
  console.log("Build credentials:", buildCredentials.name, "| isDefault:", buildCredentials.isDefault);
  if (!buildCredentials.isDefault) {
    await androidApi.setDefaultAndroidAppBuildCredentialsAsync(graphqlClient, buildCredentials);
    console.log("Назначен как дефолтный");
  }
  console.log("ГОТОВО: ключи подписи загружены на EAS для", applicationId);
})().catch((e) => {
  console.error("ОШИБКА:", e?.message || e);
  process.exit(1);
});
