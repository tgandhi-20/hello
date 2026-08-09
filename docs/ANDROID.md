# Tally for Android — automatic capture from payment notifications

**FROZEN.** Agents build against this. The existing web app is NOT rewritten.

---

## 0. What this is, and what it is not

The user asked for transactions to land in Tally automatically when they tap their phone,
without exporting CSVs.

**Google Wallet and Samsung Wallet cannot be read.** Neither exposes an API for a user's
transaction history — their APIs issue *passes* (loyalty, boarding, offers). A tap routes
card → bank; Wallet is only a token vehicle and holds no queryable ledger. Every app that
appears to "read your wallet" is really reading **notifications** or connecting to the
**bank**. We do the former.

**This is not a rewrite.** ~20,000 lines of React, the encryption, the store, the UI and
all 911 assertions stay exactly as they are. What we add:

```
  android/                       NEW — a thin Kotlin shell
    WebView hosting the existing app at its live URL
    NotificationListenerService that reads payment notifications
    A JS bridge handing captured transactions to the web layer
  src/features/capture/          NEW — web side: receive, review, accept
```

The Kotlin is a few hundred lines. Everything that touches money stays in the code that
is already tested.

---

## 1. Why WebView, not a TWA

A Trusted Web Activity is the right wrapper for Play, but it is a Custom Tab: there is no
straightforward JavaScript bridge, which is the entire point here. The user has explicitly
said they do not need Play.

So: a plain `WebView` with `addJavascriptInterface`, giving a clean two-way native↔JS
channel. It loads the **live URL** (`https://tgandhi-20.github.io/hello/`) so the app keeps
auto-updating exactly as it does today, and the existing service worker keeps it working
offline. WebView supports service workers.

**One-time migration the user must be told about, plainly:** WebView storage is separate
from Chrome's. The vault in the installed PWA does not carry over. Before switching, export
a `.tally` backup from the current app and restore it into the new one. Say this in the
install instructions, not in a footnote.

---

## 2. What can and cannot be captured — be honest about this

Captured: anything the bank or wallet actually posts as a notification while the phone is
on and notifications are enabled — which for tap-to-pay and card purchases is the common
case.

**Not captured, and the user must know:**
- Purchases made without the phone (a card typed into a website, a saved card on file).
- Direct debits and scheduled payments that post silently.
- Anything while notifications are disabled for that bank app.
- Anything the bank posts without an amount or merchant in the text.

**CSV import therefore remains the source of truth**, and the weekly catch-up stays. This
feature removes most of the daily friction; it does not make the ledger complete on its
own. Any copy that implies otherwise is wrong.

---

## 3. Capture pipeline

```
bank/wallet notification
   → NotificationListenerService (Kotlin)
   → parse to {amountCents, merchant, account, postedAt, rawText}
   → buffer, ENCRYPTED, on device
   → when the web layer is open: hand over via the JS bridge
   → web layer dedupes, categorises, and holds them in a review queue
   → user accepts (one tap, or bulk) → written through the normal store path
```

**Rules:**
- **Nothing auto-commits to the ledger.** Captured items land in a review queue. A parser
  that silently invents a transaction is worse than no parser. One tap to accept, and a
  bulk accept once the user trusts it.
- **The native buffer is encrypted at rest** (Jetpack Security `EncryptedSharedPreferences`
  or equivalent) and cleared the moment the web layer confirms ingestion. It holds pending
  items only — never a second copy of the ledger.
- **Nothing leaves the device.** No network calls from the native layer, ever. The app's
  whole premise depends on this.
- **Never log notification text.** It contains amounts and merchants. Same rule as the web
  side: no financial data in logs, not even in debug builds.
- Dedupe against the existing ledger using the store's existing hash, so a captured
  transaction and the same row later imported from CSV do not both land.

---

## 4. Parsing

Australian banks post notifications in a small number of shapes, e.g.
`"You spent $5.50 at CAMPOS COFFEE"`, `"Purchase of $12.30 at WOOLWORTHS"`,
`"$45.00 debited from your account"`. Google Wallet posts its own tap confirmations.

Requirements:
- Table-driven patterns per package name (`com.commbank.netbank`, `au.com.bankwest.mobile`,
  `com.americanexpress.android.acctsvcs.us`, `com.google.android.apps.walletnfcrel`,
  Samsung Wallet), not one giant regex.
- **Integer cents.** Parse `"$1,234.56"` to `123456` exactly — never `parseFloat * 100`.
- Map package → `AccountId` (`cba`, `cba-card`, `bankwest`, `amex`).
- A notification that does not parse cleanly is **dropped with a counter**, never guessed
  into a transaction.
- Refunds and credits must be distinguishable from spend, or dropped.
- Unit-tested against a fixture set of real-shaped notification strings. The patterns are
  the part most likely to be wrong, so they get the most tests.

---

## 5. Build and install — CI does it

The dev container cannot build this: `dl.google.com` is blocked, so no Android SDK and no
AGP artifacts. GitHub Actions runners ship with the SDK, so:

- A workflow builds the APK on push and on manual dispatch.
- Debug signing is acceptable for personal sideloading. If a release keystore is wanted, it
  comes from repository secrets — **never a key committed to the repo**.
- The APK is published as a workflow artifact and a GitHub Release, so the user can
  download and install it directly from their phone.
- Install instructions must cover: exporting a `.tally` backup first, enabling
  "install unknown apps", granting notification access in Android settings (it cannot be
  granted programmatically), and restoring the backup.

---

## 6. Non-negotiables carried over

- Integer cents everywhere; never floats.
- No network calls from the native layer. No analytics. No telemetry.
- Never log a transaction, amount, merchant, PIN or key — native or web.
- The web app's existing behaviour must not regress: all 14 check suites keep passing.
- Tone stays calm and factual. A capture notice reports what was captured; it does not
  celebrate or nag.
