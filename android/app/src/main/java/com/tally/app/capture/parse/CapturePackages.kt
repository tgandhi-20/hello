package com.tally.app.capture.parse

/**
 * The whitelist this whole feature is built around: [CaptureNotificationListenerService]
 * (in `capture.ingest`) only ever acts on notifications from these package
 * names, everything else is ignored at the door. Getting one of these wrong
 * silently captures nothing -- the worst failure mode, because it looks like
 * it's working -- so every entry below states its verification status.
 *
 * Verified against Google Play Store listings reachable from this build
 * environment (search results, not an installed device -- there is no device
 * anywhere in this pipeline):
 *   - **CBA** `com.commbank.netbank` -- high confidence. Matches the brief and
 *     the live "CommBank" Play listing.
 *   - **Bankwest** `au.com.bankwest.mobile` -- high confidence. Matches the
 *     brief and the live "Bankwest" Play listing (there is also an older,
 *     unrelated `com.bankwest3350.q2mobile.production` "BankWest SD Mobile
 *     Banking" listing -- a legacy/differently-branded app, not whitelisted).
 *   - **Google Wallet** `com.google.android.apps.walletnfcrel` -- high
 *     confidence. Matches the brief and the live Play listing.
 *   - **Samsung Wallet / Samsung Pay** `com.samsung.android.spay` -- high
 *     confidence. Matches the brief and the live Play listing (Samsung kept the
 *     original Samsung Pay package id through the Samsung Wallet rebrand).
 *   - **Amex** -- **the brief's `com.americanexpress.android.acctsvcs.us` is
 *     the *United States* Amex app**, confirmed against Play Store search
 *     results. For an Australian user (this app's whole premise -- CONTRACTS.md
 *     §0), the app actually installed is almost certainly
 *     `com.americanexpress.android.acctsvcs.au` ("Amex Australia" on Play).
 *     Both are whitelisted here, mapped to the same `'amex'` account, so this
 *     uncertainty costs nothing if wrong: whichever one isn't actually
 *     installed just never posts a notification, and the other still works.
 *     **Flagged for the user/orchestrator to confirm** which one is on the
 *     phone -- not something this module can check without a device.
 */
object CapturePackages {
    const val CBA = "com.commbank.netbank"
    const val BANKWEST = "au.com.bankwest.mobile"
    const val AMEX_AU = "com.americanexpress.android.acctsvcs.au"
    const val AMEX_US = "com.americanexpress.android.acctsvcs.us"
    const val GOOGLE_WALLET = "com.google.android.apps.walletnfcrel"
    const val SAMSUNG_WALLET = "com.samsung.android.spay"

    private val registry: Map<String, BankNotificationParser> = mapOf(
        CBA to CbaParser,
        BANKWEST to BankwestParser,
        AMEX_AU to AmexParser,
        AMEX_US to AmexParser,
        GOOGLE_WALLET to GoogleWalletParser,
        SAMSUNG_WALLET to SamsungWalletParser
    )

    /** Every whitelisted package name -- the complete set the listener service acts on. */
    val whitelist: Set<String> = registry.keys

    /** `null` for anything not on [whitelist]. */
    fun parserFor(packageName: String): BankNotificationParser? = registry[packageName]
}
