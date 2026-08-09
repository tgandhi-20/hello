// Top-level build file where you can add configuration options common to all
// sub-projects/modules. Plugin versions are pinned here, once, via the
// plugins DSL with apply false — each module applies the ones it needs.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // Room's annotation processor. KSP rather than kapt, because kapt failed
    // this build with exactly one line — `e: Could not load module <Error
    // module>` from kaptGenerateStubsDebugKotlin — and no file, no line, no
    // symbol. kapt generates Java stubs before the real compile, so a Kotlin
    // error during stub generation surfaces as that, and the actual errors
    // never print. A build that cannot say what is wrong is unusable when CI
    // is the only compiler available. KSP reads Kotlin directly and reports
    // errors normally.
    //
    // The version is a pair: `1.9.24` must match the Kotlin plugin above
    // exactly, and `-1.0.20` is KSP's own release against that compiler.
    // Bumping Kotlin without bumping this fails at plugin resolution.
    id("com.google.devtools.ksp") version "1.9.24-1.0.20" apply false
}
