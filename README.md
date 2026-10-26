# Veloxion Mobile

Capacitor-оболочка личного кабинета Veloxion AI для Android и iOS.

- URL: `https://veloxion.io/lk`
- Package ID: `io.veloxion.app`
- Название: `Veloxion AI`
- Android: min API 24, target API 36

## Статус На 26.10.2026

- Общие исходники используют Capacitor `8.4.2`; RUS остаётся регионом по умолчанию.
- EURO iOS `1.0 (202610260755)` и RUS `1.0 (202610260758)` обработаны Apple и доступны существующим внутренним группам TestFlight (`VALID`, `IN_BETA_TESTING`). На App Review не отправлялись.
- EURO: отдельная карточка App Store `6826526999` и закрытая группа `Veloxion EURO Internal` с четырьмя внутренними тестировщиками. RUS App Store ID: `6797630481`.
- За цифровые AI-кредиты в iOS реализован StoreKit In-App Purchase, не Apple Pay/Stripe. Настройка товаров и реальные Sandbox-тесты обязательны до включения.
- RUS Android `1.0.8`, versionCode `11`: `build-local/rus/Veloxion-RUS-1.0.8-11.apk`; EURO Android `1.0.7`, versionCode `8`: `build-local/euro/Veloxion-EURO-1.0.7-8.apk`. Подписи прежние, APK хранятся локально, не в Git.
- Вход и регистрация на обеих платформах нативные, с локальным логотипом, Manrope, светлыми карточками и градиентными кнопками в стиле ЛК. RUS использует маску сайта `+7 (999) 123-45-67`, нормализует начальную `8` и отправляет в API только полный номер. EURO использует email.
- На нативных экранах добавлены Google для EURO, Яндекс ID и VK ID для RUS: iOS использует `ASWebAuthenticationSession`, Android использует системный браузер `Custom Tabs`, не WebView. Сервер использует прежние ключи из админки; секреты не попадают в приложение. Новая регистрация через провайдера требует принятия условий. Подробности: [native-auth.md](docs/native-auth.md).
- Новые сборки поддерживают предварительную проверку JavaScript в том же браузере, где открывается провайдер: при отключении возвращаются в нативный попап с инструкцией, настройками и повтором. Прямой публичной ссылки на переключатель JavaScript в Safari нет: кнопка открывает настройки приложения, а попап объясняет путь к Safari. API-проверка подготовлена отдельно, но пока не активирована на сервере; со старым API сохраняется обычный вход без этой проверки. ИИ-чат не изменён.
- EURO: нативный выбор EN/DE/IT/ES/FR/PL/ZH без русского, полные переводы офлайн, сохранение языка после перезапуска и синхронизация с ЛК. Переключение не очищает поля; в хедере `EU /` вместо `EUROPE /`.
- Исправлено восстановление нативной сессии: проверка и обновление токена перед передачей в ЛК, ограниченное ожидание bridge, защита от позднего ответа предыдущего аккаунта. Возврат ко входу не запускает восстановление по кругу. Во время открытия ЛК отображается нативный экран, при сбое доступны повтор и возврат без удаления сохранённой сессии. Frontend RUS/EURO обновлены с копиями в `/home/vel/backups/native-session-20261026/`; backend, БД и ИИ-чат не менялись. Для нативных исправлений нужна новая версия приложения.
- Для исправления сессии прошли 58 тестов приложения, 28 frontend-тестов, TypeScript и обе серверные Next.js-сборки, Swift-тесты восстановления/обновления токена и 12 браузерных сценариев с подменёнными API. Android APK собираются и подписываются, но новые инструментационные тесты пока не запущены: локальный эмулятор отклоняет HAXM. Реальный вход через провайдеров, SMS/email и физический iPhone нужно проверить отдельно.
- Android EURO использует FCM HTTP v1 и Firebase-проект RUS с ограничением пакета `eu.veloxion.app`. Google принял проверочный запрос без отправки; доставку нужно проверить на телефоне после входа и выдачи разрешения.
- iOS push остаются на APNs; Android FCM не включает автоматически APNs или Apple-покупки. Публикация в Google Play и отправка на App Review не выполнялись.

Общий статус backend/frontend: [README проекта](../README.md).

## Отдельное приложение EURO

