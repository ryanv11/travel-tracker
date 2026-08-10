#!/usr/bin/env bash
# Scope completeness check — QUAL-43 / ADL-53 §6 "Stage 0 detail" (the F1 fold).
#
# Asserts ZERO residual hand-authored userId ownership logic in the production
# repository sources. Every ownership expression must resolve through the
# chokepoint in `src/backend/repositories/scope.ts` (`scopeToUser` / `ownedAnd`
# / `assertOwned` / `assertWritable`), so that "who may see this row" has exactly
# one definition — the property Phase-3 sharing (ADL-53 D7/§7) depends on.
#
# TWO patterns are matched, because ownership was expressed two ways (ADL-53 F1)
# and a predicate-only grep sails straight past the second:
#
#   1. SQL predicate    — `eq(<table>.userId, ...)`
#   2. JS comparison    — `<expr>.userId === / !== <expr>`   (a write-gate check
#                         re-deriving ownership in application code instead of
#                         composing the predicate)
#
# Without pattern 2, a grep-driven refactor collapses the predicates and silently
# leaves the write gates as a SECOND, independent definition of "owned".
#
# PERMITTED MATCHES
#   Pattern 1 is permitted ONLY in `scope.ts`, which necessarily contains the one
#   definition. Pattern 2 is permitted NOWHERE, including `scope.ts` — the
#   chokepoint expresses ownership as SQL, never as an application-layer compare.
#
# SCOPE — production repository sources only: `src/backend/repositories/*.ts`,
#   excluding `__tests__/`. COO decision (2026-08-10): the intent is "zero
#   hand-authored PRODUCTION ownership logic". Test files legitimately assert on
#   a row's userId (e.g. `repositories/__tests__/shadingConfig.test.ts`) — those
#   are assertions about data, not ownership logic, and rewriting them to satisfy
#   a grep would weaken the tests to flatter the check. The exclusion stops at
#   `__tests__`: anything else that matches is a residual to FIX, not to exempt
#   (OP-30 — widening a scanner's suppression is not an implementer's call).
#
# BLIND SPOT (stated, not silently accepted): this matches TEXT, not syntax, so a
# comment quoting either pattern trips it. That is deliberate — it fails closed.
# The fix is to reword the comment (OP-30: fix your own text), never to add an
# exemption here.
#
# Re-run by Stages 4 and 5, which must re-verify this same invariant.
# Usage: scripts/scope-completeness-check.sh [repo-root]

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
REPO_DIR="$ROOT/src/backend/repositories"
CHOKEPOINT="scope.ts"

PREDICATE_RE='eq\([A-Za-z_$][A-Za-z0-9_$]*\.userId'
JS_COMPARE_RE='\.userId[[:space:]]*[!=]=='

if [ ! -d "$REPO_DIR" ]; then
  echo "scope-completeness-check: FAIL — repository directory not found: $REPO_DIR" >&2
  exit 1
fi

# Production repository sources only — `find -maxdepth 1` excludes `__tests__/`.
mapfile -t FILES < <(find "$REPO_DIR" -maxdepth 1 -name '*.ts' -type f | sort)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "scope-completeness-check: FAIL — no repository sources found under $REPO_DIR" >&2
  exit 1
fi

# The chokepoint must exist and must actually define the predicate. Without this,
# deleting scope.ts would make every other check pass vacuously.
if [ ! -f "$REPO_DIR/$CHOKEPOINT" ]; then
  echo "scope-completeness-check: FAIL — the chokepoint $CHOKEPOINT is missing." >&2
  exit 1
fi
if ! grep -Eq "$PREDICATE_RE" "$REPO_DIR/$CHOKEPOINT"; then
  echo "scope-completeness-check: FAIL — $CHOKEPOINT no longer defines the ownership" >&2
  echo "  predicate. The chokepoint is the ONE place ownership may be written by hand;" >&2
  echo "  if it moved, update this check and ADL-53 §2 together." >&2
  exit 1
fi

residuals=0

for f in "${FILES[@]}"; do
  rel="${f#"$ROOT"/}"
  base="$(basename "$f")"

  # Pattern 1 — SQL predicate. Permitted only in the chokepoint itself.
  if [ "$base" != "$CHOKEPOINT" ]; then
    while IFS=: read -r lineno text; do
      [ -n "$lineno" ] || continue
      echo "RESIDUAL $rel:$lineno — hand-authored ownership predicate"
      echo "    ${text#"${text%%[![:space:]]*}"}"
      echo "    → compose the chokepoint instead: scopeToUser(<table>, userId)"
      echo "      or ownedAnd(<table>, userId, ...conditions)  [scope.ts]"
      residuals=$((residuals + 1))
    done < <(grep -nE "$PREDICATE_RE" "$f" || true)
  fi

  # Pattern 2 — application-layer ownership comparison. Permitted nowhere.
  while IFS=: read -r lineno text; do
    [ -n "$lineno" ] || continue
    echo "RESIDUAL $rel:$lineno — ownership re-derived in application code"
    echo "    ${text#"${text%%[![:space:]]*}"}"
    echo "    → express it as an existence check through the chokepoint:"
    echo "      assertOwned(userId, tripId) / assertWritable(userId, tripId)  [scope.ts]"
    residuals=$((residuals + 1))
  done < <(grep -nE "$JS_COMPARE_RE" "$f" || true)
done

if [ "$residuals" -gt 0 ]; then
  echo ""
  echo "scope-completeness-check: FAIL — $residuals residual ownership site(s) outside the chokepoint."
  echo "  ADL-53 §6 Stage 0: every ownership expression in src/backend/repositories/**"
  echo "  must resolve through src/backend/repositories/scope.ts."
  exit 1
fi

echo "scope-completeness-check: PASS — ${#FILES[@]} production repository source(s) scanned;"
echo "  every ownership expression resolves through repositories/$CHOKEPOINT."
