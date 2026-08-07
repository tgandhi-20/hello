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
        if (entry === 'MoreScreen.tsx') continue; // navigation chrome, not a routed screen file re-export
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
