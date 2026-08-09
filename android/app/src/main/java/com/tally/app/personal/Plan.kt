package com.tally.app.personal

import java.time.LocalDate

/**
 * Tally — the user's personal plan, encoded as typed constants. Ported from
 * src/personal/plan.ts.
 *
 * SINGLE SOURCE OF TRUTH. Every number in docs/PERSONAL.md appears exactly
 * once, here, in INTEGER CENTS. If a number needs to change, it changes in
 * exactly one place.
 *
 * NOT PORTED: `applyPersonalPlan` (src/personal/applyPersonalPlan.ts) — it
 * writes budgets/recurring series into the store, which is data/store-layer
 * orchestration outside this package's scope (android's `.../data/**` is
 * owned by a different agent). Only the plan's own constants and their pure
 * derived math are ported here.
 *
 * INTERNAL INCONSISTENCIES FOUND IN PERSONAL.md — flagged here, not fudged
 * (see each constant's doc comment below, matching the TS source exactly):
 *   1. INCOME.netMonthlyCents ($6,457) is 33c above netAnnualCents / 12. The
 *      document's own explicit $6,457 is used, not the /12 figure.
 *   2. The §3 subscriptions cap ($36.00) does not equal the sum of the four
 *      real §5 subscriptions ($36.17). Both figures are kept, distinctly.
 *   3. §6's "Moving costs −$4,000" event does not equal its own stated
 *      breakdown ($4,400). See MOVING_COSTS_DISCREPANCY_CENTS.
 */

typealias Cents = Long

// ---------------------------------------------------------------------------
// §1 — Conversion rule. NON-NEGOTIABLE: weekly -> monthly is x52/12, never x4
// (the classic budgeting error — understates by ~8%).
// ---------------------------------------------------------------------------

const val WEEKS_PER_MONTH: Double = 52.0 / 12.0
const val FORTNIGHTS_PER_MONTH: Double = 26.0 / 12.0

fun weeklyToMonthlyCents(weeklyCents: Cents): Cents = Math.round(weeklyCents * WEEKS_PER_MONTH)
fun monthlyToWeeklyCents(monthlyCents: Cents): Cents = Math.round((monthlyCents * 12.0) / 52.0)
fun fortnightlyToMonthlyCents(fortnightlyCents: Cents): Cents = Math.round(fortnightlyCents * FORTNIGHTS_PER_MONTH)
fun monthlyToFortnightlyCents(monthlyCents: Cents): Cents = Math.round((monthlyCents * 12.0) / 26.0)

// ---------------------------------------------------------------------------
// §2 — Income
// ---------------------------------------------------------------------------

data class IncomeInfo(
    val grossSalaryCents: Cents,
    val incomeTaxCents: Cents,
    val medicareLevyCents: Cents,
    val netAnnualCents: Cents,
    /**
     * PERSONAL.md's own explicitly-labelled "Net / month" figure (§2).
     * NOTE: netAnnualCents / 12 = 645,666.67c ($6,456.67) — 33c below this.
     * The source document states $6,457 directly and every other total that
     * depends on it is built from $6,457, not the /12 figure — we follow the
     * document's own explicit number rather than "correct" it.
     */
    val netMonthlyCents: Cents,
    val marginalRatePct: Int,
    val assumesNoHecs: Boolean,
    val hecsApproxMonthlyImpactCents: Cents
)

val INCOME = IncomeInfo(
    grossSalaryCents = 10_000_000,
    incomeTaxCents = 2_052_000,
    medicareLevyCents = 200_000,
    netAnnualCents = 7_748_000,
    netMonthlyCents = 645_700,
    marginalRatePct = 32,
    assumesNoHecs = true,
    hecsApproxMonthlyImpactCents = 70_000
)

// ---------------------------------------------------------------------------
// §3 — Categories and monthly caps. Ids are FROZEN.
// ---------------------------------------------------------------------------

object CATEGORY_IDS {
    const val rent = "cat-rent"
    const val sublet = "cat-sublet"
    const val utilities = "cat-utilities"
    const val family = "cat-family"
    const val groceries = "cat-groceries"
    const val transport = "cat-transport"
    const val eatingOut = "cat-eating-out"
    const val lunch = "cat-lunch"
    const val coffee = "cat-coffee"
    const val health = "cat-health"
    const val phone = "cat-phone"
    const val shopping = "cat-shopping"
    const val subscriptions = "cat-subscriptions"
    const val skincare = "cat-skincare"
    const val savings = "cat-savings"
    const val income = "cat-income"
    const val oneOff = "cat-oneoff"
    const val other = "cat-other"
}

/**
 * `null` = no cap (income/one-off/other — open-ended or excluded from monthly
 * pacing). Negative only for `cat-sublet`, whose cap is recurring INCOME that
 * offsets rent.
 */
