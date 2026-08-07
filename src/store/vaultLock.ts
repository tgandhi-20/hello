/**
 * Tally — whole-vault write lock (P0 fix: PIN-rotation / backup-restore
 * orphaning a concurrent write — see useStore.ts's `setUnlockSecret` and
 * `importBackup` doc comments for the bug this closes).
 *
 * THE RACE THIS PREVENTS
 * `setUnlockSecret` (PIN/passphrase change) and `importBackup` are the only
 * two "vault-wide" operations: each snapshots everything, spends real time
 * re-encrypting it under a different key, then flips which key `unlock()`
 * trusts. If an ordinary mutation (addTxn, updateTxn, ...) lands in the
 * middle of that window it gets written under the OLD key, but it is not
 * part of the operation's snapshot — so once the key pointer flips, that
 * record can never be decrypted again. QA reproduced this with two tabs open
 * on the same origin: Tab A rotating the PIN, Tab B saving a transaction at
 * the worst possible instant.
 *
 * THE FIX
 * Every operation that writes an encrypted record — every ordinary mutation
 * AND both vault-wide operations — acquires this same named lock before it
 * touches IndexedDB, and holds it for the entire critical section (through
 * `setUnlockSecret`'s verify-then-flip-meta step, through `importBackup`'s
 * clear-then-restore). Because it's one shared queue, a transaction typed
 * the instant after a PIN change simply waits its turn and lands correctly
 * under the new key a moment later — it is queued, never lost and never
 * silently orphaned.
 *
 * CROSS-TAB, NOT JUST CROSS-CALL
 * The QA repro used two separate tabs, which are two separate JS realms — an
 * ordinary in-process mutex (a promise chain in one module's memory) cannot
 * see across that boundary. The native Web Locks API (`navigator.locks`,
 * supported in every browser this PWA targets) is exactly the browser
 * primitive for this: a named lock queued and honoured across every
 * same-origin tab/worker, no server and no new dependency required
 * (CONTRACTS.md §1 — native browser API only). Where it's unavailable
 * (very old/locked-down browsers) this falls back to an in-process promise
 * queue, which at least keeps a single tab safe.
 *
 * NOT REENTRANT — do not call `withVaultLock` from inside a function that is
 * already running inside another `withVaultLock` call; the second request
 * would queue behind the first and neither would ever finish. Compose at the
 * call site instead (await one wrapped call, then await the next) — see how
 * `loadDemoData` calls `addTxns` then `updateSettings` without wrapping
 * itself.
 */

const LOCK_NAME = 'tally-vault-write';

// In-process fallback for browsers without `navigator.locks`. A plain
// promise chain: each call attaches its work after the previous call's
// settles (success OR failure — a failed op must not wedge the queue for
// everyone behind it).
let fallbackTail: Promise<void> = Promise.resolve();

let pendingCount = 0;

/**
 * How many vault-write operations are currently queued or running (including
 * whichever one is actually executing). Exposed so UI can show a "please
 * wait" state during a rotation/restore if it wants to — not required, since
 * the point of this mechanism is that callers don't have to: they just wait.
 */
export function vaultLockPending(): number {
  return pendingCount;
}

/**
 * Run `fn` exclusively with respect to every other `withVaultLock` call, in
 * this tab and (via the Web Locks API) every other same-origin tab. Returns
 * or throws whatever `fn` does.
 */
export function withVaultLock<T>(fn: () => Promise<T>): Promise<T> {
  pendingCount++;
  const release = () => {
    pendingCount--;
  };

  const hasWebLocks =
    typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';

  if (hasWebLocks) {
    // Settle our own promise from inside the granted callback rather than
    // relying on `request()`'s generic to carry `fn`'s result back out.
    // `lib.dom.d.ts` types `LockGrantedCallback<T>` as `(lock) => T` with no
    // `PromiseLike<T>` unwrapping, so an async callback that actually
    // returns `T` (as opposed to `Promise<T>`, which is what an async
    // function's return type always structurally is) can't be expressed —
    // this sidesteps that typing gap entirely rather than fighting it.
    return new Promise<T>((resolve, reject) => {
      void navigator.locks.request(LOCK_NAME, async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          release();
        }
      });
    });
  }

  // Fallback: chain onto the local queue. `result` carries fn's real
  // outcome back to the caller; `fallbackTail` deliberately swallows it so
  // the queue itself never becomes a rejected promise (which would poison
  // every future `.then` chained onto it). Wrapped in `() => fn()` (rather
  // than passing `fn` directly as both handlers) so TypeScript infers a
  // plain `Promise<T>`, not `Promise<Promise<T>>>`, from the flatten.
  const result: Promise<T> = fallbackTail.then(
    () => fn(),
    () => fn()
  );
  fallbackTail = result.then(
    () => undefined,
    () => undefined
  );
  result.then(release, release);
  return result;
}
