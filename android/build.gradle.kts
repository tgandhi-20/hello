// Top-level build file where you can add configuration options common to all
// sub-projects/modules. Plugin versions are pinned here, once, via the
// plugins DSL with apply false — each module applies the ones it needs.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // Room's annotation processor needs kapt (security/data layer — Room
    // storage, deliverable 4). Same 1.9.24 as the Kotlin plugin above: kapt
    // ships as part of the Kotlin Gradle plugin itself, so there is no
    // separate version to keep in sync.
    id("org.jetbrains.kotlin.kapt") version "1.9.24" apply false
}
