# Tally for Android — the native app

**FROZEN.** This supersedes `ANDROID.md` §1 (which chose a WebView shell). The capture
pipeline rules in `ANDROID.md` §3 and the parsing rules in §4 still hold verbatim — they
were written about the notification listener, and the notification listener has not
changed. What changed is everything above it.

---

## 0. Why native, and what it costs

The WebView plan was the cheap answer: keep ~20,000 lines of tested React, add a few
hundred lines of Kotlin around it. The user asked instead for "a complete android app
tally — which does both". That is a different product, and it is worth being honest that
it is not free:

- **The 911 web assertions do not come along.** They test TypeScript. The Kotlin port is
  new code and needs its own tests, which is why the money-model port was briefed to bring
  the assertions with it rather than just the functions.
- **Two implementations of one money model now exist.** They can drift. The mitigation is
  that the Kotlin port is a *port* — same function names, same test cases, same integer
  cents — so a divergence shows up as a failing test rather than as a wrong number on a
  screen.
- **The web app stays live** at `https://tgandhi-20.github.io/hello/`. It is not deleted
  and not deprecated. It is the fallback if the APK has a problem, and it is where a
  `.tally` backup comes from during migration.

What native buys, and the reason it is the right call here: the notification listener and
the ledger live in the same process. No JS bridge, no second storage world, no "the
WebView's vault is not the PWA's vault" migration trap every time the user reinstalls.
Capture writes to the same encrypted database the rest of the app reads.

---

## 1. Version matrix — pinned, and CI is the only compiler

Nothing under `android/` has ever been compiled on this machine. The dev container has
Java 21 and Gradle 8.14.3 but **no Android SDK**, and `dl.google.com` returns 403 through
the proxy, so AGP itself cannot be resolved locally. GitHub's `ubuntu-latest` runner is
the compiler. This is why the pipeline was built and proven green *before* any feature
code was written.

| Component | Version | Why this one |
|---|---|---|
| AGP | 8.5.2 | Stable pairing with Gradle 8.7 and JDK 17 |
| Gradle | 8.7 | AGP 8.5's documented wrapper version |
| Kotlin | 1.9.24 | Matches Compose compiler 1.5.14 exactly |
| Compose compiler ext | 1.5.14 | The *only* value valid for Kotlin 1.9.24 |
| Compose BOM | 2024.06.00 | Contemporary with the above |
| JDK | 17 | What AGP 8.5's compatibility docs are written against |
| compileSdk / targetSdk | 34 | Long-established; a bleeding-edge SDK cannot be verified here |
| minSdk | 26 | Android 8.0. Keystore, `EncryptedSharedPreferences`, and the listener all work |

**Any change to a row above changes another row.** Kotlin and the Compose compiler
extension are a locked pair: bumping one without the other fails the build with a version
mismatch, not a warning. Do not bump one in isolation.

---

## 2. Module ownership

Written so four agents could work at once without colliding. The boundaries survive the
build and are worth keeping.

```
com.tally.app
  security/    PIN, PBKDF2, Keystore wrapping, biometrics, lock state
  data/        Room entities, DAOs, field-level encryption, .tally backup I/O
  money/       computeMonthMoney, isBillSeries, safe-to-spend — the one engine
  import/      CSV parsing for CBA, Bankwest, Amex
  categorize/  merchant -> category rules
  recurring/   series detection
  personal/    the user's plan constants (docs/PERSONAL.md, encoded)
  capture/     NotificationListenerService, parsers, pending buffer, review queue
  ui/          Compose screens, theme, navigation
```

Two files are shared and are therefore **merge points, not owned by anyone**:
`app/build.gradle.kts` (dependencies) and `AndroidManifest.xml` (permissions, services).
Changes there get reconciled by the orchestrator, deliberately, not by whoever pushes last.

---

## 3. Non-negotiables

These are not style preferences. Each one exists because breaking it produced a real bug
in the web app, or would produce a real leak here.

1. **Integer cents.** `Long`, never `Double`, never `Float`. Parse `"$1,234.56"` to
   `123456` by string manipulation — never `toDouble() * 100`, which gives `123455` for
   values you will not predict in advance.
2. **No `INTERNET` permission in the manifest.** Not "we don't make network calls" — the
   permission is absent, so the guarantee is enforced by the OS rather than by review. A
   finance app holding a decrypted ledger and holding notification-listener access has no
   business being able to open a socket. If a future feature needs the network, that is a
   conversation, not a one-line manifest edit.
3. **Nothing auto-commits to the ledger.** Captured notifications land in a review queue.
   A parser that silently invents a transaction is worse than no parser.
4. **Never log financial data.** No amount, merchant, PIN, key, or raw notification text —
   in any build type, including debug. Notification text is the whole leak in one string.
5. **PBKDF2-SHA256 at 600,000 iterations, byte-compatible with the web app.** Same
   parameters, same salt handling, so a `.tally` backup exported from the PWA restores
   here. This is the migration path; if it is not byte-identical, there isn't one.
6. **The vault must not be able to lock the user out.** This is the P0 the web app already
   shipped once: a decrypt failure on one record must not fail the batch. Decrypt
   resiliently, count what was skipped, surface the count, and never leave "wipe
   everything" as the only way back in.
7. **Validate before destroying.** A backup restore validates the decrypted payload
   *before* clearing existing data. The web app got this backwards once and it cost a
   vault.

---

## 4. Install path

Debug signing is correct here. The user is sideloading onto one phone; there is no Play
listing, so there is no upload key to manage and nothing gained by generating a release
keystore. If one is ever wanted it comes from repository secrets — **never committed**.

The APK is a workflow artifact from `.github/workflows/android.yml`. Install instructions
must cover, in this order and in plain words:

1. Export a `.tally` backup from the web app **first**. Do this before installing anything.
2. Allow installing unknown apps for the browser or file manager doing the install.
3. Install the APK.
4. Restore the `.tally` backup.
5. Grant notification access — Settings → Notifications → Special app access →
   Notification access. **This cannot be granted programmatically**; the app can only
   deep-link to the settings page and explain why it is needed.

Step 5 is also the step where the honesty in `ANDROID.md` §2 belongs: capture gets
tap-to-pay and card purchases, and it does not get card-on-file charges, silent direct
debits, or anything that arrives while notifications are off. CSV import stays the source
of truth. Any copy implying the ledger is now complete on its own is wrong.