data class PersonalCategoryDef(
    val id: String,
    val label: String,
    val capCents: Cents?,
    /** `"need"` | `"want"` | `"save"` — kept as a plain string (matching
     *  src/types.ts's `CategoryKind`) rather than money's `CategoryKind` enum,
     *  so this package has no dependency on `com.tally.app.money`. */
    val kind: String,
    val note: String
)

val PERSONAL_CATEGORIES: List<PersonalCategoryDef> = listOf(
    PersonalCategoryDef(CATEGORY_IDS.rent, "Rent", 260_000, "need", "Whole 2BR, \$600/wk. Active only from Settings.moveInDate onward (§7)."),
    PersonalCategoryDef(
        CATEGORY_IDS.sublet, "Sublet income", -151_700, "need",
        "Room 2, \$350/wk, offsets rent. Negative cap: logged transactions are income " +
            "(negative Txn.amountCents). Active only from moveInDate (§7)."
    ),
    PersonalCategoryDef(CATEGORY_IDS.utilities, "Utilities", 21_000, "need", "Elec \$150 + internet \$60. No gas; water on owner. Active only from moveInDate (§7)."),
    PersonalCategoryDef(CATEGORY_IDS.family, "Family support", 45_000, "need", "Sent home monthly."),
    PersonalCategoryDef(CATEGORY_IDS.groceries, "Groceries", 37_000, "need", "\$85/wk."),
    PersonalCategoryDef(CATEGORY_IDS.transport, "Transport", 26_800, "need", "Opal + parking."),
    PersonalCategoryDef(CATEGORY_IDS.eatingOut, "Eating out", 10_000, "want", "Part of the \$240/mo \"eating out & coffee\" split. ASSUMPTION, not from the source doc (§4)."),
    PersonalCategoryDef(CATEGORY_IDS.lunch, "Lunch", 8_000, "want", "Part of the \$240/mo \"eating out & coffee\" split. ASSUMPTION, not from the source doc (§4)."),
    PersonalCategoryDef(CATEGORY_IDS.coffee, "Coffee", 6_000, "want", "Part of the \$240/mo \"eating out & coffee\" split. ASSUMPTION, not from the source doc (§4)."),
    PersonalCategoryDef(CATEGORY_IDS.health, "Health", 10_900, "need", "Bupa."),
    PersonalCategoryDef(CATEGORY_IDS.phone, "Phone", 8_100, "need", "Was missing from the original budget entirely."),
    PersonalCategoryDef(CATEGORY_IDS.shopping, "Shopping", 7_500, "want", ""),
    PersonalCategoryDef(
        CATEGORY_IDS.subscriptions, "Subscriptions", 3_600, "want",
        "Cap per §3 is exactly \$36.00. The four real subscriptions in KNOWN_SUBSCRIPTIONS (§5) actually sum to \$36.17 — 17c over this cap."
    ),
    PersonalCategoryDef(CATEGORY_IDS.skincare, "Skincare", 3_500, "want", ""),
    PersonalCategoryDef(CATEGORY_IDS.savings, "Savings", 350_000, "save", "The goal."),
    PersonalCategoryDef(CATEGORY_IDS.income, "Income", null, "save", "Salary."),
    PersonalCategoryDef(CATEGORY_IDS.oneOff, "One-offs", null, "need", "Visa, travel, moving — excluded from monthly pacing (§6)."),
    PersonalCategoryDef(CATEGORY_IDS.other, "Other", null, "want", "Fallback.")
)

/** Look up a category's monthly cap by id. `null` if uncapped or unknown. */
fun categoryCapCents(id: String): Cents? = PERSONAL_CATEGORIES.find { it.id == id }?.capCents

// ---------------------------------------------------------------------------
// Net housing — §3: "The app must show housing NET, not $2,600."
// ---------------------------------------------------------------------------

val NET_HOUSING_CENTS: Cents = 260_000L + -151_700L + 21_000L // = 129_300 ($1,293)

fun computeNetHousingCents(rentCents: Cents, subletCents: Cents, utilitiesCents: Cents): Cents =
    rentCents + subletCents + utilitiesCents

// ---------------------------------------------------------------------------
// Living-costs identity (§3): must equal exactly $2,957.
// ---------------------------------------------------------------------------

val LIVING_COSTS_CENTS: Cents =
    NET_HOUSING_CENTS +
        45_000 + // family
        37_000 + // groceries
        26_800 + // transport
        10_000 + // eating-out
        8_000 + // lunch
        6_000 + // coffee
        10_900 + // health
        8_100 + // phone
        7_500 + // shopping
        3_600 + // subscriptions (cap, per §3)
        3_500 // skincare
// = 295_700 ($2,957)

