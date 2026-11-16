#!/usr/bin/env bash
# usage: bash tools/v0/run-baseline.sh <scratch dir containing core/ and viz/vscode-isongraphviz/ extracted copies>
# V0.7 baseline runner. Each command: full log kept, real exit code recorded (no pipe masks it), wall time recorded.
# Local tooling only: a missing executable is a recorded finding, never fetched with npx.
set -u
V0="$1"
RES="$V0/logs/results.tsv"
: > "$RES"

run() { # name dir cmd...
  local name="$1" dir="$2"; shift 2
  local log="$V0/logs/$name.log"
  local s e rc
  s=$(date +%s.%N)
  ( cd "$dir" && "$@" ) > "$log" 2>&1
  rc=$?
  e=$(date +%s.%N)
  printf '%s\t%s\t%s\t%.1f\t%s\n' "$name" "$rc" "$*" "$(echo "$e - $s" | bc 2>/dev/null || awk "BEGIN{print $e-$s}")" "$log" >> "$RES"
  echo "[$name] exit=$rc"
}

TS="$V0/core/ison-graph-ts"
run ts-npm-ci "$TS" npm ci --ignore-scripts --no-audit --no-fund
run ts-typecheck "$TS" ./node_modules/.bin/tsc --noEmit -p tsconfig.json
run ts-build "$TS" npm run build
run ts-test "$TS" npm test
run ts-lint "$TS" npm run lint

PY="$V0/core/ison-graph"
export PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PY/src"
run py-version "$PY" python --version
run py-pytest-viz "$PY" python -B -m pytest tests/test_viz.py -q -p no:cacheprovider
run py-pytest-all "$PY" python -B -m pytest tests -q -p no:cacheprovider

VZ="$V0/viz/vscode-isongraphviz"
run viz-npm-ci "$VZ" npm ci --ignore-scripts --no-audit --no-fund
run viz-compile "$VZ" ./node_modules/.bin/tsc -p ./
