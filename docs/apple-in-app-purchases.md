# Apple In-App Purchase (RUS iOS)

This wrapper loads https://veloxion.io/lk. Website/Android billing is unchanged.
Apple Pay and Stripe are not used to buy digital AI credits inside iOS.

## Products

Create six **Consumable** in-app purchases for Bundle ID `io.veloxion.app`:

| Product ID | Wallet credits (RUB equivalent) |
| --- | ---: |
| io.veloxion.app.credits.210 | 210 |
| io.veloxion.app.credits.420 | 420 |
| io.veloxion.app.credits.1990 | 1990 |
| io.veloxion.app.credits.4500 | 4500 |
| io.veloxion.app.credits.15000 | 15000 |
| io.veloxion.app.credits.20000 | 20000 |

Choose actual prices/territories in App Store Connect. The application displays
StoreKit's localized price. Wallet credits do not expire and cannot be exchanged
for cash. Website bonus badges are not applied: the current server credits the
package amount only.

## Server Setup Required Before Review

1. Deploy matching `rus/backend` and `rus/frontend` changes. Back up the database
   and run `rus/backend/sql/2026-10-23-apple-iap.sql` first.
2. In admin payment settings set `payments.apple.app_id` to the numeric App Store
   application ID. Check product JSON and create matching products in ASC.
3. Configure App Store Server Notifications V2 for production and sandbox:
   `https://api.veloxion.io/api/payments/apple/notifications`.
4. Add **dedicated** test/review-user IDs to `payments.apple.sandbox_user_ids`.
   Sandbox credits change only these test wallets and are excluded from revenue.
   Give App Review a dedicated allowlisted demo account in review information:
   App Review transactions also use Sandbox. Never provide production admin access.
5. Complete Apple paid-app agreements, bank/tax details, product metadata and review
   screenshots. Enable `payments.apple.enabled` only when products are available.
6. Test purchase, cancellation, pending, network loss after payment, relaunch
   recovery, switching accounts, repeated proof, refund and refund reversal.
   Never use real production accounts for Sandbox credit testing.

The backend verifies Apple's certificate chain, bundle/environment, account token
and product. An immutable ledger prevents duplicate credit. The credit amount is
snapshotted before purchase. StoreKit `finish()` is called only after server
confirmation. Account balances persist on the server; "Check purchases" retries
unfinished transactions. Already consumed consumables are not restored by Apple.

Payment records store actual Apple currency/price separately from wallet credit.
RUB revenue totals exclude foreign currencies and Sandbox payments. These are
gross transaction amounts, not Apple's net payout; use Apple's financial reports
for settlement and foreign-exchange accounting.

`ios-iap-validation` builds an IPA but **does not publish**. Existing `ios-release`
on main still publishes to TestFlight. Do not submit to App Review until server
and products pass a real Sandbox test. No secrets belong in Git.

## App Store Connect Automation

`ios-iap-setup` runs only on pushes to the dedicated `iap/app-store-setup` branch.
It uses the existing `veloxion-appstore` integration inside Codemagic; private
keys are never exported to logs or artifacts. It does not build or publish an app.

The workflow adds missing Consumable products, draft Russian/English metadata,
and production/Sandbox notifications V2 URLs. Existing descriptions and reviewed
versions are preserved. A conflicting product type or unrelated existing
notification URL stops the preflight before writes. Re-running a completed setup
does not duplicate products or localizations.

Prices, territories, tax categories, bank details, agreements, screenshots and
review submission are NOT changed. The script cannot enable backend payments.
Wallet amounts are not guessed Apple retail prices. Read `remaining` in the report
before considering the application ready for testing or review.

Commands (Node 22+, no extra dependencies):

```sh
node --test test/apple-iap.test.mjs test/app-store-setup.test.mjs
node scripts/app-store-setup.mjs --plan
node scripts/app-store-audit.mjs
node scripts/app-store-setup.mjs --apply-metadata --output build/app-store-setup/report.json
```

Without `--apply-metadata`, API access is strictly read-only. `--plan` works
offline, without credentials. Missing credentials, 401/403 and verification
failures exit nonzero and produce a sanitized error, not a successful audit.
The native-only validation workflow still treats its informational audit as
non-blocking; only the separate setup workflow proves remote configuration.

Codemagic supplies `APP_STORE_CONNECT_KEY_IDENTIFIER`,
`APP_STORE_CONNECT_ISSUER_ID` and `APP_STORE_CONNECT_PRIVATE_KEY`. The helper accepts
PEM, escaped PEM, JSON-quoted PEM or base64 PEM. For a protected local key file,
`APP_STORE_CONNECT_PRIVATE_KEY_FILE` can replace the private-key value. Do not use
an APNs key or put any private key in this repository.

The report contains the numeric App Store app ID for
`payments.apple.app_id`, verified draft product IDs and outstanding manual steps.
It contains no secrets. A successful draft setup is NOT a successful purchase test.

Official API references:

- https://developer.apple.com/documentation/appstoreconnectapi/managing-in-app-purchases
- https://developer.apple.com/documentation/appstoreconnectapi/working-with-in-app-purchase-versions
- https://developer.apple.com/documentation/appstoreconnectapi/appupdaterequest/data-data.dictionary/attributes-data.dictionary
- https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information
- https://docs.codemagic.io/partials/code-signing-ios-configure-environment-vars/
