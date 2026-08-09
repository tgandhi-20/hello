package com.tally.app.categorize

/**
 * Australian merchant dictionary. Ported from src/categorize/dictionary.ts.
 * Maps a normalised, cleaned merchant string to a small set of candidate
 * category labels, most-preferred first — matched by label text against
 * whatever categories actually exist at runtime, falling back gracefully down
 * the list, and ultimately to an "Other"/"Uncategorised" bucket.
 *
 * Coffee vs Lunch vs Dining Out are kept distinct on purpose.
 */
data class DictionaryEntry(
    /** Lowercase substrings matched against the cleaned, lowercased merchant string. */
    val patterns: List<String>,
    /** Candidate category labels, most preferred first. */
    val categoryLabels: List<String>,
    /** Canonical display name to use instead of the cleaned raw text, if matched. */
    val canonicalName: String
)

// Order matters where substrings could collide — more specific/branded entries are
// listed before generic catch-alls.
val MERCHANT_DICTIONARY: List<DictionaryEntry> = listOf(
    // --- Groceries ---
    DictionaryEntry(listOf("woolworths", "woolies"), listOf("Groceries", "Shopping", "Other"), "Woolworths"),
    DictionaryEntry(listOf("coles"), listOf("Groceries", "Shopping", "Other"), "Coles"),
    DictionaryEntry(listOf("aldi"), listOf("Groceries", "Shopping", "Other"), "ALDI"),
    DictionaryEntry(listOf("harris farm"), listOf("Groceries", "Shopping", "Other"), "Harris Farm"),
    DictionaryEntry(listOf("iga"), listOf("Groceries", "Shopping", "Other"), "IGA"),

    // --- Coffee (kept distinct from Lunch / Dining Out) ---
    DictionaryEntry(listOf("gloria jean"), listOf("Coffee", "Dining Out", "Other"), "Gloria Jean's"),
    DictionaryEntry(listOf("boost juice"), listOf("Coffee", "Dining Out", "Other"), "Boost Juice"),

    // --- Lunch (sandwiches / salads / quick weekday food) ---
    DictionaryEntry(listOf("soul origin"), listOf("Lunch", "Dining Out", "Other"), "Soul Origin"),
    DictionaryEntry(listOf("zambrero"), listOf("Lunch", "Dining Out", "Other"), "Zambrero"),
    DictionaryEntry(listOf("mad mex"), listOf("Lunch", "Dining Out", "Other"), "Mad Mex"),
    DictionaryEntry(listOf("guzman y gomez", "guzman & gomez", "gyg"), listOf("Lunch", "Dining Out", "Other"), "Guzman y Gomez"),
    DictionaryEntry(listOf("subway"), listOf("Lunch", "Dining Out", "Other"), "Subway"),
    DictionaryEntry(listOf("grill'd", "grilld"), listOf("Lunch", "Dining Out", "Other"), "Grill'd"),

    // --- Dining Out / takeaway ---
    DictionaryEntry(listOf("nando's", "nandos"), listOf("Dining Out", "Other"), "Nando's"),
    DictionaryEntry(listOf("mcdonald's", "mcdonalds", "macca", "maccas"), listOf("Dining Out", "Other"), "McDonald's"),
    DictionaryEntry(listOf("kfc"), listOf("Dining Out", "Other"), "KFC"),
    DictionaryEntry(listOf("domino's", "dominos"), listOf("Dining Out", "Other"), "Domino's"),
    DictionaryEntry(listOf("uber eats", "ubereats"), listOf("Dining Out", "Other"), "Uber Eats"),
    DictionaryEntry(listOf("doordash"), listOf("Dining Out", "Other"), "DoorDash"),
    DictionaryEntry(listOf("menulog"), listOf("Dining Out", "Other"), "Menulog"),

    // --- Transport ---
    DictionaryEntry(listOf("uber"), listOf("Transport", "Other"), "Uber"), // after "uber eats" so ride-hail doesn't shadow it
    DictionaryEntry(listOf("opal"), listOf("Transport", "Other"), "Opal"),
    DictionaryEntry(listOf("myki"), listOf("Transport", "Other"), "Myki"),
    DictionaryEntry(listOf("go card", "gocard"), listOf("Transport", "Other"), "Go Card"),
    DictionaryEntry(listOf("translink"), listOf("Transport", "Other"), "Translink"),

    // --- Fuel ---
    DictionaryEntry(listOf("ampol"), listOf("Fuel", "Transport", "Other"), "Ampol"),
    DictionaryEntry(listOf("caltex"), listOf("Fuel", "Transport", "Other"), "Caltex"),
    DictionaryEntry(listOf("shell"), listOf("Fuel", "Transport", "Other"), "Shell"),
    DictionaryEntry(listOf(" bp ", "bp service"), listOf("Fuel", "Transport", "Other"), "BP"),
    DictionaryEntry(listOf("united petroleum", "united fuel"), listOf("Fuel", "Transport", "Other"), "United"),
    DictionaryEntry(listOf("7-eleven", "7 eleven", "seven eleven"), listOf("Fuel", "Shopping", "Other"), "7-Eleven"),

    // --- Alcohol ---
    DictionaryEntry(listOf("dan murphy", "danmurphy"), listOf("Alcohol", "Shopping", "Other"), "Dan Murphy's"),
    DictionaryEntry(listOf("bws"), listOf("Alcohol", "Shopping", "Other"), "BWS"),
    DictionaryEntry(listOf("liquorland"), listOf("Alcohol", "Shopping", "Other"), "Liquorland"),

    // --- Shopping ---
    DictionaryEntry(listOf("bunnings"), listOf("Shopping", "Other"), "Bunnings"),
    DictionaryEntry(listOf("kmart"), listOf("Shopping", "Other"), "Kmart"),
    DictionaryEntry(listOf("target"), listOf("Shopping", "Other"), "Target"),
    DictionaryEntry(listOf("big w", "bigw"), listOf("Shopping", "Other"), "Big W"),
    DictionaryEntry(listOf("officeworks"), listOf("Shopping", "Other"), "Officeworks"),
    DictionaryEntry(listOf("jb hi-fi", "jb hifi", "jbhifi"), listOf("Shopping", "Other"), "JB Hi-Fi"),
    DictionaryEntry(listOf("harvey norman"), listOf("Shopping", "Other"), "Harvey Norman"),
    DictionaryEntry(listOf("amazon"), listOf("Shopping", "Other"), "Amazon"),
    DictionaryEntry(listOf("ebay"), listOf("Shopping", "Other"), "eBay"),

    // --- Health / pharmacy ---
    DictionaryEntry(listOf("chemist warehouse"), listOf("Health", "Other"), "Chemist Warehouse"),
    DictionaryEntry(listOf("priceline"), listOf("Health", "Other"), "Priceline"),

    // --- Bills / utilities ---
    DictionaryEntry(listOf("telstra"), listOf("Bills", "Utilities", "Other"), "Telstra"),
    DictionaryEntry(listOf("optus"), listOf("Bills", "Utilities", "Other"), "Optus"),
    DictionaryEntry(listOf("vodafone"), listOf("Bills", "Utilities", "Other"), "Vodafone"),
    DictionaryEntry(listOf("tpg"), listOf("Bills", "Utilities", "Other"), "TPG"),
    DictionaryEntry(listOf("origin energy"), listOf("Bills", "Utilities", "Other"), "Origin Energy"),
    DictionaryEntry(listOf("agl"), listOf("Bills", "Utilities", "Other"), "AGL"),
    DictionaryEntry(listOf("energyaustralia", "energy australia"), listOf("Bills", "Utilities", "Other"), "EnergyAustralia"),
    DictionaryEntry(listOf("sydney water"), listOf("Bills", "Utilities", "Other"), "Sydney Water"),

    // --- Subscriptions ---
    DictionaryEntry(listOf("netflix"), listOf("Subscriptions", "Bills", "Other"), "Netflix"),
    DictionaryEntry(listOf("spotify"), listOf("Subscriptions", "Bills", "Other"), "Spotify"),
    DictionaryEntry(listOf("disney"), listOf("Subscriptions", "Bills", "Other"), "Disney+"),
    DictionaryEntry(listOf("binge"), listOf("Subscriptions", "Bills", "Other"), "Binge"),
    DictionaryEntry(listOf("stan"), listOf("Subscriptions", "Bills", "Other"), "Stan"),
    DictionaryEntry(listOf("kayo"), listOf("Subscriptions", "Bills", "Other"), "Kayo")
)

