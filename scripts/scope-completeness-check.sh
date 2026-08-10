#!/usr/bin/env bash
# Backend scope guards — QUAL-43 / ADL-53.
#
# ONE instrument, TWO invariants. They are deliberately in the same script
# rather than two: they are adjacent assertions about the same property (where
# ownership may be expressed, and where the DB handle may be obtained), and two
# scripts asserting adjacent invariants is how they drift apart.
#
#   CHECK 1 — Ownership completeness  (ADL-53 §6 Stage 0, widened by Stage 3)
#   CHECK 2 — No `getDb` in routes    (ADL-53 §3 item 1, authored by Stage 3)
#
# Usage: scripts/scope-completeness-check.sh [repo-root]
#
# ================================================================
# CHECK 1 — Ownership completeness
# ================================================================
#
# Asserts ZERO residual hand-authored userId ownership logic in the production
# backend sources. Every ownership expression must resolve through the
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
# SCOPE — WIDENED 2026-08-10 by QUAL-43 Stage 3, from `repositories/*.ts` to ALL
#   of `src/backend/**` (excluding `__tests__/`).
#
#   Why: ADL-53's residual inventory was done BY HAND twice (§5.1, then finding
#   F1's re-inventory) and both passes missed `services/**` — which held four
#   hand-written ownership predicates in `shading.service.ts` that no stage owned
#   (ADL-53 §7, CORRECTION 2026-08-10). A grep that fails closed is a better
#   inventory than a careful person, and it keeps answering the question on every
#   future PR instead of once. After this widening, THIS SCRIPT — not a human
#   reading files — defines the residual set.
#
#   Test files stay excluded. They legitimately assert on a row's userId (e.g.
#   `repositories/__tests__/shadingConfig.test.ts`) and legitimately quote these
#   patterns in comments describing what they cover (e.g.
#   `routes/__tests__/security.access-matrix.test.ts`) — those are assertions and
#   documentation about data, not ownership logic, and rewriting them to satisfy
#   a grep would weaken the tests to flatter the check. The exclusion stops at
#   `__tests__`: anything else that matches is a residual to FIX, not to exempt
#   (OP-30 — widening a scanner's suppression is not an implementer's call).
#
# TWO ZONES (expand/contract, ADL-47) — the widened scope lands warn-first.
#
#   ZONE A — ENFORCED (fail-closed, exits non-zero):
#     `src/backend/repositories/*.ts`. This invariant is TRUE today and must stay
#     true; it is the Stage 0 exit-check, unchanged in strength.
#
#   ZONE B — REPORTED (warn-only, does NOT fail the build):
#     the rest of `src/backend/**`. This invariant is NOT true yet: the QUAL-43
#     migration is mid-flight and `routes/**` still holds user-owned reads that
#     Stages 2 and 4 relocate into repositories. Failing the build on them now
#     would red the trunk — the broken-intermediate-state ADL-47's expand/contract
#     discipline exists to prevent.
#
#   Zone B is a WARN TIER, NOT AN ALLOWLIST: every residual is named, located and
#   counted on every run. Nothing is exempted or hidden. Stage 5 (the contract
#   step) promotes Zone B to enforced once the count reaches zero — at which point
#   the two zones collapse into one.
#
# ================================================================
# CHECK 2 — No `getDb` in routes  (WARN-ONLY in this stage)
# ================================================================
#
# ADL-53 §3 item 1: once every route is repo-routed, the route layer physically
# has no `db` handle, which makes "a route handler ran an unscoped query against a
# user table" impossible to merge. The guard's DOOR-COMPLETENESS was verified
# independently by ADL-53's fresh-eyes review: `getDb` is the ONLY exported ORM
# accessor (`src/backend/db/index.ts` — `_db` is a module-private `let`,
# `createLibSQLDb`/`createPostgresDb` are unexported, there is no `export const
# db`), so a route cannot obtain the handle without the literal string `getDb`
# appearing.
#
# WARN-ONLY HERE, BY DESIGN (ADL-53 §6 Stage 5 = "introduced warn-only earlier
# (expand); flipped here (contract)"). Routes legitimately still hold `getDb`
# until Stages 2 and 4 finish; making this an error now would red the trunk. The
# count and the offending files are printed so Stages 4 and 5 can watch it reach
# zero.
#
# MENTIONS, NOT CALL SITES — a deliberate choice, stated because Stage 5 flips
# this to an error and will inherit it.
#
#   This check counts every occurrence of the literal string `getDb` in
#   `src/backend/routes/**`, NOT just `const db = getDb()` call sites. Three
#   classes of match are therefore counted that are not themselves unscoped
#   queries: import bindings, `ReturnType<typeof getDb>` TYPE references
#   (`cities.ts`), and comments asserting "No direct getDb()" (`items.ts`,
#   `trips.ts`, `places.ts` headers). ADL-53 §5.1 flags exactly this as a
#   counting trap, so the decision is made explicitly rather than by accident:
#
#     - Counting call sites would make the guard EVADABLE and forfeit its whole
#       claim. `const d = getDb()`, `const { select } = getDb()`, or passing
#       `getDb` itself as a value are all unscoped-query doors that a
#       `const db = getDb()` pattern sails past. Door-completeness is a property
#       of the STRING, and the string is the only thing that makes this a
#       one-line fail-closed check rather than an AST rule (ADL-53 OQ-1).
#     - The false positives are cheap and self-clearing. A comment is reworded
#       (OP-30: fix your own text, never weaken the scanner) and the type refs
#       leave `routes/` anyway when Stage 2 moves the helpers that use them into
#       `citiesRepository`.
#     - It matches the sibling check above, which also matches TEXT, not syntax,
#       for the same fail-closed reason.
#
#   To keep that honest rather than merely strict, the output CLASSIFIES each
#   match (call-site / type-ref / import / comment / mention) so Stage 5 can see
#   at a glance what is real work and what is a rewording.
#
# BLIND SPOT (stated, not silently accepted): both checks match TEXT, not syntax,
# so a comment quoting any pattern trips them. That is deliberate — it fails
# closed. The fix is to reword the comment (OP-30: fix your own text), never to
# add an exemption here.

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKEND_DIR="$ROOT/src/backend"
REPO_DIR="$BACKEND_DIR/repositories"
ROUTES_DIR="$BACKEND_DIR/routes"
CHOKEPOINT="scope.ts"

