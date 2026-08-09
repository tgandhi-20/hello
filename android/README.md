# Tally — Android app

This is a **skeleton**: one screen that shows the app name and version
number. It exists to prove the build pipeline works, not to do anything
useful yet. Real features get built on top of this once the pipeline is
proven green.

There is no Play Store listing and none is planned yet — this is built to
be sideloaded onto one personal phone.

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
