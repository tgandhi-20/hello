# v5 — the CBA structure, adapted honestly

The user knows the CommBank app well and finds it easy to use. This adopts its
information architecture. It does not adopt its branding, and it does not adopt
the one part of it Tally cannot tell the truth about.

---

## 1. What makes the CBA app good, and which parts transfer

| CBA pattern | Transfers? | Why |
|---|---|---|
| Home is your **accounts**, not a dashboard | **Yes** | You think in accounts. "How much is on the Amex" is the real question. |
| Tap an account → its **transaction list** | **Yes** | The one navigation move you make constantly. |
| **Running balance** on every row | **Yes, per account** | It is how you check a statement against reality. |
| **Search transactions** everywhere | **Yes** | Their search is genuinely better than most banks'. |
| **Spend tracker** — categories, by month | **Yes** | Tally already computes exactly this. |
| Compact, dense list rows; big balance at top | **Yes** | Reads fast one-handed. |
| **Live available balance** | **NO** | See §2. This is the important one. |
| Pay / transfer / BPAY | **No** | Tally cannot move money and never should. |
| Card controls, offers, rewards | **No** | Nothing to control. |
| Yellow-and-black branding, CBA logotype | **No** | See §4. |

## 2. The part that cannot be copied: balances

CBA's home screen works because the number next to each account is **true right
now**. The bank knows. Tally does not: there is no Open Banking connection, and
the only inputs are CSV imports and captured notifications.

So Tally's account rows show a **derived** balance — the sum of what has been
imported for that account — and must label it as exactly that:

> **Amex — $1,204.55**
> from your imports, to 2 Aug

Rules, non-negotiable:

- **Never** the words "available", "current" or "balance" unqualified. Those are
  bank words and they promise something Tally cannot deliver.
- Always the date it is good to. A figure with no as-at date is a lie by omission.
- When an account has no imports, the row says "nothing imported yet" — not `$0.00`.
  Zero and unknown are different, and showing `$0.00` for unknown is the single
  most dangerous thing this screen could do.
- The Amex row is the one that matters most: it is a credit card at 23.99%, so
  the figure is money **owed**, not money held, and the row says so.

This is the one place Tally must look *less* confident than CBA, on purpose.

## 3. The new structure

```
Home            accounts list, with the equation summary above it
  └ Account     that account's transactions, running balance, search
      └ Txn     detail: category, note, exclude, delete
Spend           categories by month — the spend tracker
⊕               quick add (unchanged)
More            everything else (budgets, goal, recurring, import, settings…)
```

Four tabs: **Home · Spend · ⊕ · More**.

The equation stays, as a card at the top of Home, above the accounts. It is the
one number that answers "can I spend this" and it is why this app exists rather
than a bank app. Accounts answer "where is my money"; the equation answers
"what is left". Both, in that order.

`DESIGN-V4`'s rule still governs everything: **if two numbers on screen could
ever disagree, one of them must go.** Account balances are derived from the same
ledger as the equation, in the same pass.

## 4. What we deliberately do not take

The CBA palette, logotype, iconography and typeface are CommBank's. Copying them
would make a personal budget app look like a banking app it is not — which is
both an impersonation problem and a safety one, because a screen that looks like
your bank teaches you to trust it like your bank.

Tally keeps its own palette (`DESIGN-V3` §1). What is being borrowed is the
*structure*: what is on the first screen, what a tap does, and how a transaction
list reads. That is the part that makes their app easy, and none of it is theirs
to own.
