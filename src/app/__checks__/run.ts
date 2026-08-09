/**
 * Reachability check: every top-level feature "Screen" component exported from a
 * feature's `index.ts` barrel (`src/features/<feature>/index.ts`) must be
 * referenced somewhere under `src/app/**`.
 *
 * Why this exists: a feature can be fully built and fully tested (its own
 * `__checks__/run.ts` green) and still never render in the actual app, because
 * nothing under `src/app/**` imports it — no route, no nav entry, no mount point.
 * This has happened twice now (five orphaned screens in one round, the statements
 * feature unreachable in the next), always because a feature agent isn't allowed to
 * touch `src/app/**` itself and the wiring step got silently dropped. A screen with
 * 100+ passing assertions that no user can ever open is a shipped bug, not a win.
 *
 * Deliberately dumb: reads files off disk and pattern-matches, the same way the
 * import pipeline's checks do (see `src/import/__checks__/run.ts`) — no test
 * framework, no React renderer, no module execution. It cannot know whether a
 * route is *reachable in practice* (e.g. behind a broken nav link), only whether
 * the component's identifier appears anywhere in the app tree at all. That's a
 * floor, not a ceiling — but it is exactly the floor the statements bug fell
 * through.
 *
 * Run with: `npx tsx src/app/__checks__/run.ts`
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '../../');
const FEATURES_DIR = join(SRC_DIR, 'features');
const APP_DIR = join(SRC_DIR, 'app');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(detail ? `${name} — ${detail}` : name);
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Recursively collect every .ts/.tsx file under `dir`. */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (isDir(full)) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve a relative import specifier (no extension) to an actual .ts/.tsx file. */
function resolveRelativeModule(baseNoExt: string): string | null {
  for (const ext of ['.tsx', '.ts']) {
    const candidate = baseNoExt + ext;
    if (isFile(candidate)) return candidate;
  }
  // Directory with its own index — not expected for this codebase's *Screen files,
  // but handled for robustness.
  for (const ext of ['.tsx', '.ts']) {
    const candidate = join(baseNoExt, 'index' + ext);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Every identifier ending in "Screen" that a feature's `index.ts` barrel exposes,
 * however it does so — a direct named re-export (`export { FooScreen } from
 * './FooScreen'`) or a wildcard re-export (`export * from './FooScreen'`, in which
 * case we open that module and read its own exported `Screen` identifiers).
 */
function screenExportsFromIndex(indexPath: string, featureDir: string): string[] {
  const text = readFileSync(indexPath, 'utf8');
  const names = new Set<string>();

  const namedRe = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = namedRe.exec(text))) {
    for (const raw of m[1].split(',')) {
      const piece = raw.trim();
      if (!piece || piece.startsWith('type ')) continue;
      const [orig] = piece.split(/\s+as\s+/);
      const name = orig.trim();
      if (/Screen$/.test(name)) names.add(name);
    }
  }

  const starRe = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = starRe.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue; // only local re-exports can hold a Screen
    const resolved = resolveRelativeModule(join(featureDir, spec));
    if (!resolved) continue;
    const modText = readFileSync(resolved, 'utf8');
    const declRe = /export\s+(?:function|const)\s+(\w*Screen)\b/g;
    let dm: RegExpExecArray | null;
    while ((dm = declRe.exec(modText))) names.add(dm[1]);
  }

  return [...names];
}

