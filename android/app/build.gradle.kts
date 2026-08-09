plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
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
}
