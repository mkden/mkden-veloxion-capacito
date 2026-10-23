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
4. Add **dedicated** test-user IDs to `payments.apple.sandbox_user_ids`.
   Sandbox credits change only these test wallets and are excluded from revenue.
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
