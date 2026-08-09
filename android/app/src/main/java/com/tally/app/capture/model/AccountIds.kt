package com.tally.app.capture.model

/**
 * String constants matching `AccountId` in `src/types.ts` exactly. Kept as plain
 * `String` (not a Kotlin `enum class`) deliberately: the real ledger/account type
 * belongs to whichever agent owns `data/**` (frozen to capture -- see
 * AndroidManifest/ANDROID.md ownership table), and that package does not exist
 * yet in this native app. A `String` that already matches the TS union's raw
 * values needs zero translation whichever concrete type that agent lands on --
 * an enum picked here would just be one more thing to remap later.
 *
 * `'cash'` from the TS union is omitted on purpose: nothing this module captures
 * can plausibly be a cash transaction.
 */
object AccountIds {
    const val CBA = "cba"
    const val CBA_CARD = "cba-card"
    const val BANKWEST = "bankwest"
    const val AMEX = "amex"

    /** Every value this module ever assigns to [PendingCapture.account]. */
    val ALL: Set<String> = setOf(CBA, CBA_CARD, BANKWEST, AMEX)
}
