/**
 * "How Tally works" — the words, kept separate from the layout so this file
 * reads as writing and `__checks__/run.ts` can assert on it directly (tone,
 * banned jargon, no exclamation marks) without touching React.
 *
 * DESIGN-V4.md §4.3: half a screen, plain English, the equation, and what the
 * app can/cannot see. No jargon, no feature tour, no FAQ-accordion headings —
 * this reads as prose, in order, the way the deliverable brief asks for it.
 */

export const LEAD = 'One calculation runs everything in Tally. This is yours, right now:';

export const BILLS_DEFINITION =
  'Bills means the stuff that repeats and is already spoken for — rent, utilities, subscriptions.';

export const SAVINGS_DEFINITION =
  "Savings is the deposit, taken off the top before anything else — paid first, not last, because that's the only way it actually happens.";

/** The single most important honesty statement in the app (deliverable 1, point 3). */
export const WHAT_IT_SEES =
  "Tally only knows what you tell it. It sees the transactions you log and the statements you import — nothing else. It cannot see your bank balance, so Left is not your account balance; it is what your plan says you can still spend, based on what Tally knows about so far. Anything you haven't logged yet isn't counted, so the real number in your account is usually a little lower than the one on this screen.";

export const WHERE_DATA_LIVES =
  'Everything you enter stays on this phone, encrypted. There is no account and no server — which also means there is no backup unless you make one. Export a backup from Settings whenever it matters to you.';

export interface WhyEntry {
  q: string;
  a: string;
}

/** Written as prose transitions, not FAQ headings — rendered as short paragraphs, each opening with its own question folded into the first sentence. */
export const WHY_ENTRIES: readonly WhyEntry[] = [
  {
    q: 'Why did Left drop on its own?',
    a: "Left can drop on its own the moment Tally spots a bill it hasn't seen before, like a subscription. You didn't spend anything extra — the plan is just catching up to a bill that was always coming.",
  },
  {
    q: "Why doesn't paying my card count as spending?",
    a: "Paying off your own credit card from your own account isn't counted as spending. It's money moving between two places you already have, not a new expense — the expense happened earlier, when the card was actually used.",
  },
];

export const TITLE = 'How Tally works';

export const INCOME_UNSET_MESSAGE = "Add your income in Settings and this page will show your own equation, with your own numbers.";
