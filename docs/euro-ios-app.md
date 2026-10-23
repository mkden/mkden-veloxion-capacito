# EURO iOS Application

This is a separate installed application built from the shared Capacitor source.
RUS remains the default; no existing RUS bundle, certificate, backend, user or
payment is migrated or deleted.

| Field | EURO value |
| --- | --- |
| Display name | Veloxion AI Europe |
| Bundle ID | eu.veloxion.app |
| Website | https://veloxion.eu/lk |
| App Store SKU | veloxion-eu-ios |
| Suggested primary language | English (U.S.) |

## Current Status and Limits

The region-specific wrapper, English offline/retry screen, English privacy
permission text and separate Codemagic workflows are prepared. Native purchases
trust only the website associated with the signed bundle ID; EURO cannot request
RUS product IDs and vice versa. Android remains unchanged.

This is NOT a completed EURO payment/push integration. The EURO backend currently
does not implement the RUS Apple IAP ledger or native APNs delivery/registration.
Do not submit EURO with the existing Stripe AI-credit top-up flow inside iOS.
An enabled In-App Purchase capability alone does not implement payments.

## Apple and Codemagic Setup

1. Push `feature/ios-euro-app` to run `ios-euro-bootstrap`. It uses the existing
   `veloxion-appstore` CI integration to register only `eu.veloxion.app`, enable
   Push Notifications and In-App Purchase capabilities and verify them. It does
   not generate/revoke certificates, submit products or publish a build. The
   sanitized `build/euro-bootstrap/report.json` distinguishes planned from
   verified configuration. Missing API access fails, rather than pretending the
   app was created.
2. In App Store Connect, use **Apps > + > New App** with the fields above, after
   the Bundle ID registration succeeds. Apple's official public REST API does
   not create new app records. Account Holder, Admin or App Manager access is
   required. Do not automate private Apple APIs or place Apple ID passwords in CI.
3. Prepare a separate App Store provisioning profile for `eu.veloxion.app` with
   Push Notifications enabled. A valid distribution certificate of the same
   Apple team may be reused if its private key is already in Codemagic. Do not
   revoke the RUS certificate or assume its provisioning profile fits EURO.
   Fetch/upload the EURO profile in Codemagic Code signing identities before
   starting the signed validation workflow. `ios_signing` fetches managed files;
   it does not by itself create a missing profile.
4. Run **ios-euro-validation** on this branch. It builds an App Store-signed IPA
   but has no publishing stage. Do not merge into main to test: main retains the
   existing RUS TestFlight release workflow.
5. Configure the EURO backend with its own `APNS_BUNDLE_ID=eu.veloxion.app` and
   device-token storage. An APNs key may be reused only when its team, topic and
   environment scope permits EURO. An App Store Connect API key is NOT an APNs
   key. Topic-specific RUS keys must not be blindly reused.
6. Port and test server-verified Apple consumable purchases using EURO wallet
   amounts and currency. Do not reuse RUB credit mappings, RUS purchase IDs or
   RUS notification URLs. Confirm actual Apple price points before configuring
   retail prices or enabling payments.
7. Test signed launch, auth, camera/gallery, offline recovery, purchase delivery,
   cancellation, duplicate proof protection and push on a real iPhone. Only then
   upload to TestFlight/App Review with explicit approval.

## Local Build Preparation

Run from the Capacitor directory in a disposable worktree or clean CI checkout:

```powershell
node --test test/apple-iap.test.mjs test/app-store-setup.test.mjs test/ios-regions.test.mjs
node scripts/prepare-ios-region.mjs euro
$env:VELOXION_APP_REGION = "euro"
npx cap sync ios
```

The preparation script changes only the two iOS Bundle IDs, iOS display/privacy
strings and offline-screen region. It validates all expected inputs before edits
and can be rerun safely. RUS CI explicitly prepares `rus`; Android is untouched.
Never commit generated EURO Xcode/Capacitor output over the default RUS project.

## Official References

- https://developer.apple.com/documentation/appstoreconnectapi/apps
- https://developer.apple.com/documentation/appstoreconnectapi/bundle-ids
- https://developer.apple.com/documentation/appstoreconnectapi/capabilitytype
- https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app
- https://developer.apple.com/help/account/keys/create-a-private-key/
- https://docs.codemagic.io/yaml-code-signing/signing-ios/
