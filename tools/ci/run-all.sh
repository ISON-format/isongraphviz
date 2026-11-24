#!/usr/bin/env bash
# Run npm steps over every package in dependency order (the packages link each other with file: dependencies,
# so a package must be installed and built before the packages that use it).
#   usage: tools/ci/run-all.sh STEP [STEP...]        STEP = install | any npm script name of a package (skipped where absent)
# Mutation steps: `mutants` (or `mutate` in stable-layout-core). A matrix that exits non-zero passes only if every
# survivor is one of the documented equivalent mutants listed below; anything else fails the run.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ORDER=(scene-core layout-core stable-layout-core lod-core renderer-core renderer-svg display-list renderer-canvas
       renderer-webgl cross-check interaction-core a11y-companion export-core bench)
fail=0

has_script() { node -e "process.exit(require('./package.json').scripts['$1']?0:1)"; }

mutants_ok() { # $1 package, $2 log: true when the only survivors are the documented equivalents
  case "$1" in
    export-core)
      grep -q 'harness-error 0' "$2" && grep -q 'inconclusive 0' "$2" || return 1
      [ "$(awk -F'\t' '$2=="SURVIVED"{print $1}' "$2" | sort | tr '\n' ' ')" = "ext:E16 ext:K112-scan " ] ;;
    stable-layout-core)
      grep -q ', 0 inconclusive, ' "$2" || return 1
      [ "$(grep -c '^SURVIVED ' "$2")" = "2" ] && [ "$(grep '^SURVIVED ' "$2" | grep -vc 'declared equivalent')" = "0" ] ;;
    *) return 1 ;;
  esac
}

for p in "${ORDER[@]}"; do
  cd "$ROOT/packages/$p" || exit 2
  for step in "$@"; do
    if [ "$step" = install ]; then
      echo "::group::$p install"; npm ci --ignore-scripts --no-audit --no-fund || { echo "FAILED: $p install"; fail=1; }; echo "::endgroup::"
      continue
    fi
    has_script "$step" || continue
    echo "::group::$p $step"
    if [ "$step" = mutants ] || [ "$step" = mutate ]; then
      log="$(mktemp)"; npm run "$step" 2>&1 | tee "$log"; rc=${PIPESTATUS[0]}
      if [ "$rc" -ne 0 ] && mutants_ok "$p" "$log"; then echo "ok: only documented equivalent survivors"; rc=0; fi
    else
      npm run "$step"; rc=$?
    fi
    echo "::endgroup::"
    [ "$rc" -eq 0 ] && echo "ok $p $step" || { echo "FAILED: $p $step (exit $rc)"; fail=1; }
  done
done
exit $fail