PREDICATE_RE='eq\([A-Za-z_$][A-Za-z0-9_$]*\.userId'
JS_COMPARE_RE='\.userId[[:space:]]*[!=]=='
GETDB_RE='getDb'

if [ ! -d "$BACKEND_DIR" ]; then
  echo "scope-completeness-check: FAIL — backend directory not found: $BACKEND_DIR" >&2
  exit 1
fi
if [ ! -d "$REPO_DIR" ]; then
  echo "scope-completeness-check: FAIL — repository directory not found: $REPO_DIR" >&2
  exit 1
fi
if [ ! -d "$ROUTES_DIR" ]; then
  echo "scope-completeness-check: FAIL — routes directory not found: $ROUTES_DIR" >&2
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

# ----------------------------------------------------------------
# File enumeration
# ----------------------------------------------------------------
# Zone A — production repository sources (`-maxdepth 1` excludes `__tests__/`).
mapfile -t ZONE_A_FILES < <(find "$REPO_DIR" -maxdepth 1 -name '*.ts' -type f | sort)

# Zone B — every other production backend source, at any depth, minus tests.
mapfile -t ZONE_B_FILES < <(
  find "$BACKEND_DIR" -name '*.ts' -type f -not -path '*/__tests__/*' \
    | grep -v "^$REPO_DIR/[^/]*\.ts$" \
    | sort
)

# Routes — production route sources at any depth, minus tests.
mapfile -t ROUTE_FILES < <(
  find "$ROUTES_DIR" -name '*.ts' -type f -not -path '*/__tests__/*' | sort
)

if [ "${#ZONE_A_FILES[@]}" -eq 0 ]; then
  echo "scope-completeness-check: FAIL — no repository sources found under $REPO_DIR" >&2
  exit 1
fi
if [ "${#ZONE_B_FILES[@]}" -eq 0 ]; then
  echo "scope-completeness-check: FAIL — the widened scan found no sources outside" >&2
  echo "  $REPO_DIR. Zone B cannot be legitimately empty; the enumeration is broken." >&2
  exit 1
fi
if [ "${#ROUTE_FILES[@]}" -eq 0 ]; then
  echo "scope-completeness-check: FAIL — no route sources found under $ROUTES_DIR" >&2
  exit 1
fi

