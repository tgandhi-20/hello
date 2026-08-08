# Tally — Design v3 (light) and information architecture

**FROZEN.** Supersedes docs/DESIGN.md. Agents build against this file.

---

## 0. Why v3

Two rounds of dark-theme design were rejected by the user, in their words: *"i hate
the violet neon blue colours make it simple white colourful design like how google
apple has in their apps."*

They also said the app is *"60% there but not a level where i would use it
confidently day to day"* and asked why the first page isn't a summary.

Both are the same problem. The app currently shows **ten stacked cards** on Home and
makes the user assemble their own conclusion. A tool is scanned and operated, not
read top to bottom. **Surface the summary before the detail.**

Three functional gaps compound it, and matter more than colour:
1. `applyPersonalPlan()` exists but **is never called from any UI**, so the user's real
   category caps and four known subscriptions are never seeded. The app is only
   personalised in its defaults, not in practice.
2. There is **no onboarding**. First run is a PIN screen and an empty app.
3. There is no support for the user's actual weekly ritual (§8 of PERSONAL.md):
   export CSVs from three banks, review, pay Amex.

---

## 1. Palette — white ground, colour carried by content

Light-first. This is a Google/Apple-style grouped-list app: a soft neutral page
ground with white cards lifting off it, near-black text, one restrained accent for
things you can touch, and a colourful category ramp doing the expressive work.

**The accent is deep green.** Not violet, not blue — both were explicitly rejected.
Green is honest for a savings app and unmistakably distinct from what came before.

```
--ground        #F4F6F8   page background (cool light neutral, deliberately not pure white)
--surface       #FFFFFF   cards, list groups, sheets
--surface-sunk  #EDEFF3   inset wells, progress tracks, skeletons
--hairline      #E2E6EB   dividers, card edges where needed

--ink-1         #16191C   primary text and figures
--ink-2         #565D66   secondary / supporting copy
--ink-3         #858C95   tertiary / captions (verify >=4.5:1 on --surface AND --ground)
--ink-on-accent #FFFFFF

--accent        #0E7A57   deep emerald — interactive affordance ONLY
--accent-press  #0A5F44
--accent-tint   #E2F1EB   selected rows, icon wells, chart fills

--caution       #A15C00   amber, text-safe on white
--caution-tint  #FBEEDC
--critical      #B3261E   error / destructive / genuinely over
--critical-tint #FBE9E7
```

**Semantic colour is separate from the accent** and is used only where state must be
read at a glance. There is deliberately **no "positive" green**: a second green would
collide with the accent. On-track reads as *absence of warning*, exactly as Apple's
own apps do.

**Category ramp** `--cat-1 … --cat-12`: twelve hues at roughly equal lightness and
moderate chroma, all legible on `--surface`. This is where "colourful" lives. Every
swatch must hold >=3:1 against white as a fill, and pair with `--ink-1` when used as
a tint behind an icon. Vary lightness as well as hue so the set survives colourblind
viewing.

**Elevation**: white cards on the neutral ground, separated by a soft shadow
(`0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)`), not borders. Never
a border and a shadow on the same element.

**Dark mode is out of scope for v3.** Commit to light and paint every colour
explicitly. Do not leave a half-built dark theme behind.

---

## 2. Type

System stack — `-apple-system, 'Segoe UI', Roboto, sans-serif`. On the target device
this resolves to Roboto, which *is* the Google-app typeface. Zero bundle cost, no CDN
(the CSP forbids one), works offline. This is a deliberate choice, not a fallback.

Scale: 12 / 13 / 15 / 17 / 20 / 28 / 40. Body 15. Figures use `tabular-nums` and
`font-feature-settings: 'tnum'`, weight 600, slight negative tracking.

`.money` (600, tabular, -0.01em) and `.money-hero` (40px, 700, tabular, -0.02em)
carry every amount in the app.

---

## 3. Layout — grouped lists, not card soup

The iOS/Material grouped pattern: a **section label** in `--ink-2`, then one white
rounded container holding rows separated by hairlines. Never one card per row.

- Page gutter 16px. Section gap 24px. Row min-height 56px. Card radius 16px.
- Touch targets >=48x48.
- Respect `env(safe-area-inset-*)`.
- Motion 140–180ms, transform/opacity only, honour `prefers-reduced-motion`.

**Encode state in form, not only in number** — a chip, a pill, a severity stripe — so
what needs attention reads without being read.

---

## 4. Information architecture — the real change

### Tabs (5 slots)

| Slot | Name | Contains |
|---|---|---|
| 1 | **Today** | the summary (below) |
| 2 | **Spending** | transactions, search, month nav, trends, heatmap, habits |
| 3 | **⊕** | quick-add |
| 4 | **Plan** | goal, budgets, recurring, statements, routine |
| 5 | **More** | import, weekly review, settings, install, version |

The split is **what happened** (Spending) versus **what's planned** (Plan). Today
answers "am I OK?" and links into both.

### Today — the summary screen

Answers, in this order, in about three seconds:

1. **Safe to spend today** — one figure, `.money-hero`, with a single derivation line
   underneath. If income is unset, prompt rather than invent.
2. **This week's food** — `$X of $141`, a slim progress track, days left, and the
   groceries-vs-eating-out split as one thin stacked bar. This is the user's biggest
   lever (PERSONAL.md §4) and belongs above the fold.
3. **Coming up (14 days)** — one grouped list merging rent, bills, detected recurring,
   card due dates and payday. Each row: date chip, name, amount. This replaces three
   separate cards.
4. **Goal** — ONE row, not a card: `$X of $72,339 · on track · 449 days`. Tapping goes
   to Plan.
5. **Needs you** — only rendered when non-empty: uncategorised imported transactions,
   a detected price rise, an unconfirmed statement cycle, a routine item due today.

Everything else moves to Spending or Plan. Today must fit roughly two screens, not ten
cards. **If a card has nothing to say today, it does not render.**

---

## 5. Functional gaps to close (higher value than the repaint)

1. **First-run onboarding.** After the PIN is set: confirm monthly income, payday,
   savings target, move-in date, HECS yes/no — then CALL `applyPersonalPlan()` so the
   real caps and subscriptions are actually seeded. Offer "start with my plan" or
   "start empty". Skippable, re-runnable from Settings.
2. **Weekly review** (PERSONAL.md §8, first Saturday): a guided flow — import CSVs →
   categorise anything unknown → confirm/dismiss detected recurring → tick "paid Amex
   in full" → done. This is the ritual the app exists to support.
3. **Uncategorised queue.** After an import, a fast one-tap-per-row pass. An import the
   user cannot quickly clean up is an import they stop trusting.
4. **Search + month navigation** in Spending. Finding a transaction is table stakes.
5. **Split `cba` into `cba` and `cba-card`.** One bucket for both a card and an
   everyday account pollutes statement-cycle prediction. Migrate existing data safely.

---

## 6. Non-negotiables carried forward

- Money is integer cents. Never floats.
- Never `console.log` a transaction, amount, merchant, PIN or key.
- No new runtime dependencies, no CDN, no analytics. CSP stays strict.
- Every division guarded; no NaN/Infinity may ever render.
- **Tone: calm and factual, never scolding.** Over-target is information. Hero figures
  stay `--ink-1`; the supporting line carries state.
- Never use a Tailwind opacity suffix on a token-backed colour (`bg-surface/40`) — the
  custom property resolves to a plain hex and the class compiles to nothing.
- All existing check suites keep passing; add new ones for new logic.
