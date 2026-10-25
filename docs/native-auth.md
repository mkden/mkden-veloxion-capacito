# Native Authentication (RUS / EURO)

## VK and EURO Languages: 25 October 2026

- Source: `0a213e3` on `feature/ios-euro-app`.
- EURO: seven offline languages matching the workspace, no Russian, persistent
  preference synchronized in both directions; `EU /` in the native header.
- RUS: VK ID alongside Yandex ID, phone/SMS and existing email sign-in.
  VK ID uses provider PKCE and the registered `https://veloxion.io/auth` callback.
  Next.js `proxy.ts` forwards only native states before React rendering with
  HTTP 307, `no-store` and `no-referrer`; ordinary web sign-in is unchanged.
- Signed APKs: EURO `build-local/euro/Veloxion-EURO-1.0.4-5.apk`,
  RUS `build-local/rus/Veloxion-RUS-1.0.5-8.apk`. Both installed successfully in
  an isolated emulator; signatures match their previous certificates.
- EURO TestFlight `202610251713`: `VALID`, `IN_BETA_TESTING`, linked to the
  existing internal group. RUS `202610251717`: upload confirmed by Codemagic;
  Apple build upload `fb55c952-ca18-478c-8765-a2b422fd5c8c` is `PROCESSING`,
  with no reported errors or warnings. No App Review or external invitations.
- RUS backend and both frontends deployed from separately verified builds.
  Backups: `/home/vel/backups/native-vk-locale-20261025/`, including final RUS
  frontend `rus-site-172841`. Keys, database data, balances and workers unchanged.
- Verified: 57 app tests, 9 RUS broker tests, frontend tests and TypeScript,
  Java/Swift proof and locale tests, signed iOS builds, live Google/Yandex/VK
  cancellation/replay checks, VK provider binding, web compatibility, Android
  language selection/input preservation, offline restart and VK offline error.
  Real provider account sign-in and physical iPhone testing remain manual.

```text
node scripts/verify-native-vk-live.mjs
RUS frontend: node --test test/native-auth.test.cjs test/native-vk-callback.test.cjs
```

## Verified Provider Release: 25 October 2026

- Native provider implementation: `e8e356c`; Android reuses Browser `1.9.0`
  from the existing Capacitor dependency graph (`f086530`).
- RUS: Yandex ID, APK `build-local/rus/Veloxion-RUS-1.0.4-7.apk`,
  TestFlight `202610251627`.
- EURO: Google, APK `build-local/euro/Veloxion-EURO-1.0.3-4.apk`,
  TestFlight `202610251623`.
- Apple reports both builds `VALID` / `IN_BETA_TESTING`; the existing internal
  groups contain them. APK signatures match the previous regional certificates.
  No roles, external testers or App Review submissions were changed.
- Buttons are native UIKit / Android controls. Provider authentication uses
  `ASWebAuthenticationSession` (iOS) and browser Custom Tabs (Android), not the
  application WebView. This is system OAuth, not the Google/Yandex native SDK
  account picker. Existing web client IDs, secrets and HTTPS callbacks are
  reused from admin/database settings. No client secrets are bundled.
- New endpoints: `POST /api/auth/native/start` and
  `POST /api/auth/native/exchange`. Providers are region-restricted. Redis
  states expire in 600 seconds and are consumed atomically. The server returns
  a 90-second single-use ticket to `<regional-bundle>://oauth/callback`.
  Tokens are returned only by the PKCE-protected HTTPS exchange, never in URLs.
- Native callbacks validate scheme/host/path, state and duplicate parameters.
  Revision guards protect logout; sessions still use Keychain / Android Keystore.
  A cold callback without its in-memory proof cannot sign in. Registration
  requires explicit consent; unknown logins cannot silently create accounts.
- Backend source and compiled-auth backups:
  `/home/vel/backups/native-oauth-20261025/euro-162740` and
  `/home/vel/backups/native-oauth-20261025/rus-162816`.
  Only API processes were restarted. Workers, DB data, prices, keys and CHINA
  were not changed; no SQL migration is needed.
- Verification: 55 app tests, 6 backend tests per region, Java/Swift proof and
  callback tests, signed Mac builds, matching APK signing identities, Android
  provider buttons/offline errors, rejected unsolicited callbacks and live
  server cancel/replay/consent checks. Real provider accounts and physical
  iPhones were not used. Real sign-in/registration still need device testing.

```text
node --test test/*.test.mjs
node scripts/verify-native-oauth-live.mjs
each backend: npx ts-node --files -r tsconfig-paths/register test/native-oauth.test.ts
```

The live smoke command creates/cancels temporary states only, without contacting
provider token endpoints or creating accounts. Before App Review, address
Apple's login service requirements, including a private-email option where
required: https://developer.apple.com/app-store/review/guidelines/#login-services.
Sign in with Apple is not enabled by this change.

## Verified UI Update: 25 October 2026

- Native UI source: `d767c36` on `feature/ios-euro-app`.
- RUS TestFlight: `202610251503`; EURO TestFlight: `202610251500`.
  Apple reports both `VALID` and `IN_BETA_TESTING`. The existing RUS `velox`
  and EURO `Veloxion EURO Internal` groups contain the corresponding builds.
  No roles, external invitations or App Review submissions were changed.
- RUS APK: `build-local/rus/Veloxion-RUS-1.0.3-6.apk`.
- EURO APK: `build-local/euro/Veloxion-EURO-1.0.2-3.apk`.
  APK v2/v3 signatures are valid and match the previous regional certificates.
- Both platforms bundle the LK logo and licensed Manrope font, explicit readable
  font weights, light cards, login/registration tabs and gradient primary actions.
  Native forms remain scrollable above the keyboard and constrained on tablets.