# ----------------------------------------------------------------
# CHECK 1 — ownership completeness
# ----------------------------------------------------------------
# scan_ownership <label> <file>... — prints each residual, returns the count via
# the global `scan_hits` (bash functions cannot return an int > 255 safely).
scan_hits=0
scan_ownership() {
  local label="$1"
  shift
  local f rel base lineno text
  scan_hits=0

  for f in "$@"; do
    rel="${f#"$ROOT"/}"
    base="$(basename "$f")"

    # Pattern 1 — SQL predicate. Permitted only in the chokepoint itself.
    if [ "$base" != "$CHOKEPOINT" ]; then
      while IFS=: read -r lineno text; do
        [ -n "$lineno" ] || continue
        echo "$label $rel:$lineno — hand-authored ownership predicate"
        echo "    ${text#"${text%%[![:space:]]*}"}"
        echo "    → compose the chokepoint instead: scopeToUser(<table>, userId)"
        echo "      or ownedAnd(<table>, userId, ...conditions)  [repositories/scope.ts]"
        scan_hits=$((scan_hits + 1))
      done < <(grep -nE "$PREDICATE_RE" "$f" || true)
    fi

    # Pattern 2 — application-layer ownership comparison. Permitted nowhere.
    while IFS=: read -r lineno text; do
      [ -n "$lineno" ] || continue
      echo "$label $rel:$lineno — ownership re-derived in application code"
      echo "    ${text#"${text%%[![:space:]]*}"}"
      echo "    → express it as an existence check through the chokepoint:"
      echo "      assertOwned(userId, tripId) / assertWritable(userId, tripId)  [repositories/scope.ts]"
      scan_hits=$((scan_hits + 1))
    done < <(grep -nE "$JS_COMPARE_RE" "$f" || true)
  done
}

scan_ownership "RESIDUAL" "${ZONE_A_FILES[@]}"
zone_a_residuals="$scan_hits"

scan_ownership "WARN-RESIDUAL" "${ZONE_B_FILES[@]}"
zone_b_residuals="$scan_hits"

# ----------------------------------------------------------------
# CHECK 2 — `getDb` in routes (warn-only)
# ----------------------------------------------------------------
getdb_hits=0
getdb_files=0

for f in "${ROUTE_FILES[@]}"; do
  rel="${f#"$ROOT"/}"
  file_hits=0
  while IFS=: read -r lineno text; do
    [ -n "$lineno" ] || continue
    stripped="${text#"${text%%[![:space:]]*}"}"
    # Classify — comment first, since a comment can quote any of the others.
    case "$stripped" in
      '*'* | '//'* | '/*'*) kind="comment" ;;
      *'typeof getDb'*) kind="type-ref" ;;
      'import '* | 'getDb,'* | 'getDb '*) kind="import" ;;
      *'getDb()'*) kind="call-site" ;;
      *) kind="mention" ;;
    esac
    echo "WARN-GETDB $rel:$lineno [$kind]"
    echo "    $stripped"
    getdb_hits=$((getdb_hits + 1))
    file_hits=$((file_hits + 1))
  done < <(grep -nE "$GETDB_RE" "$f" || true)
  [ "$file_hits" -gt 0 ] && getdb_files=$((getdb_files + 1))
done

# ----------------------------------------------------------------
# Verdicts
# ----------------------------------------------------------------
if [ "$zone_b_residuals" -gt 0 ]; then
  echo ""
  echo "########################################################################"
  echo "# WARNING (not a failure) — CHECK 1, ZONE B"
  echo "# $zone_b_residuals hand-authored ownership site(s) outside src/backend/repositories/."
  echo "# These are REAL residuals, listed above as WARN-RESIDUAL. They do not fail"
  echo "# the build only because the QUAL-43 migration is mid-flight (ADL-53 §6"
  echo "# Stages 2/4 relocate them). Stage 5 promotes Zone B to enforced."
  echo "# This is a warn tier, NOT an allowlist — nothing here is exempt."
  echo "########################################################################"
fi

if [ "$getdb_hits" -gt 0 ]; then
  echo ""
  echo "########################################################################"
  echo "# WARNING (not a failure) — CHECK 2"
  echo "# 'getDb' appears $getdb_hits time(s) across $getdb_files route file(s)."
  echo "# Target is ZERO (ADL-53 §3 item 1). Counted as MENTIONS, not call sites —"
  echo "# see this script's header for why, and the [kind] tag on each line above"
  echo "# for what is real relocation work vs. a rewording."
  echo "# Warn-only until ADL-53 §6 Stage 5 flips it to an error."
  echo "########################################################################"
fi

if [ "$zone_a_residuals" -gt 0 ]; then
  echo ""
  echo "scope-completeness-check: FAIL — $zone_a_residuals residual ownership site(s) outside the chokepoint."
  echo "  ADL-53 §6 Stage 0: every ownership expression in src/backend/repositories/**"
  echo "  must resolve through src/backend/repositories/scope.ts."
  exit 1
fi

echo ""
echo "scope-completeness-check: PASS"
echo "  Check 1 (ownership) — ${#ZONE_A_FILES[@]} enforced source(s) in repositories/ clean;"
echo "    ${#ZONE_B_FILES[@]} further backend source(s) scanned, $zone_b_residuals warn-residual(s)."
echo "  Check 2 (getDb in routes, warn-only) — $getdb_hits mention(s) across ${#ROUTE_FILES[@]} route file(s)."