async function main(): Promise<void> {
  console.log('--- Tally app reachability checks ---\n');

  const featureDirs = readdirSync(FEATURES_DIR).filter((f) => isDir(join(FEATURES_DIR, f)));
  check('at least one feature directory found', featureDirs.length > 0, `found ${featureDirs.length}`);

  const appFiles = collectSourceFiles(APP_DIR);
  // Exclude this check script itself from the haystack — it legitimately mentions
  // "Screen" in prose/regexes and must never count as "the app referencing it".
  const haystackFiles = appFiles.filter((f) => f !== join(__dirname, 'run.ts'));
  const haystack = haystackFiles.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

  check('at least one src/app source file found', haystackFiles.length > 0, `found ${haystackFiles.length}`);

  let screensChecked = 0;

  for (const feature of featureDirs) {
    const featureDir = join(FEATURES_DIR, feature);
    const indexPath = join(featureDir, 'index.ts');
    if (!isFile(indexPath)) continue; // e.g. src/features/settings has no barrel; nothing to check here

    const screenNames = screenExportsFromIndex(indexPath, featureDir);
    for (const name of screenNames) {
      screensChecked++;
      const wordBoundary = new RegExp(`\\b${name}\\b`);
      const referencedIn = haystack.find((h) => wordBoundary.test(h.text));
      check(
        `${feature}: "${name}" is referenced under src/app/**`,
        Boolean(referencedIn),
        referencedIn
          ? undefined
          : `exported from src/features/${feature}/index.ts but no file under src/app matches /\\b${name}\\b/ — ` +
            `it is built and (probably) tested, but unreachable in the running app. Add a route in ` +
            `src/app/App.tsx and a src/app/screens/${name}.tsx re-export (see existing screens for the pattern), ` +
            `plus a nav entry wherever makes sense (e.g. src/app/screens/MoreScreen.tsx).`
      );
    }
  }

  check('at least one feature Screen export was actually checked', screensChecked > 0, `checked ${screensChecked}`);

  // Sanity: every route file under src/app/screens should itself be imported by App.tsx,
  // catching the inverse mistake (a screen file that exists but was never added to the
  // router either). Cheap and in the same spirit as the check above.
  const appTsxPath = join(APP_DIR, 'App.tsx');
  if (isFile(appTsxPath)) {
    const appTsxText = readFileSync(appTsxPath, 'utf8');
    const screensDir = join(APP_DIR, 'screens');
    if (isDir(screensDir)) {
      for (const entry of readdirSync(screensDir)) {
        if (!/\.tsx?$/.test(entry)) continue;
        if (entry === 'MenuScreen.tsx') continue; // navigation chrome, not a routed screen file re-export
        const componentName = entry.replace(/\.tsx?$/, '');
        const importedRe = new RegExp(`\\b${componentName}\\b`);
        check(
          `src/app/screens/${entry} is imported by App.tsx`,
          importedRe.test(appTsxText),
          `"${componentName}" not found in src/app/App.tsx — a screen file that exists but was never routed`
        );
      }
    }
  }

  // ===================================================================
  // IA reachability (DESIGN-V4.md §2) — the specific 3-tab structure this
  // round of work exists to land, checked explicitly rather than trusting
  // the generic scan above alone. That scan proves a Screen is referenced
  // SOMEWHERE under src/app/**; it says nothing about whether it's actually
  // wired into the right tab, whether Menu actually links to it, or whether
  // an old bookmark still resolves. Deliberately dumb, same spirit as the
  // rest of this file: substring matches on file text, no module execution.
  // ===================================================================
  {
    const tabBarPath = join(APP_DIR, 'shell/TabBar.tsx');
    const appTsxPath2 = join(APP_DIR, 'App.tsx');
    const menuScreenPath = join(APP_DIR, 'screens/MenuScreen.tsx');
    if (isFile(tabBarPath) && isFile(appTsxPath2) && isFile(menuScreenPath)) {
      const tabBarText = readFileSync(tabBarPath, 'utf8');
      const appTsxText = readFileSync(appTsxPath2, 'utf8');
      const menuScreenText = readFileSync(menuScreenPath, 'utf8');

      // Exactly 3 tab-bar slots: Home and Menu are entries in the `TABS` array
      // literal (`to: '/…'`); the centre FAB is a standalone `<NavLink to="/log">`
      // rather than a TABS entry (it's visually a FAB, not a text+icon tab), so
      // it's checked with the JSX-attribute form instead. The OLD 5-slot destinations
      // (Spending, Plan, More) must be GONE from the tab bar — collapsing to 3 tabs
      // is the entire point of this round; their reappearing here would mean the
      // maze grew back.
      for (const dest of ["to: '/'", "to: '/menu'"]) {
        check(`TabBar.tsx routes to ${dest}`, tabBarText.includes(dest));
      }
      check('TabBar.tsx FAB routes to /log (quick-add)', tabBarText.includes('to="/log"'));
      for (const gone of ["to: '/spending'", "to: '/plan'", "to: '/more'"]) {
        check(`TabBar.tsx no longer routes to ${gone} (collapsed into Menu)`, !tabBarText.includes(gone));
      }

      // Home mounted at '/'.
      check("App.tsx mounts TodayScreen at '/'", /path="\/"\s*element=\{<TodayScreen/.test(appTsxText));

      // Menu mounted at '/menu', and the Spending/Plan container screens are gone —
      // no nested sub-tab strip left anywhere in the router.
      check("App.tsx mounts MenuScreen at '/menu'", /path="\/menu"\s*element=\{<MenuScreen/.test(appTsxText));
      check('App.tsx no longer has a /spending container route', !appTsxText.includes('<SpendingScreen'));
      check('App.tsx no longer has a /plan container route', !appTsxText.includes('<PlanScreen'));

      // Every destination that used to live under a container's sub-tab strip is now
      // its own flat top-level route — no nested path segments left for them.
      for (const flat of [
        '/transactions',
        '/budgets',
        '/recurring',
        '/statements',
        '/goal',
        '/import',
        '/review',
        '/backup',
        '/help',
        '/settings',
      ]) {
        const mountedRe = new RegExp(`path="${flat}"[^>]*element=\\{<`);
        check(`App.tsx mounts ${flat} as a flat top-level route`, mountedRe.test(appTsxText));
      }

      // Every OLD route path must still resolve — either it's one of the flat
      // canonical paths above (checked already) or it redirects (redirect is enough
      // — see App.tsx's own doc comment). A user's saved bookmark or an in-app
      // `navigate(...)` call this agent didn't find must not 404.
      for (const legacy of [
        '/spending',
        '/spending/transactions',
        '/spending/trends',
        '/spending/habits',
        '/plan',
        '/plan/goal',
        '/plan/budgets',
        '/plan/recurring',
        '/plan/statements',
        '/plan/routine',
        '/more',
      ]) {
        const redirectRe = new RegExp(`path="${legacy}"[^>]*element=\\{<Navigate`);
        check(`Legacy path ${legacy} still resolves (redirected, not 404)`, redirectRe.test(appTsxText));
      }

      // Menu (DESIGN-V4.md §2/§3) links to every one of its specified destinations,
      // with the exact labels the spec gives — not just "some link exists somewhere".
      const MENU_ROWS: { to: string; label: string }[] = [
        { to: '/transactions', label: 'All transactions' },
        { to: '/budgets', label: 'Budgets' },
        { to: '/recurring', label: 'Regular payments' },
        { to: '/statements', label: 'Card balances' },
        { to: '/goal', label: 'Deposit plan' },
        { to: '/import', label: 'Import statements' },
        { to: '/review', label: 'Weekly catch-up' },
        { to: '/backup', label: 'Backup & restore' },
        { to: '/help', label: 'How Tally works' },
        { to: '/settings', label: 'Settings' },
      ];
      for (const row of MENU_ROWS) {
        check(`MenuScreen.tsx links to ${row.to}`, menuScreenText.includes(`to: '${row.to}'`));
        check(`MenuScreen.tsx labels ${row.to} "${row.label}"`, menuScreenText.includes(`label: '${row.label}'`));
      }
      for (const heading of ['Money', 'Saving', 'Data', 'App']) {
        check(`MenuScreen.tsx has the "${heading}" section heading`, menuScreenText.includes(`>${heading}<`));
      }
    } else {
      check('TabBar.tsx, App.tsx and MenuScreen.tsx all exist to run the IA structure checks', false);
    }
  }

  console.log(`\n--- ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Check script crashed:', err);
  process.exitCode = 1;
});