- RUS phone input matches the website: `+7 (999) 123-45-67`, initial `8` becomes
  `+7`, paste/edit/delete preserve cursor position, and an incomplete number is
  rejected locally. API requests use the canonical `+79123456789` identity.
  EURO and legacy RUS email input are not passed through the phone mask.
- Registration consent starts unchecked; validation errors identify the actual
  missing field. Authentication APIs, encrypted storage, purchases and push
  routing are unchanged. No frontend/backend deployment or migration was needed
  for this bundled UI update: install the new app build to receive it.
- All 53 local automated checks passed. Java and Swift share mask regression
  vectors; both Mac CI workflows passed the Swift tests and signed compilation.
  Isolated Android airplane-mode checks covered native forms, registration,
  consent, phone normalization, connection failure, small screens and tablet width.
  No real SMS/email, accounts or paid requests were generated. Physical iPhone
  and end-to-end SMS/email delivery still need device testing.

## Verified Release: 24 October 2026

- App source commit: `aad14e7` on `feature/ios-euro-app`.
- RUS TestFlight: `202610241846`; EURO TestFlight: `202610241843`.
  Both are processed by Apple and available to the existing internal groups.
  No external invitations or App Review submissions were made.
- RUS Android: `build-local/rus/Veloxion-RUS-1.0.2-4.apk`.
- EURO Android: `build-local/euro/Veloxion-EURO-1.0.1-2.apk`.
  Both preserve their previous signing certificates. RUS retains its historical
  local debug-key signing flow for sideloaded tests; it is not a new production
  Google Play signing setup. EURO uses its existing dedicated release key.
- Both frontends were deployed from separately staged successful builds with
  source/build backups. No backend, database, prices or payment settings changed.
- 160 automated app/frontend checks passed. Four live browser checks confirmed
  web compatibility and native hand-off on both sites. Android offline forms,
  consent defaults and the connection error were inspected in an isolated,
  read-only emulator. Real SMS/email delivery and physical iPhone checks are
  still required; no accounts or verification codes were created for these tests.

## Behavior

The launcher is an Android `AppCompatActivity` or an iOS UIKit view controller,
not a website or a local HTML login form. The bundled screen renders offline.
Signing in, creating an account, sending a code and opening the workspace still
require a working internet connection. Requests are never queued for later.

- RUS: phone and SMS code; registration also requires a name and explicit consent.
  Existing email/password accounts have a separate sign-in option.
- EURO: email/password sign-in; registration requires a name, repeated password,
  consent and an email verification code.
- Google (EURO), Yandex ID and VK ID (RUS) have native buttons with a system-browser
  OAuth flow. VK ID uses provider PKCE and the existing registered website `/auth`
  redirect; only native states are forwarded to the backend native callback.
  These are not Google/VK/Yandex native SDK account-picker integrations.
- EURO offers the same seven languages as the workspace: English, German, Italian,
  Spanish, French, Polish and Chinese. Russian is not an option; unsupported device
  languages fall back to English. All form/error translations are bundled offline.
  Switching languages preserves inputs, consent and OTP state. The selected language
  is saved on-device and synchronized with the workspace through dedicated,
  origin-restricted `getLocale`/`setLocale` methods, not session/token callbacks.
  The native EURO brand subtitle starts with `EU /`.
- Code resends have a minimum 60-second cooldown. Mutating auth requests are not
  automatically retried. Errors are translated, without displaying server internals.
- Access/refresh tokens are kept in device-only Keychain on iOS and AES-GCM storage
  backed by Android Keystore on Android. Passwords/codes are never written to disk.
  Refresh tokens are not exposed to JavaScript. Native bridge logging is disabled.
- The saved session is checked using the regional `/me` API before opening the
  website. Only a 401 can trigger one refresh attempt; network failures preserve
  the saved session. Site failure leaves the user on the native screen with Retry.
- The frontend session gate hands off the access token before account-scoped
  components mount. It rejects missing sessions instead of silently using an old
  web account. Explicit logout clears native storage and WebView cookies, including
  when the logout API is offline; account deletion clears it only after success.
- The existing local offline/retry screen remains a runtime navigation fallback
  and offers a return to native sign-in. Cold-start Android notification extras
  are forwarded after authentication. Purchases and push integrations are retained.

## Release Order

Deploy `lib/native-auth.ts`, `components/native-session-gate.tsx`, `lib/api.ts`
and `app/layout.tsx` to each matching frontend first. Old installed apps and normal
browsers retain web authentication; the new gate is enabled by the new app user
agent marker `VeloxionNativeAuth/1`. No database migration or new auth API is needed.

For the VK/language update deploy the RUS native OAuth broker, RUS `/auth` forwarding
and response headers, and EURO locale provider/native bridge types before the apps.
No database migration, provider-key change or balance change is required.

Then build the matching RUS/EURO Android app and both iOS TestFlight workflows.
Do not distribute a new native build against an old frontend: it cannot receive
the native session. Never place tokens in URLs or launch intents as a workaround.

## Verification

```text
capacitor: node --test test/*.test.mjs
each frontend: node --test test/native-auth.test.cjs
each frontend: npm run build
Android: scripts/build-android.ps1 -Configuration Debug -Region rus|euro -JavaHome <JDK21>
```

Before App Review, test both regions on a real iPhone and Android: first launch
in airplane mode, offline registration form, explicit code send after reconnect,
wrong/expired code, resend cooldown, email passwords, consent, successful sign-in,
restart, logout offline, account deletion, external providers and cold-start push.
Automated checks do not prove real SMS/email delivery or acceptance by App Review.
