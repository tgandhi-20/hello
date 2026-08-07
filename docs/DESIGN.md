# Tally — design system v2 (FROZEN)

Replaces the v1 tokens in `docs/CONTRACTS.md` §4. Where the two disagree, **this
file wins**. Agents implement exactly these token names and values.

---

## 0. What's wrong with v1, precisely

The user's critique was that it looks like generic AI-generated output. It does.
The specific causes, so we fix causes rather than swap hexes:

1. **Pure `#000000` ground with a saturated violet accent.** That exact pairing is
   the default of every AI-scaffolded dark app. It reads synthetic because nothing
   in the physical world is that black or that violet.
2. **Twelve fully-saturated category hues.** A rainbow at full chroma reads as
   *syntax highlighting*, not as a designed palette. The donut looked like a test
   fixture.
3. **A 1px border on every card.** Drawn boxes everywhere. Real design systems get
   separation from *tone and space*, and reserve drawn lines for where tone can't
   do the job.
4. **Hierarchy carried almost entirely by font size.** No weight, tracking, colour
   or spacing contrast doing work. Everything felt like one flat plane of cards.
5. **Colour used decoratively.** When everything is coloured, colour means nothing.

## 1. Principles

Drawn from Apple HIG (clarity, **deference** — the UI serves the content and never
competes with it), Material 3 (**tonal elevation** — lift via surface tone, not
borders and drop shadows), and editorial finance design.

1. **Surfaces, not boxes.** Elevation comes from tonal steps. Borders are the
   exception, not the default.
2. **Colour is semantic, never decorative.** One accent, used only for interactive
   affordance. Money direction and budget state get their own restrained colours.
   Categories get a muted, *harmonious* ramp that reads as one family.
3. **Typography carries hierarchy.** Weight, tracking and colour do as much work as
   size. Money is set as a display element, not as body text.
4. **Warmth.** Neutrals are warm-shifted; the primary ink is a warm off-white, never
   `#FFFFFF`. This is the single biggest difference between "designed" and "default".
5. **Quiet by default.** A budget app that shouts is a budget app that gets deleted.

---

## 2. Colour tokens

Defined in `src/styles/tokens.css`, exposed through `tailwind.config.js`.
**Never hardcode a hex in a component.**

### Ground — tonal elevation
```
--bg          #07070A   near-black, very slightly cool. Still AMOLED-friendly.
--surface-1   #101015   cards, list groups
--surface-2   #17171E   raised, pressed, input fields
--surface-3   #1F1F27   sheets, menus, popovers
--hairline    #24242D   USE SPARINGLY — only where two same-tone surfaces meet
```

### Ink — warm off-white, never pure
```
--ink-1       #F4F2EE   primary
--ink-2       #A29FA8   secondary
--ink-3       #6C6976   tertiary / disabled
--ink-on-accent #0A0F13
```

### Accent — ONE, for interactive affordance only
```
--accent        #6A93B0   dusty steel blue
--accent-press  #58809C
--accent-tint   rgba(106,147,176,0.14)   selected rows, icon wells
```
Deliberately in the blue half of the wheel so it can never be confused with the
money-direction colours below. Deliberately desaturated so it doesn't read neon.

### Semantic — money direction and budget state ONLY
```
--positive    #6FBF9B   jade — income, under budget
--caution     #E0A458   amber — approaching a cap
--negative    #D2705E   clay — over budget, destructive actions
```
Do **not** use these for decoration. If a number isn't about direction or state, it
is ink, not colour.

### Category ramp — muted, equal-weight, one family
All at roughly equal lightness and low-to-medium chroma, so a donut reads as a
coherent palette rather than a rainbow. Distinguishable without relying on hue
alone (lightness varies enough for colourblind legibility).
```
--cat-1  #7FA8C4   blue        --cat-7   #C47F9B   rose
--cat-2  #6FBF9B   jade        --cat-8   #A87FC4   mauve
--cat-3  #A8C47F   olive       --cat-9   #7F86C4   periwinkle
--cat-4  #E0C25E   wheat       --cat-10  #5E9EA0   teal
--cat-5  #E0A458   amber       --cat-11  #B39B7F   taupe
--cat-6  #D2705E   clay        --cat-12  #8C9199   slate
```

