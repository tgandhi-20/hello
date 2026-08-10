# Tally — Android app

A native Kotlin/Compose port of the Tally web app, plus the one thing the
web app can never do: read payment notifications as they arrive, so most
spending lands without exporting a CSV.

There is no Play Store listing and none is planned — this is built to be
sideloaded onto one personal phone.

## Status — read this before installing

**Not ready to use yet.** It compiles and the build produces an APK, but:

- Several screens still need building (import, budgets, goal, statements).
- Notification capture has never seen a real notification from a real bank
  app. The parsers are tested against fixtures written from documented
  message shapes, not against a device.
- Nothing here has been run on a phone by the people who wrote it.

Until this section says otherwise, **the web app at
<https://tgandhi-20.github.io/hello/> is the one to actually use.**

## What capture can and cannot see

Worth being plain about, because the difference decides whether your ledger
is complete.

**Captured:** anything your bank or wallet actually posts as a notification
while the phone is on and notifications for that app are enabled — which
covers tap-to-pay and ordinary card purchases.

**Not captured:**

- A card typed into a website, or one saved on file somewhere.
- Direct debits and scheduled payments that post silently.
- Anything arriving while notifications for that bank app are off.
- Anything the bank posts without a clear amount and merchant — those are
  skipped and counted, never guessed into a transaction.

**So CSV import stays the real record**, and the Saturday statement export
stays in the routine. Capture removes most of the daily friction; it does
not make the ledger complete on its own.

Nothing captured is written to your ledger automatically. It waits in a
review list until you accept it.

## Why this can't be built on this machine

Building an Android app normally requires the Android SDK, and downloading
it requires reaching `dl.google.com`. Whatever computer or container wrote
this code did not have access to either, so **nothing here has been
compiled or run locally.** It has only been checked by hand for typos and
obviously-wrong version numbers.

The build happens entirely on GitHub's own servers instead, using GitHub
Actions. Their `ubuntu-latest` runners come with the Android SDK already
installed, so they can do what this machine can't.

## How the automatic build works

Every time code is pushed to `main` (or to a `claude/**` branch) that
touches anything under `android/`, GitHub automatically:

1. Checks out the code.
2. Installs Java and the Android SDK pieces this project needs.
3. Runs the unit tests.
4. Builds a debug APK (an installable Android app file).
5. Attaches that APK to the workflow run as a downloadable file.

If any step fails — a typo that won't compile, a test that fails — the
whole run is marked red/failed, so it's immediately obvious something is
broken, instead of a broken app quietly sitting in the repo.

You can also trigger a build by hand at any time, without pushing new
code, using the button described below.

## Before you install: export a backup

**Do this first, before installing anything.** The Android app has its own
encrypted vault. It cannot read the web app's, because browser storage
belongs to the browser — installing this does not carry your data across,
and there is no way to reach back for it afterwards.

1. Open the web app, unlock it, and go to **Menu → Back up**.
2. Save the `.tally` file somewhere you can find it from the phone.
3. Keep it until you have confirmed the Android app is showing your real
   figures. It is the only copy of that data outside the browser.

The backup format is deliberately identical on both sides — same field
names, same date strings, same account names — so the file restores here
unchanged. That compatibility is enforced by the code, not by hope, but it
has not yet been exercised end to end on a device.

## Downloading and installing the APK on your phone

1. On your phone, open a browser and go to the repo on GitHub, then tap
   **Actions** (near the top of the page).
2. Tap **Android CI** in the list on the left, then tap the newest run at
   the top (it should have a green checkmark). If you want to build right
   now instead of waiting for a run, tap **Run workflow** and confirm —
   that's the manual trigger.
3. Scroll down to **Artifacts** and tap **tally-debug-apk** to download it.
   It downloads as a `.zip` file containing the `.apk` inside — open the
   zip (most phones do this automatically when you tap the download) and
   extract the `.apk` file.
4. Tap the extracted `.apk` file to install it.

### "Install blocked" — enabling unknown sources

The first time you try to install it, Android will refuse and offer a
settings link — that's expected, not an error. Android calls anything
installed outside the Play Store an "app from an unknown source," and it's
turned off by default for safety.

- Tap the message it shows you, which usually jumps straight to the right
  settings screen, **or** go manually: **Settings → Apps → (the app you
  used to open the file, e.g. your Files app or Chrome) → Install unknown
  apps → Allow from this source.**
- Then go back and tap the `.apk` file again to install it.

This permission only applies to the one app you granted it to (e.g. just
your Files app), not your whole phone, and you can turn it back off
afterwards in the same settings screen if you'd like to.

## After installing

### 1. Restore your backup

Open the app, set a PIN, then restore the `.tally` file you exported. Check
the figures against the web app before you trust them. If a record cannot
be decrypted the app tells you how many were skipped rather than quietly
showing a smaller total — if you ever see that message, stop and keep the
backup.

### 2. Grant notification access

This is the permission that makes capture work, and **it cannot be granted
from inside the app** — Android deliberately reserves it for the system
settings screen, because it lets an app read every notification you get.

**Settings → Notifications → Special app access → Notification access →
Tally.**

The app can link you there, but you have to make the choice yourself.

Turning it off later stops capture immediately and breaks nothing else —
the ledger, the vault and CSV import all keep working exactly as before.

## Where your data lives

On the phone, encrypted, and nowhere else.

The app has **no `INTERNET` permission at all**. Not "does not make network
calls" — the permission is absent from the manifest, so Android itself
prevents the app from opening a network connection. An app holding a
decrypted ledger and reading your bank notifications has no business being
able to reach the network, and this way that guarantee is enforced by the
operating system rather than by anyone's promise. A CI check fails the build
if that permission is ever added.

There is no analytics, no telemetry, and no account. Amounts, merchants,
PINs and keys are never written to logs, including in debug builds.

## What's pinned, and why

These versions were chosen for how well-documented and mutually compatible
they are, not for being the newest available — see the root of the repo's
CI setup notes (or ask the agent that built this) for the full reasoning.
In short:

- **Kotlin 1.9.24** with **Compose compiler extension 1.5.14** — a
  long-established, well-documented pairing from the official
  Compose-Kotlin compatibility map.
- **Android Gradle Plugin (AGP) 8.5.2** with **Gradle 8.7** — AGP 8.5.x's
  documented minimum/recommended Gradle version.
- **compileSdk / targetSdk 34** (Android 14) — a stable, long-available
  platform level rather than whatever is newest, to minimize the chance of
  a toolchain mismatch that can't be debugged without a working local
  build.
- **minSdk 26** (Android 8.0) — set directly per the product requirement.
- **JDK 17** in CI — what AGP 8.5.x's own compatibility docs are written
  against for running the Gradle build.

The Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/`) is
committed, so CI (and anyone else) can build this without installing
Gradle first — it downloads the exact pinned Gradle version itself.
