package com.tally.app

import android.graphics.Bitmap
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Walks the app and writes a PNG of every screen.
 *
 * Nobody involved in building this app can see it. Every other check is
 * static or asserts on a semantics tree, and a layout can satisfy all of them
 * while overlapping its own text, clipping a number, or rendering a heading
 * on top of a card. The web version of this project had four visual defects
 * that only turned up when someone finally looked at a screenshot.
 *
 * So this is not a pass/fail test in the usual sense. It captures, and the
 * artifacts are the deliverable — the assertions here only keep the walk on
 * the rails, and the walk is deliberately forgiving: a screen that cannot be
 * reached is skipped and noted, never a failure, because a red build here
 * would stop the screenshots from being uploaded at all, which defeats the
 * purpose.
 */
@RunWith(AndroidJUnit4::class)
class ScreenshotTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val outDir: File by lazy {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        File(ctx.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
    }

    private fun shoot(name: String) {
        composeRule.waitForIdle()
        val bmp: Bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        File(outDir, "$name.png").outputStream().use { out ->
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        }
        bmp.recycle()
    }

    /** Tap the first node whose text matches, if it exists. Returns whether it did. */
    private fun tapIfPresent(text: String, substring: Boolean = false): Boolean {
        val nodes = composeRule.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes()
        if (nodes.isEmpty()) return false
        composeRule.onAllNodesWithText(text, substring = substring)[0].performClick()
        composeRule.waitForIdle()
        return true
    }

    @Test
    fun captureEveryScreen() {
        // 1. Fresh install: PIN setup.
        shoot("01-lock-setup")

        // Set a PIN by tapping the keypad. Six digits is the default length;
        // tapping a seventh is harmless if the length differs.
        repeat(6) { tapIfPresent("1") }
        shoot("02-lock-pin-entered")
        tapIfPresent("Continue") || tapIfPresent("Set PIN") || tapIfPresent("Next")
        // Confirmation step, if there is one.
        repeat(6) { tapIfPresent("1") }
        tapIfPresent("Continue") || tapIfPresent("Confirm") || tapIfPresent("Done")
        shoot("03-after-setup")

        // 2. The four tabs.
        shoot("04-home")
        if (tapIfPresent("Spend")) shoot("05-spend")
        if (tapIfPresent("Add")) shoot("06-quick-add")
        if (tapIfPresent("More")) shoot("07-more-menu")

        // 3. Menu destinations. Each returns via the system back button.
        val menuRows = listOf(
            "All transactions" to "08-transactions",
            "Budgets" to "09-budgets",
            "Regular payments" to "10-recurring",
            "Deposit plan" to "11-goal",
            "Import statements" to "12-import",
            "From notifications" to "13-capture-review",
            "Notification access" to "14-notification-access",
            "Settings" to "15-settings",
        )
        for ((label, shot) in menuRows) {
            if (!tapIfPresent("More")) break
            if (tapIfPresent(label)) {
                shoot(shot)
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                    .uiAutomation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK)
                composeRule.waitForIdle()
            }
        }

        // 4. Home again, to prove navigation returns cleanly.
        tapIfPresent("Home")
        shoot("16-home-final")
    }
}