---

## 3. Typography

System stack only — no webfonts (offline + CSP):
`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif`
(Roboto is native on the target Samsung device.)

**Scale** — finer than v1's, with real jumps:
```
text-2xs  11px / 16   labels, chips, captions
text-xs   13px / 18   secondary body, metadata
text-sm   15px / 22   body
text-md   17px / 24   emphasis, list primary
text-lg   22px / 28   section titles
text-xl   30px / 36   secondary figures
text-2xl  40px / 44   hero figures
```

**Money is a display element.** Everywhere an amount appears:
`font-variant-numeric: tabular-nums; letter-spacing: -0.02em; font-weight: 600;`
Hero figures go further: `-0.03em`. Tight tracking on numerals is most of what
separates a designed finance app from a spreadsheet.

**Labels**: `text-2xs`, `--ink-3`, `letter-spacing: 0.02em`. Small, quiet, out of
the way. Do not uppercase everything — reserve it for genuine eyebrow labels.

**Titles**: `text-lg`, weight 600, `letter-spacing: -0.01em`.

Contrast: all text must clear WCAG AA (4.5:1) against its surface. The tightest
pairing is `--ink-3` on **`--surface-3`** — surfaces get *lighter* from `--bg`
upward, so the topmost surface (sheets, menus, popovers) is the hardest ground for
the faintest ink, not `--surface-1`. Measured, the spec's original `--ink-3`
(`#6C6976`) came in at 3.05–3.76:1 and failed normal-text AA on every surface; it
is now `#8C8996`, which clears 4.72:1 against `--surface-3`.

Note also that `--ink-1` on `--accent` is only 2.93:1 — accent-filled controls must
use `--ink-on-accent` (5.88:1), never `--ink-1`.

---

## 4. Shape, elevation, spacing

**Radius**: `8` controls · `14` cards · `22` sheets · pill for chips/toggles.
One radius per role — not one radius everywhere.

**Elevation is tonal.** A raised element uses the next surface token up. No drop
shadows except on genuinely floating elements (FAB, sheets), and then soft and
low-opacity: `0 8px 24px rgba(0,0,0,0.4)`.

**Borders are the exception.** Default cards have **no border** — they separate
from the ground by tone. Use `--hairline` only for row dividers inside a group, or
where two `--surface-1` blocks touch.

**Spacing** — 4px base: `4 8 12 16 20 24 32 40`.
Screen padding 16. Card padding 16–20. Gap between sections 24.
Group related rows into ONE surface with hairline dividers rather than giving each
its own card — that alone removes most of the v1 box-soup.

**Motion**: 140–180ms, `cubic-bezier(0.2, 0, 0, 1)`. transform/opacity only.
Honour `prefers-reduced-motion`.

---

## 5. Component direction

- **Cards** — no border, `--surface-1`, radius 14, padding 16–20. Title `text-lg`,
  optional `text-2xs` eyebrow above it in `--ink-3`.
- **Hero figure** — `text-2xl`, weight 600, tracking -0.03em, `--ink-1`. Its
  supporting line is `text-xs` in `--ink-2`. Never colour a hero figure unless it
  is genuinely negative.
- **List rows** — one surface, hairline dividers, 56px min height, chevron in
  `--ink-3`. Not one card per row.
- **Category icon** — icon in `--cat-N` on a 12%-alpha well of the same hue. Not a
  fully saturated filled circle.
- **Charts** — category ramp only; axes and gridlines in `--hairline`; labels
  `text-2xs` in `--ink-3`. No gradients, no glow.
- **Tab bar** — `--surface-1`, hairline top edge, active item `--accent`, inactive
  `--ink-3`. FAB `--accent` with `--ink-on-accent` glyph.
- **Over-budget state** — the *number* turns `--negative`. The card does not turn
  red, does not gain a red border, does not gain a warning icon. Per CONTRACTS §4
  this app never scolds.

---

## 6. Acceptance

A screen is done when:
- No `#` hex appears in any component file.
- No card has a border unless it earns one.
- Every money figure is tabular, weight 600, negatively tracked.
- Colour appears only where it carries meaning.
- Text contrast clears AA at every level.
- It looks deliberate at 412×915 on true-to-device screenshots — not merely tidy.