val LIVING_COST_CATEGORY_IDS: List<String> = listOf(
    CATEGORY_IDS.rent, CATEGORY_IDS.sublet, CATEGORY_IDS.utilities, CATEGORY_IDS.family,
    CATEGORY_IDS.groceries, CATEGORY_IDS.transport, CATEGORY_IDS.eatingOut, CATEGORY_IDS.lunch,
    CATEGORY_IDS.coffee, CATEGORY_IDS.health, CATEGORY_IDS.phone, CATEGORY_IDS.shopping,
    CATEGORY_IDS.subscriptions, CATEGORY_IDS.skincare
)

// ---------------------------------------------------------------------------
// §4 — The food group, the app's central lever.
// ---------------------------------------------------------------------------

val FOOD_GROUP_CATEGORY_IDS: List<String> = listOf(
    CATEGORY_IDS.groceries, CATEGORY_IDS.eatingOut, CATEGORY_IDS.lunch, CATEGORY_IDS.coffee
)

val FOOD_GROUP_MONTHLY_CAP_CENTS: Cents = 37_000 + 10_000 + 8_000 + 6_000 // $610

/** Exact conversion of the monthly food cap to weekly, via x12/52. = 14_077c ($140.77). */
val FOOD_GROUP_WEEKLY_TARGET_CENTS_PRECISE: Cents = monthlyToWeeklyCents(FOOD_GROUP_MONTHLY_CAP_CENTS)

/** The doc's rounded headline figure (§4: "$141/week is the headline target"). */
const val FOOD_GROUP_WEEKLY_TARGET_CENTS: Cents = 14_100 // $141

/** Current (pre-plan) food spend, approx, per §1/§9: "$260 this week, $141 budgeted". */
const val CURRENT_FOOD_SPEND_WEEKLY_CENTS_APPROX: Cents = 26_000

const val EATING_OUT_SPLIT_IS_ASSUMPTION = true

data class EatingOutVsGroceriesSplit(val eatingOutPct: Int, val groceriesPct: Int)
val EATING_OUT_VS_GROCERIES_JULY_SPLIT = EatingOutVsGroceriesSplit(eatingOutPct = 92, groceriesPct = 8)

// ---------------------------------------------------------------------------
// §5 — Subscriptions, seeded as truth.
// ---------------------------------------------------------------------------

data class KnownSubscription(val id: String, val merchant: String, val amountCents: Cents, val billingDayOfMonth: Int)

val KNOWN_SUBSCRIPTIONS: List<KnownSubscription> = listOf(
    KnownSubscription("netflix", "Netflix", 1_450, 5),
    KnownSubscription("amazon-prime", "Amazon Prime", 999, 12),
    KnownSubscription("crunchyroll", "Crunchyroll", 719, 18),
    KnownSubscription("google-one", "Google One", 449, 24)
)

/** = 3_617 ($36.17). NOTE: 17c above the cat-subscriptions cap (3_600, $36.00) — both
 *  are transcribed exactly as PERSONAL.md states them; they do not reconcile to the cent. */
val KNOWN_SUBSCRIPTIONS_TOTAL_CENTS: Cents = KNOWN_SUBSCRIPTIONS.sumOf { it.amountCents }

val CANCELLED_SUBSCRIPTIONS: List<String> = listOf("Bumble", "Claude", "Splitwise")

const val MISLEADING_PRIOR_SUBSCRIPTIONS_FIGURE_CENTS: Cents = 20_600
val MISLEADING_PRIOR_SUBSCRIPTIONS_ANTHROPIC_CHARGES_CENTS: List<Cents> = listOf(3_400, 13_830)

// ---------------------------------------------------------------------------
// §6 — Cash, one-offs and the goal.
// ---------------------------------------------------------------------------

const val STARTING_CASH_CENTS: Cents = 4_000_000 // $40,000
val STARTING_CASH_DATE: LocalDate = LocalDate.of(2026, 8, 3)

data class CashEvent(
    /** Exact date if PERSONAL.md gives one; `null` when it only gives a coarse label. */
    val date: LocalDate?,
    val dateLabel: String,
    val label: String,
    /** Signed like Txn.amountCents: positive = cash out, negative = cash in. */
    val amountCents: Cents
)

val AUGUST_2026_EVENTS: List<CashEvent> = listOf(
    CashEvent(LocalDate.of(2026, 8, 11), "11 Aug", "Amex due", 113_100),
    CashEvent(LocalDate.of(2026, 8, 15), "15 Aug", "Salary", -645_700),
    CashEvent(LocalDate.of(2026, 8, 25), "25 Aug", "CBA card due", 125_000),
    CashEvent(null, "late Aug", "Moving costs", 400_000),
    CashEvent(null, "Aug", "Repay aunt", 500_000),
    CashEvent(null, "Aug", "Living (still boarding, no rent)", 150_700)
)

