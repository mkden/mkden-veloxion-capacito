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

The EURO frontend/backend now implement server-verified StoreKit purchases and
native APNs registration/delivery. The wallet uses EUR cents, never RUB mappings.
Native iOS hides and blocks the Stripe top-up action; website/Android checkout is
unchanged. Actual Apple prices come from StoreKit, separately from EUR credits.
Delivery, refunds and refund reversals are idempotent; Sandbox payments are marked
as test payments and excluded from real revenue. APNs failures cannot undo a
settled purchase. IAP and APNs remain disabled until Apple setup and device tests.

The prepared six wallet packages are EUR 25, 50, 100, 250, 500 and 1000, matching
the website presets. These are credited amounts, NOT assigned Apple retail prices.
The catalog is editable in EURO admin settings under `payments.apple.products`.
No signed EURO IPA, successful cloud provisioning, iPhone purchase or live push
is claimed merely because local tests/builds pass.

## Apple and Codemagic Setup

Verified in Apple on 2026-10-24: the EURO Bundle ID exists with In-App Purchase
and Push Notifications enabled. A separate active EURO App Store profile was
created with the current distribution certificate from the successful RUS IPA.
The account already has three distribution certificates, so none was created or
revoked. The profile's production APNs, application identifier, team and absence
of development/ad-hoc entitlements were checked. The EURO app card does not yet
exist; no EURO build or publication is implied by this provisioning result.

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
5. Configure the EURO backend with its own `APNS_BUNDLE_ID=eu.veloxion.app`,
   `APNS_P8_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_ENV=prod` (App Store and
   TestFlight builds), and finally `APNS_ENABLED=1`. Store the private key outside
   the website root, readable only by the backend owner. An APNs key may be reused
   only when its team, topic and
   environment scope permits EURO. An App Store Connect API key is NOT an APNs
   key. Topic-specific RUS keys must not be blindly reused.
6. After the EURO app card exists, run **ios-euro-iap-setup** on this branch. It
   creates missing consumable drafts, seven metadata localizations and Apple V2
   notification URLs at `https://veloxion.eu/api/payments/apple/notifications`.
   Existing non-draft products and conflicting notification URLs are preserved
   or rejected, not overwritten. The sanitized artifact reports the numeric app
   ID to set as `payments.apple.app_id` in EURO admin settings. Select approved
   retail price points/territories in Apple; verify agreements, tax and banking.
   Add a dedicated EURO account ID to `payments.apple.sandbox_user_ids` and only
   then enable `payments.apple.enabled` for device tests. Do not enable before
   packages, prices, app ID and Sandbox account are ready.
7. Test signed launch, auth, camera/gallery, offline recovery, purchase delivery,
   cancellation, duplicate proof protection and push on a real iPhone. Only then
   upload to TestFlight/App Review with explicit approval.

`/admin/push` reports EURO APNs configuration without displaying secrets. Its test
button targets only the authenticated administrator's registered iPhone. Ready
generation, support reply and confirmed production top-up notifications are
best-effort and deduplicated. They are not a durable delivery guarantee; APNs
acceptance is not proof that a device displayed a message.

The additive EURO migration is
`euro/backend/sql/2026-10-23-apple-iap-native-push.sql`. Back up first; do not run
it on RUS/CHINA. Existing balances, tariffs and payment settings are not replaced.

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

## Private Local Apple Access

`scripts/connect-app-store.ps1 -CredentialPath <private-connector-directory>/.env`
opens a local setup flow for a Team API key with provisioning access. Use an Admin
team key when issuing distribution certificates; individual keys do not support
provisioning. The key file is copied outside the repository into a Windows ACL
restricted directory. Existing connection files are not overwritten; no Apple
Account password, raw key or generated P12 password is printed.

Set `CONNECTOR_ENV_PATH` to that private `.env` when running the helper:

```powershell
node scripts/app-store-local.mjs test
node scripts/app-store-local.mjs bundle
node scripts/app-store-local.mjs reuse-signing --previous-ipa <successful-RUS-build.ipa>
```

`reuse-signing` verifies the public certificate from the previous IPA against the
current Apple certificate, then creates/reuses only the EURO profile. It never
creates or revokes certificates or extracts private signing keys. Import/fetch
the downloaded EURO `.mobileprovision` in Codemagic Code signing identities; the
matching certificate and its private key must already be available there.

The separate `signing` command issues a distribution certificate only for a
locally generated RSA key if a matching certificate does not exist and the
conservative three-certificate limit has not been reached. Generated P12/password
files stay in private connector storage, never in reports or Git. It must not be
used to work around a full certificate quota by revoking a RUS certificate.

Run provisioning tests without contacting Apple:

```powershell
node --test test/app-store-signing.test.mjs test/app-store-setup.test.mjs test/ios-regions.test.mjs
```

## Official References

- https://developer.apple.com/documentation/appstoreconnectapi/apps
- https://developer.apple.com/documentation/appstoreconnectapi/bundle-ids
- https://developer.apple.com/documentation/appstoreconnectapi/capabilitytype
- https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app
- https://developer.apple.com/help/account/keys/create-a-private-key/
- https://docs.codemagic.io/yaml-code-signing/signing-ios/
