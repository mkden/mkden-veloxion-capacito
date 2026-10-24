# Native Authentication (RUS / EURO)

The launcher is an Android `AppCompatActivity` or an iOS UIKit view controller,
not a website or a local HTML login form. The bundled screen renders offline.
Signing in, creating an account, sending a code and opening the workspace still
require a working internet connection. Requests are never queued for later.

- RUS: phone and SMS code; registration also requires a name and explicit consent.
  Existing email/password accounts have a separate sign-in option.
- EURO: email/password sign-in; registration requires a name, repeated password,
  consent and an email verification code.
- Other existing providers remain available through an explicitly chosen online
  web flow. They are not presented as native Google/VK/Yandex SDK integrations.
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
