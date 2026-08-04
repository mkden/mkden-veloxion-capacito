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
3. Текущая iOS-схема push в проекте использует `APNs` через backend, а не обязательный Firebase Messaging SDK
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

Если нужен именно Firebase SDK / FCM на iOS, положи конфиг в корень `capacitor`:

```text
GoogleService-Info.plist
```

Дальше выполни:

```powershell
npm run sync:ios
```

Скрипт сам скопирует файл в `ios/App/App/GoogleService-Info.plist`, и Xcode target
подхватит его как resource.

Если Firebase на iOS не используется, а push идут через APNs от backend, файл
`GoogleService-Info.plist` для рабочего iOS push не обязателен. В Codemagic для
CI-сборки добавлен fallback-пустой plist, чтобы Xcode не падал на missing input file.

Открой проект в Xcode и включи capability:

- `Push Notifications`

Проверь bundle id:

- `io.veloxion.app`

Если меняешь bundle id в приложении, обязательно синхронно обнови:

- `capacitor.config.ts`
- `APNS_BUNDLE_ID` на backend
- Apple App ID / provisioning profile

### Важно по iOS

- без `GoogleService-Info.plist` не инициализируются только Firebase iOS SDK / FCM
- без включенной capability APNS token не придёт
- сборка и подпись iOS делаются только на macOS
- для production нужен рабочий `.p8` ключ из Apple Developer
- факт успешной IPA-сборки сам по себе не гарантирует рабочий push; нужен тест на реальном iPhone

## Codemagic iOS build

Сейчас `codemagic.yaml` настроен на сборку `ios-release` из ветки `main`.

Что уже учтено:

- используется `xcode-project build-ipa`
- signing берётся из `Codemagic managed signing`
- `npx cap sync ios` вызывается напрямую, без Windows PowerShell
- при отсутствии `GOOGLE_SERVICE_INFO_PLIST` CI не падает
- если Xcode target ждёт `GoogleService-Info.plist`, workflow создаёт fallback-пустышку

Что должно быть настроено в Codemagic:

- iOS certificate / provisioning profile для `io.veloxion.app`
- App Store Connect API key для signing
- при необходимости env group `firebase_credentials`

Если build падает уже после `Apply iOS code signing`, значит нужно смотреть конкретный
Xcode log, а не только статус signing.

Локальная Android-сборка использует:

```text
JDK:          C:\Program Files\Java\jdk-22
Android SDK:  E:\non\android-sdk\Sdk
Gradle cache: .\gradle-user
Build output: android\app\build\outputs\apk\
```

Сборка теперь идет локально внутри проекта, без внешних build-папок и без привязки
к `E:\ford`.

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
android\app\build\outputs\apk\release\veloxion-release-installable.apk
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

Если нужна только чистая сборка unsigned APK без подписи:

```powershell
npm run build:android:unsigned
```

Release подписывается keystore из
`%USERPROFILE%\.android\debug.keystore`. Для обновления установленного
приложения необходимо использовать тот же keystore.

### Что нужно, чтобы Android собирался без танцев

1. Должен быть установлен `Node.js 22+`.
2. Должен быть установлен `JDK 22` в:

```text
C:\Program Files\Java\jdk-22
```

3. Должен быть доступен Android SDK в:

```text
E:\non\android-sdk\Sdk
```

4. В проекте должны быть установлены зависимости:

```powershell
npm install
```

5. После изменения плагинов или нативных файлов запускается:

```powershell
npm run sync:android
```

Но обычная release-сборка сама делает `cap sync android`, поэтому в штатном
сценарии достаточно одной команды:

```powershell
npm run build:android:release
```

### Как устроена текущая Android-сборка

- используется локальный Gradle cache: `.\gradle-user`
- Gradle запускается прямо из `android\gradlew.bat`
- release APK собирается в стандартную папку Android Gradle
- затем скрипт автоматически:
  - находит свежий `*-unsigned.apk`
  - делает `zipalign`
  - подписывает APK через `apksigner`
  - проверяет подпись

Отдельный helper-скрипт:

```text
tools\run-gradle-on-e.js
```

делает тот же подход, что и в соседнем проекте `non`: локальный `GRADLE_USER_HOME`
внутри проекта и запуск Gradle без внешних временных build-каталогов.

### Где лежит итоговый файл

После успешной сборки:

```text
android\app\build\outputs\apk\release\veloxion-release-installable.apk
```

Именно этот файл нужно:

- ставить на Android-устройство
- загружать на сайт для скачивания
- отдавать тестировщикам

### Частые причины, если сборка не идет

- стоит `JDK 17`, а не `JDK 22`
- не найден `Android SDK` по пути `E:\non\android-sdk\Sdk`
- не выполнен `npm install`
- менялись плагины, но не был сделан `cap sync`
- у установленной на устройстве старой версии другой keystore

Если приложение не обновляется поверх старой сборки, обычно проблема в подписи:
нужно ставить APK, подписанный тем же keystore.

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

Важно:

- успешная сборка IPA не означает, что iOS push уже точно работает
- для финальной проверки нужен реальный iPhone, разрешение на уведомления и тестовая отправка с backend

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
  android\app\build\outputs\apk\release\veloxion-release-installable.apk
```

Ожидаемый результат: APK Signature Scheme v2/v3 подтверждена.

Если Android сообщает, что пакет недействителен или приложение не обновляется,
удалите старую сборку с другой подписью и установите актуальный подписанный APK.