Конфигурация `euro`: `Veloxion AI Europe`, Bundle ID `eu.veloxion.app`,
сайт `https://veloxion.eu/lk`. По умолчанию по-прежнему собирается RUS.
Отдельные workflows `ios-euro-bootstrap` и `ios-euro-validation` не публикуют
приложение автоматически. Для загрузки IPA добавлены `ios-euro-testflight`
и `ios-rus-testflight`; модерация App Store отделена от загрузки.
Статус, ограничения оплаты/пушей и инструкция:
[docs/euro-ios-app.md](docs/euro-ios-app.md).

EURO Android: отдельный APK `eu.veloxion.app`, команды сборки, подпись и FCM:
[docs/euro-android-app.md](docs/euro-android-app.md).

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
- в новых сборках пользователь входит через нативный экран; старые сборки сохраняют web-вход
- нативная сессия хранится в Keychain / Android Keystore; frontend получает access token через защищённый bridge, refresh token остаётся на устройстве

### Для push-уведомлений

1. В `capacitor/package.json` уже подключен `@capacitor/push-notifications`
2. В iOS `AppDelegate.swift` уже добавлены callback-методы регистрации APNs
3. Текущая iOS-схема push в проекте использует `APNs` через backend, а не обязательный Firebase Messaging SDK
4. После изменения плагинов всегда выполняй:

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
- для EURO уже добавлена отдельная белая notification-иконка `ic_stat_veloxion`

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

В `codemagic.yaml` сохранён `ios-release` для RUS из ветки `main`.
Отдельные `ios-rus-testflight` и `ios-euro-testflight` собирают и загружают IPA
с региональным provisioning profile. Setup/validation workflows не являются
отправкой на модерацию. Проверки: `node --test test/*.test.mjs`.

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
JDK:          E:\SDK\jbr (21+, либо JAVA_HOME / -JavaHome)
Android SDK:  E:\non\android-sdk\Sdk
Gradle cache: .\.gradle-user
Build output: android\app\build\outputs\apk\
```

Сборка теперь идет локально внутри проекта, без внешних build-папок и без привязки
к `E:\ford`.

## Android Release RUS

Команды этого раздела используют регион RUS по умолчанию. Для EURO применяйте
отдельные команды и release-keystore из [инструкции EURO](docs/euro-android-app.md).

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

Текущий RUS helper подписывает release keystore из
`%USERPROFILE%\.android\debug.keystore`. Для обновления установленного
приложения необходимо использовать тот же keystore. Это не production-keystore
EURO: EURO использует отдельный закрытый release-ключ вне репозитория.

### Что нужно, чтобы Android собирался без танцев

1. Должен быть установлен `Node.js 22+`.
2. Должен быть установлен `JDK 21+`, например в:

```text
E:\SDK\jbr
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

- используется локальный Gradle cache: `.\.gradle-user`
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

- стоит `JDK 17` вместо требуемого `JDK 21+`
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
..\rus\frontend\public\branding\veloxion-logo.png
```

После его изменения:

```powershell
Copy-Item ..\rus\frontend\public\branding\veloxion-logo.png assets\logo.png -Force
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

## Проверка Push EURO

Войти в EURO-приложение, разрешить уведомления и проверить `/admin/push` под
своим администратором. Статус: `GET /api/admin/push/status`, тест только на
собственные устройства: `POST /api/admin/push/test`. Оба требуют авторизации
и прав администратора. EURO хранит устройства в `native_push_tokens` с provider
`fcm` или `apns`. Принятие сообщения провайдером не доказывает его показ.

## Проверка Push RUS

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

## Нативный Вход RUS / EURO

На iOS и Android первым открывается нативный экран входа/регистрации, доступный
без интернета. RUS: телефон и SMS-код, также вход по email для существующих
аккаунтов. EURO: email, пароль и подтверждение email при регистрации.
Создание аккаунта и проверка кода требуют сети; отложенных запросов нет.
Токены защищены Keychain / Android Keystore. После явного выхода сохранённая
сессия очищается и без сети. Сначала обновляется frontend обеих редакций,
затем распространяются новые сборки. Подробности: [native-auth.md](docs/native-auth.md).

## iOS In-App Purchase

Оплата цифровых AI-кредитов в iOS реализована через StoreKit 2, без Apple Pay/Stripe.
Пакеты соответствуют суммам зачисления на сайте; цену показывает App Store.
Настройка товаров, backend и проверки перед модерацией описаны в
[инструкции IAP](docs/apple-in-app-purchases.md).
Workflow `ios-iap-validation` создаёт тестовый IPA без публикации в App Store/TestFlight.

Если Android сообщает, что пакет недействителен или приложение не обновляется,
удалите старую сборку с другой подписью и установите актуальный подписанный APK.
