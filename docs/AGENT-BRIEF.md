# Android agent brief — read this before writing any Kotlin

Shared rules for every agent working in `android/`. Your task prompt adds what
you specifically own. This file is the part that is the same for everyone, and
every rule here exists because breaking it already cost this project a build.

---

## 0. You cannot compile. CI is the only compiler.

There is no Android SDK in this container and `dl.google.com` is blocked, so
nothing you write can be run before it is pushed. A CI round is ~3 minutes.
That changes how you should work:

- **Verify by reading.** Every import must resolve to a declaration you have
  actually opened. Every API signature must match something already used in
  this tree. Do not use an API you cannot point at in an existing file.
- **Balance braces, parens and brackets** in every file before finishing.
- **Add no Gradle dependency.** What exists is what you get (list in §4).
- **Run `./tools/check-sources.sh` from `android/` before you finish. It must
  pass.** It catches, in under a second, six classes of error that each cost a
  full build to diagnose.

## 1. The six mistakes that have already cost builds

1. **Kotlin block comments NEST.** Never write `/*` inside a comment. A package
   glob like `ui/**` in a KDoc opens a nested comment, the closing `*/` closes
   only the inner one, and the rest of the file becomes a comment — reported as
   "Unclosed comment" at the last line, nowhere near the cause. Nineteen of
   these, across twelve files, in one round. Write `ui/`, not `ui/**`.
2. **Extension functions need an explicit import**, even when their package is
   already imported. `import com.tally.app.util.Json` does NOT bring in
   `JsonValue.stringify()`. Import each one by name.
3. **Backticked test names must not contain `. ; [ ] / < > : \`** — the JVM
   forbids them in a method name. `` `a test (e.g. this one)` `` fails on the
   dot in "e.g.".
4. **No `return` inside an expression body.** `fun f() = try { ... }` with an
   early `return` is a compile error; use a block body.
5. **Don't import Compose scope members.** `weight`, `align`, `matchParentSize`
   are `RowScope`/`ColumnScope`/`BoxScope` members. They are available from the
   receiver inside `Row {}`/`Column {}`/`Box {}`; importing them by name fails
   with "it is internal".
6. **A test fixture must be committable.** `.gitignore` excludes `*.csv` so a
   real bank statement can never land in this repo. Only the `.example.csv`
   suffix is exempt. A fixture that git ignores is invisible to CI and the test
   fails with something that looks nothing like the real cause.

## 2. Non-negotiables (`docs/ANDROID-NATIVE.md` §3)

- **Integer cents. `Long`. Never `Double`/`Float` for money.** Parse
  `"$1,234.56"` to `123456` by string manipulation, never `toDouble() * 100`.
  The UI formats figures; it never computes them.
- **No `INTERNET` permission, ever.** Not "we don't call the network" — the
  permission is absent so the OS enforces it. Do not touch
  `AndroidManifest.xml` unless your task says you own it. A CI check fails the
  build if the permission appears.
- **Never log financial data** — no amount, merchant, PIN, key, or raw
  notification text, in any build type including debug.
- **Nothing auto-commits to the ledger.** Captured or imported rows land
  somewhere the user confirms them.
- **Validate before destroying.** A restore validates the decrypted payload
  before clearing anything. The web app got this backwards once and lost a
  vault.
- **The vault must never lock the user out.** A decrypt failure on one record
  must not fail the batch — skip it, count it, surface the count.

## 3. Architecture you must not fight

- **One money model.** `com.tally.app.money` owns `Txn`, `Category`,
  `Settings`, `RecurringSeries`, `AccountId`, `TxnSource`, `CategoryKind`,
  `RecurringCadence`, `Cents = Long`. Import them; never redeclare them. There
  were briefly two parallel sets and collapsing them was its own round of work.
- **One money engine.** `computeMonthMoney` is called ONCE and everything
  derives from that single result. Never recompute a financial figure per
  screen — the web app had four engines that disagreed on screen, which is what
  `DESIGN-V4.md` exists to prevent. If two numbers on screen could ever
  disagree, one of them must go.
- **The vault is `com.tally.app.data.VaultRepository`** — suspend-function CRUD.
  Read it before calling it.
- **Batch writes go through `addTxns`, never a loop of `addTxn`.** A per-item
  write assigns dedupe occurrence 0 every time, so two genuinely distinct
  same-day identical rows (two $5.50 coffees) hash the same and one is silently
  dropped.

## 4. What is available

Compose BOM 2024.06.00, Material3, Kotlin 1.9.24, coroutines 1.7.3, Room 2.6.1,
androidx.biometric 1.1.0, androidx.security-crypto, activity-compose 1.9.1,
lifecycle-runtime-ktx 2.8.4, JUnit 4.13.2. **Nothing else.** No
`navigation-compose` (nav is a hand-rolled back stack in `ui/nav/Route.kt`), no
`material-icons-extended` (icons are Canvas-drawn in `ui/theme/Icons.kt`).

## 5. Design

`docs/DESIGN-V3.md` is the visual language, `docs/DESIGN-V4.md` the information
architecture. In practice:

- Use `ui/theme/` tokens — `TallyColors`, the type scale, `TallyControlRadius`.
  **Introduce no new colours.**
- Grouped lists on one raised surface with hairline dividers; not one card per
  row.
- Every touch target ≥48dp. Use `heightIn(min=)`/`sizeIn(min=)`, never a fixed
  `.size()` on a clickable — a fixed size silently defeats the minimum.
- **Landscape must work.** Put screen content in a `verticalScroll` container.
  The web app shipped a PIN pad whose bottom row fell off a rotated screen,
  which meant being unable to open the app at all.
- Empty means render nothing. Never invent placeholder rows to fill a screen.
- Tone is calm and factual. State what happened; don't celebrate or nag.

## 6. Navigation — you do NOT wire it

`ui/nav/TallyApp.kt`, `ui/nav/Route.kt`, `ui/menu/MenuScreen.kt` and
`MainActivity.kt` are owned by the orchestrator, because several agents adding
routes to the same file is a guaranteed conflict.

Export each screen as a top-level `@Composable` with an explicit signature and
report that signature in your final message. The orchestrator wires it in.
Take what you need as parameters (`onBack: () -> Unit`, a `VaultRepository`, a
`TallyDataSource`) rather than reaching for a global.

## 7. Report back

1. Files created/changed.
2. The exact public signature of every composable you expose, for nav wiring.
3. Anything you could not do, and why — an honest gap is worth more than a
   plausible fake. If you stub something, say so plainly and make the stub
   render nothing rather than invent data.
4. Your confidence it compiles first try, and the single likeliest failure.
