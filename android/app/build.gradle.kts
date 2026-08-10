plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // Room's annotation processor — see the root build file for why KSP and
    // not kapt.
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.tally.app"
    // compileSdk 34 (Android 14, "UpsideDownCake") — the newest platform AGP 8.5.2
    // is documented and well-tested against. Picked deliberately over a newer
    // API level because this project cannot be built or synced locally to
    // confirm a bleeding-edge SDK/build-tools pairing actually resolves; 34
    // is a long-established, stable target.
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tally.app"
        // minSdk 26 = Android 8.0 (Oreo), per the brief.
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        // debug uses the built-in default debug signing config (auto-generated
        // debug keystore) — nothing to configure, nothing committed.
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        // BuildConfig.VERSION_NAME is what the single screen renders — this
        // generation is opt-in as of AGP 8.0's default flags.
        buildConfig = true
    }

    composeOptions {
        // Compose compiler extension version matched to Kotlin 1.9.24 per the
        // official AndroidX Compose-Kotlin compatibility map.
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")

    // ---- security/data layer additions (deliverables 2-5) -----------------
    // Only these four new dependency families were added, exactly as scoped:
    //
    // Room (encrypted storage, deliverable 4) — every financial field is
    // encrypted before it reaches these tables; Room only ever sees
    // ciphertext blobs (see data/Entities.kt). 2.6.1 is a long-stable release
    // well-tested against Kotlin 1.9.x / AGP 8.5.x / compileSdk 34.
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // androidx.security-crypto (deliverable 5's durable wrong-attempt
    // backoff) — EncryptedSharedPreferences backed by a Keystore MasterKey,
    // see security/LockoutStore.kt. 1.1.0-alpha06 is the newest release;
    // androidx.security-crypto has never shipped a 1.1.0 stable — this is
    // the version that introduced the MasterKey API LockoutStore uses.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // androidx.biometric (deliverable 2's biometric unlock prompt), stable
    // and long-established — see security/BiometricVaultUnlock.kt.
    implementation("androidx.biometric:biometric:1.1.0")

    // Kotlin coroutines (async vault operations, the resilient-decrypt
    // Promise.allSettled equivalent in data/DecryptBatch.kt, and the
    // whole-vault write Mutex in security/VaultLock.kt). -android brings in
    // kotlinx-coroutines-core transitively. 1.7.3 supports Kotlin 1.6-1.9.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}

// `correctErrorTypes` was a kapt-only workaround for stub-generation seeing
// not-yet-generated types as errors. KSP has no such stage, so there is
// nothing to correct and no equivalent setting.

// Print test failures into the build log, with the full assertion message and
// stack trace.
//
// By default Gradle reports only "There were failing tests. See the report at
// file:///.../index.html" — an HTML file on a CI runner that is thrown away
// when the job ends. With no Android SDK in the dev container, CI is the only
// place these tests ever run, so a failure that names no expected value and no
// line number costs an entire round trip to learn nothing. Five import tests
// failed exactly that way before this was added.
tasks.withType<Test>().configureEach {
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showExceptions = true
        showCauses = true
        showStackTraces = true
    }
}
