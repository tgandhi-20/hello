package com.tally.app

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Does the app actually start?
 *
 * Every other test in this project is a unit test on the host JVM. They prove
 * the money model is right and the parsers are right, and they would all pass
 * on an app that crashes the instant it opens — no Activity, no Compose
 * runtime, no Room database, no Android Keystore is exercised by any of them.
 *
 * This one runs on a real emulator, so it is the first thing that touches the
 * parts a unit test cannot reach: Room actually opening its database, the
 * Keystore actually being available, the theme actually resolving, and the
 * whole Compose tree actually laying out. On a fresh install the vault is not
 * set up, so what must appear is the PIN setup screen.
 *
 * It deliberately asserts almost nothing about content. The value is entirely
 * in "the process survived to first frame" — a crash in `onCreate`, a missing
 * Room migration, an exception building the theme, or a composable that throws
 * on an empty vault all fail here, and all of them would otherwise be found by
 * the user on their phone.
 */
@RunWith(AndroidJUnit4::class)
class LaunchSmokeTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun theAppLaunchesAndShowsTheLockScreen() {
        composeRule.waitForIdle()

        // A fresh install has no vault, so setup is what should be on screen.
        // Matching on several plausible words rather than one exact string:
        // this test exists to catch a crash, and it should not go red merely
        // because someone reworded a heading.
        val expected = listOf("PIN", "Pin", "Set up", "Unlock", "Tally")
        val found = expected.any { text ->
            composeRule.onAllNodesWithText(text, substring = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        assertTrue(
            "The app launched but showed none of $expected — the Compose tree " +
                "rendered something unexpected on a fresh install.",
            found,
        )
    }
}