/** Generic, non-branded catch-all patterns applied after the branded dictionary above. */
val GENERIC_PATTERNS: List<DictionaryEntry> = listOf(
    DictionaryEntry(listOf("coffee", "cafe", "espresso", "roaster", "roasters", "roastery"), listOf("Coffee", "Dining Out", "Other"), ""),
    DictionaryEntry(listOf("bakery", "sandwich", "sushi", "salad"), listOf("Lunch", "Dining Out", "Other"), ""),
    DictionaryEntry(
        listOf("restaurant", "pizza", "takeaway", "take away", "thai", "indian", "kebab", "noodle", "ramen", "diner", "bar & grill", "pub"),
        listOf("Dining Out", "Other"), ""
    ),
    DictionaryEntry(listOf("pharmacy", "chemist", "medical", "dental", "doctor", "clinic", "physio"), listOf("Health", "Other"), ""),
    DictionaryEntry(listOf("gym", "fitness", "anytime fitness", "f45", "crossfit", "pilates", "yoga"), listOf("Fitness", "Health", "Other"), ""),
    DictionaryEntry(
        listOf("insurance", "nrma", "aami", "budget direct", "youi", "allianz", "bupa", "medibank", "hcf"),
        listOf("Insurance", "Bills", "Other"), ""
    ),
    DictionaryEntry(
        listOf("rent", "mortgage", "landlord", "real estate", "property management", "realty"),
        listOf("Rent", "Housing", "Bills", "Other"), ""
    ),
    DictionaryEntry(listOf("petrol", "fuel", "service station"), listOf("Fuel", "Transport", "Other"), ""),
    DictionaryEntry(listOf("parking", "toll", "linkt", "eastlink", "citylink"), listOf("Transport", "Other"), ""),
    DictionaryEntry(listOf("salary", "payroll", "pay run", "wages"), listOf("Income", "Other"), "")
)
