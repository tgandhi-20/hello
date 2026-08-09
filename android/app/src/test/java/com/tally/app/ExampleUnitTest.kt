package com.tally.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * One trivial, deliberately boring assertion. Its only job is to prove that
 * `./gradlew test` runs a JUnit test inside the CI JVM and reports a real
 * pass/fail. Later agents port the ~911 web-side assertions worth having on
 * this Kotlin side into this source set, alongside this one.
 */
class ExampleUnitTest {
    @Test
    fun additionIsCorrect() {
        assertEquals(4, 2 + 2)
    }
}