/** ~$33,569 (§6). Verified: STARTING_CASH_CENTS minus the signed sum of
 *  AUGUST_2026_EVENTS reproduces this exactly. */
const val EXPECTED_END_OF_AUGUST_CASH_CENTS: Cents = 3_356_900

data class MovingCostsBreakdown(val bondCents: Cents, val rentInAdvanceCents: Cents, val setupCents: Cents)

/** The bond is RECOVERABLE — an asset, not an expense; it comes back at end of lease. */
val MOVING_COSTS_BREAKDOWN = MovingCostsBreakdown(bondCents = 260_000, rentInAdvanceCents = 130_000, setupCents = 50_000)

val MOVING_COSTS_BREAKDOWN_TOTAL_CENTS: Cents =
    MOVING_COSTS_BREAKDOWN.bondCents + MOVING_COSTS_BREAKDOWN.rentInAdvanceCents + MOVING_COSTS_BREAKDOWN.setupCents // $4,400

/** INCONSISTENCY FLAGGED, NOT FUDGED — see PERSONAL.md §6 (both figures transcribed
 *  exactly; EXPECTED_END_OF_AUGUST_CASH_CENTS uses the -$4,000 event-table figure). */
val MOVING_COSTS_DISCREPANCY_CENTS: Cents = MOVING_COSTS_BREAKDOWN_TOTAL_CENTS - 400_000 // $400

const val FLATMATE_BOND_SHARE_APPROX_CENTS: Cents = 140_000 // ~$1,400

data class PlannedOneOff(val month: java.time.YearMonth, val label: String, val amountCents: Cents)

val PLANNED_ONE_OFFS: List<PlannedOneOff> = listOf(
    PlannedOneOff(java.time.YearMonth.of(2026, 10), "PR / 189 visa + India ticket", 950_000),
    PlannedOneOff(java.time.YearMonth.of(2027, 2), "India trip balance", 350_000)
)

data class InterestPeriod(val annualRatePct: Double, val from: LocalDate?, val until: LocalDate?)

val SAVINGS_INTEREST_SCHEDULE: List<InterestPeriod> = listOf(
    InterestPeriod(5.2, null, LocalDate.of(2026, 11, 1)),
    InterestPeriod(5.0, LocalDate.of(2026, 11, 1), null)
)

data class OctoberTrap(
    val month: java.time.YearMonth,
    val withdrawalsCents: Cents,
    val depositsCents: Cents,
    val estimatedCostCents: Cents,
    val baseRateFallbackPct: Double,
    val verified: Boolean,
    val note: String
)

val OCTOBER_2026_TRAP = OctoberTrap(
    month = java.time.YearMonth.of(2026, 10),
    withdrawalsCents = 950_000,
    depositsCents = 350_000,
    estimatedCostCents = 13_500,
    baseRateFallbackPct = 0.65,
    verified = false,
    note = "Pay one-offs from an everyday account so the saver balance never dips. The growth " +
        "condition usually has no minimum — a small fixed standing transfer on a fixed day satisfies it."
)

data class GoalInfo(val targetCents: Cents, val targetDate: LocalDate, val purpose: String)

val GOAL = GoalInfo(
    targetCents = 7_233_900,
    targetDate = LocalDate.of(2027, 10, 30),
    purpose = "Deposit for a ~\$600k Sydney apartment at 10% down."
)

// ---------------------------------------------------------------------------
// §7 — Move-in date.
// ---------------------------------------------------------------------------

const val BOARDING_MONTHLY_LIVING_COST_CENTS: Cents = 150_700

// ---------------------------------------------------------------------------
// Savings target / payday (§0, §6, §8).
// ---------------------------------------------------------------------------

data class PlanDefaults(
    val monthlyIncomeCents: Cents,
    val savingsTargetCents: Cents,
    val paydayDayOfMonth: Int,
    val autoTransferDayOfMonth: Int
)

val PLAN_DEFAULTS = PlanDefaults(
    monthlyIncomeCents = INCOME.netMonthlyCents,
    savingsTargetCents = 350_000,
    paydayDayOfMonth = 15,
    autoTransferDayOfMonth = 16
)

// Sanity: the plan's own headline identity (§0) — take-home - living = savings.
// netMonthlyCents(645_700) - LIVING_COSTS_CENTS(295_700) = savingsTargetCents(350_000).
// Asserted in the test suite.

// ---------------------------------------------------------------------------
// §9 — Risks worth surfacing in-app.
// ---------------------------------------------------------------------------

const val ROOM_VACANCY_MONTHLY_COST_CENTS: Cents = 151_700

data class SalaryRaiseScenario(val raiseCents: Cents, val monthlyImpactCents: Cents)

val SALARY_RAISE_SCENARIO = SalaryRaiseScenario(raiseCents = 1_000_000, monthlyImpactCents = 57_000)
