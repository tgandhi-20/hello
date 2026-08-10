#!/usr/bin/env bash
#
# Fast source checks that run BEFORE Gradle.
#
# CI is the only Kotlin compiler in this project — there is no Android SDK in
# the dev container — so every mistake normally costs a push and a three-minute
# build. Anything catchable by reading the text is worth catching here instead.
#
# Runs in well under a second. Add a check when a class of error costs a round
# trip more than once.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# ---------------------------------------------------------------------------
# 1. Nested block comments.
#
# Kotlin block comments NEST. `/*` inside a comment opens a second one, and the
# closing `*/` then closes only the inner. The outer comment swallows the rest
# of the file, and the compiler reports "Unclosed comment" at the LAST line —
# pointing nowhere near the actual text that caused it.
#
# This bit the project for real: four agents were each briefed to own a package
# glob, and each faithfully wrote `capture/**`, `ui/**`, `data/**` into a KDoc
# comment. Nineteen occurrences across twelve files, eleven compile errors, all
# from documentation prose. `docs/samples/*.example.csv` did it too.
#
# The rule is simply that `/*` must never appear inside a comment, so this
# looks for a slash-star preceded by a word character — which no legitimate
# comment opener ever is, since those start a line or follow whitespace.
if hits=$(grep -rn '[A-Za-z0-9_)`]/\*' --include='*.kt' app/src 2>/dev/null); then
  echo "ERROR: '/*' inside a comment opens a nested block comment in Kotlin."
  echo "The outer comment then runs to end-of-file. Write 'ui/' not 'ui/**'."
  echo
  echo "$hits"
  fail=1
fi

# ---------------------------------------------------------------------------
# 2. The INTERNET permission.
#
# docs/ANDROID-NATIVE.md §3: this app holds a decrypted ledger and has
# notification-listener access. The guarantee that none of it can leave the
# device rests on the permission being ABSENT, so the OS enforces it rather
# than a code review. That is only worth something if something checks.
#
# Parsed as XML, not grepped. The manifest deliberately CONTAINS the string
# "android.permission.INTERNET" — inside a comment explaining why it must never
# be added. A line-based grep flags that comment and reports a violation that
# does not exist, which is how a guard gets switched off. ElementTree drops
# comments, so this sees only real elements.
if ! python3 - <<'PY'
import sys, xml.etree.ElementTree as ET
NS = '{http://schemas.android.com/apk/res/android}'
root = ET.parse('app/src/main/AndroidManifest.xml').getroot()
bad = [p.get(NS + 'name') for p in root.findall('uses-permission')
       if p.get(NS + 'name') == 'android.permission.INTERNET']
if bad:
    print("ERROR: the INTERNET permission is declared in AndroidManifest.xml.")
    print("See docs/ANDROID-NATIVE.md section 3. Its absence is load-bearing.")
    sys.exit(1)
PY
then
  fail=1
fi

# ---------------------------------------------------------------------------
# 3. Floating-point money.
#
# Integer cents everywhere. A Double holding money is the bug that silently
# turns $1,234.56 into 123455 cents.
#
# The obvious check — flag every Double in the codebase — was tried and
# discarded: it fired 26 times on correct code (confidence scores, tax rates,
# cadence tolerances, a 52.0/12.0 weeks-per-month constant). A warning that
# cries wolf on correct code teaches everyone to skip it, which costs more
# than it saves.
#
# So this checks the one rule with no legitimate exception: anything NAMED
# cents is Long. Narrow and silent beats broad and ignored.
if hits=$(grep -rniE '\b[a-z_]*cents\b[^=]*:\s*(Double|Float)\b' --include='*.kt' app/src 2>/dev/null); then
  echo "ERROR: a value named *Cents is typed Double/Float. Money is Long cents."
  echo "$hits"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "Source checks failed."
  exit 1
fi
echo "Source checks passed."
