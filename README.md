# Veloxion Mobile

Capacitor-оболочка личного кабинета Veloxion AI для Android и iOS.

- URL: `https://veloxion.io/lk`
- Package ID: `io.veloxion.app`
- Название: `Veloxion AI`
- Android: min API 24, target API 36

## Подготовка

```powershell
npm install
npx cap sync
```

Приложение использует live URL:

- `https://veloxion.io/lk`

Backend API внутри webview:

- `https://api.veloxion.io/api`

## Что нужно для работы приложения

### Обязательно

- backend `api.veloxion.io` должен быть доступен
- у backend должны быть настроены MySQL, Redis и worker
- пользователь должен входить через обычный frontend auth flow
- после логина JWT сохраняется в `localStorage`, и приложение использует его для API

### Для push-уведомлений

1. В `capacitor/package.json` уже подключен `@capacitor/push-notifications`
2. В iOS `AppDelegate.swift` уже добавлены callback-методы регистрации APNs
3. После изменения плагинов всегда выполняй:

```powershell
npx cap sync
```

## Настройка backend для push

Backend должен иметь:

### Android / FCM

```env
FCM_PROJECT_ID=your-firebase-project-id
FCM_SERVICE_ACCOUNT_JSON_PATH=./firebase-service-account.json
```

или:

```env
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}
```

### iOS / APNs

```env
APNS_P8_PATH=./AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=YYYYYYYYYY
APNS_BUNDLE_ID=io.veloxion.app
APNS_ENV=prod
```

Backend endpoint регистрации:

- `POST /api/push/register/native`

Он вызывается автоматически из frontend bootstrap, когда приложение открыто внутри native `Capacitor` и пользователь уже авторизован.

После регистрации токена backend может отправлять приложению push:

- о пополнении баланса после оплаты;
- о ручном пополнении баланса из админки;
- о сообщении техподдержки;
- о завершённой генерации;
- о новости;
- о ручной рассылке одному пользователю или всем сразу.

## Android push setup

Положи файл Firebase в:

```text
android\app\google-services.json
```

Дальше выполни:

```powershell
npx cap sync android
```

Потом открой Android Studio:

```powershell
npm run open:android
```

### Важно по Android

- без `google-services.json` FCM token не зарегистрируется
- Android 13+ потребует разрешение на уведомления, приложение запросит его само
- если нужен красивый push icon, добавь отдельную белую иконку в Android resources

## iOS push setup

Положи Firebase-конфиг iOS в корень `capacitor`:

```text
GoogleService-Info.plist
```

Дальше выполни:

```powershell
npm run sync:ios
```

Скрипт сам скопирует файл в `ios/App/App/GoogleService-Info.plist`, и Xcode target
подхватит его как resource.

Открой проект в Xcode и включи capability:

- `Push Notifications`

Проверь bundle id:

- `io.veloxion.app`

Если меняешь bundle id в приложении, обязательно синхронно обнови:

- `capacitor.config.ts`
- `APNS_BUNDLE_ID` на backend
- Apple App ID / provisioning profile

### Важно по iOS

- без `GoogleService-Info.plist` Firebase iOS SDK и FCM не инициализируются
- без включенной capability APNS token не придёт
- сборка и подпись iOS делаются только на macOS
- для production нужен рабочий `.p8` ключ из Apple Developer

Локальная Android-сборка использует:

```text
JDK:          C:\Program Files\Java\jdk-22
Android SDK:  E:\non\android-sdk\Sdk
Gradle cache: E:\ford\.gradle-veloxion
Build output: E:\ford\veloxion-capacitor-build
```

Кэш и результаты вынесены на диск `E:`, чтобы не занимать системный диск.

## Android release

Основная команда собирает, выравнивает, подписывает и проверяет APK:

```powershell
npm run build:android
```

Эквивалентная команда:

```powershell
npm run build:android:release
```

Готовый устанавливаемый APK:

```text
E:\ford\veloxion-capacitor-build\app\outputs\apk\release\veloxion-release-installable.apk
```

После подписи промежуточные `app-release-unsigned.apk` и
`app-release-aligned.apk` удаляются. В release-каталоге остаётся подписанный APK.

Дополнительные команды:

```powershell
npm run build:android:debug
npm run build:android:unsigned
npm run sign:android:release
npm run open:android
```

Release подписывается keystore из
`%USERPROFILE%\.android\debug.keystore`. Для обновления установленного
приложения необходимо использовать тот же keystore.

## Логотип и splash

Единый источник ресурсов:

```text
assets\logo.png
```

Исходный логотип проекта:

```text
..\frontend\public\branding\veloxion-logo.png
```

После его изменения:

```powershell
Copy-Item ..\frontend\public\branding\veloxion-logo.png assets\logo.png -Force
npm run assets
npm run build:android
```

`npm run assets` создаёт обычные и adaptive Android icons, Android/iOS
splash, iOS AppIcon и PWA icons. Фон ресурсов: `#edf5f9`.

## Клавиатура Android

Activity использует `android:windowSoftInputMode="adjustResize"`.
`Keyboard.resizeOnFullScreen` отключён, поскольку status bar не накладывается
на WebView. Это предотвращает двойное изменение высоты и пустое пространство
над страницей при открытии клавиатуры.

## Синхронизация

После изменения `capacitor.config.ts`, плагинов или `www`:

```powershell
npm run sync
```

Для отдельных платформ:

```powershell
npm run sync:android
npm run sync:ios
```

Android build-скрипт автоматически выполняет `cap sync android`.

## iOS

iOS-проект можно подготовить на Windows, но собрать и подписать приложение
можно только на macOS с Xcode:

```powershell
npm run open:ios
```

## Как проверить, что push подключился

1. Войти в приложение под пользователем.
2. Разрешить уведомления.
3. Убедиться, что backend доступен.
4. Проверить в backend таблицу `push_tokens`.
5. Для конкретного пользователя можно запросить:

```text
GET /api/push/tokens/:id_user
```

Ожидаемо должен появиться токен с платформой:

- `fcm` для Android
- `apns` для iOS

Дополнительно для полной проверки:

6. Отправить тестовый push из `/admin/push`.
7. Проверить, что в backend появилась запись в `push_dispatches`.
8. При необходимости открыть историю через:

```text
GET /api/admin/push/history
```

## Проверка APK

```powershell
E:\non\android-sdk\Sdk\build-tools\36.0.0\apksigner.bat verify --verbose `
  E:\ford\veloxion-capacitor-build\app\outputs\apk\release\veloxion-release-installable.apk
```

Ожидаемый результат: APK Signature Scheme v2/v3 подтверждена.

Если Android сообщает, что пакет недействителен или приложение не обновляется,
удалите старую сборку с другой подписью и установите актуальный подписанный APK.
