# EURO Android APK

EURO is a separate application: `eu.veloxion.app`, `Veloxion AI Europe`,
`https://veloxion.eu/lk`. It can be installed alongside RUS. The Java namespace
remains shared, but the application ID, label, Firebase client and offline
screen are selected by region. No iOS files are modified.

## Build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Region euro -FirebaseConfig "C:/path/to/google-services.json" -JavaHome E:/SDK/jbr -VersionCode 1 -VersionName 1.0.0
node scripts/sign-android-euro.mjs
```

The script validates that the Firebase file contains `eu.veloxion.app` and is
NOT a service account. It copies only that Android client into ignored build
inputs. RUS remains the default build region, and its old Firebase file is not
changed. Use JDK 21+ and Android SDK API 36.

The signed APK is under `build-local/euro`. EURO uses a dedicated persistent
release keystore in the current user's `.codex/connectors/veloxion-android-signing`
directory. Credentials are generated locally, protected with Windows ACLs and
never printed. Keep this private directory backed up: future updates need the
same signing key. Increase the version code for each released update.

## Push

Android uses FCM HTTP v1; iOS continues to use APNs. EURO native tokens are
provider-scoped and stored only in the EURO database. FCM messages require the
`eu.veloxion.app` recipient package even when RUS shares the Firebase project.
The frontend creates the `veloxion_euro` channel and asks for notification
permission after login. Logout unregisters the authenticated device.

Server variables: `FCM_ENABLED=1`, `FCM_PROJECT_ID`,
`FCM_SERVICE_ACCOUNT_JSON_PATH`. The service account is server-only and must
never enter the APK or Git. Enable neither APNs nor Apple purchases merely
because Android FCM is configured. Verify delivery on a real Android device;
Google accepting a validation-only request does not prove device delivery.

References: https://capacitorjs.com/docs/apis/push-notifications and
https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send
