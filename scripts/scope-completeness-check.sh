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
# BOTH CHECKS ARE FULLY ENFORCED (2026-08-10, ADL-53 §6 Stage 5). Any match in
# either one fails the build. Both landed warn-first on purpose — the QUAL-43
# migration was mid-flight and failing on a residual a later stage was chartered
# to remove would have red-ed the trunk (ADL-47 expand/contract). Stage 5 is the
# CONTRACT half: Stages 2/3/4 drove both residual counts to zero, and this is the
# step that makes zero permanent. The per-check sections below keep the
# warn-first history stamped rather than deleted, because the reason a guard was
# once weaker is the thing a future reader needs when tempted to weaken it again.
#
# NOTHING HERE IS AN ALLOWLIST. There is exactly one exclusion — `__tests__` —
# argued for in CHECK 1 below. Adding a second is a scanner suppression and needs
# COO sign-off (OP-30); the fix for a false positive is to reword your own text.
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
# ONE ENFORCED SCOPE — the whole of `src/backend/**` (minus `__tests__`).
#
#   > SUPERSEDED (2026-08-10) by ADL-53 §6 Stage 5 — retained for history. This
#   > section previously described TWO ZONES of differing strength: Zone A
#   > (`repositories/*.ts`) ENFORCED, Zone B (the rest of `src/backend/**`)
#   > warn-only, "promoted once the count reaches zero — at which point the two
#   > zones collapse into one". Stage 4 drove Zone B to zero and Stage 5 has made
#   > the promotion. A residual ANYWHERE under `src/backend/**` now fails.
#
#   The two-zone split existed for one reason and that reason is spent: while
#   Stages 2/3/4 were still relocating user-owned reads out of `routes/**`, an
#   enforced Zone B would have failed the build on residuals a later stage was
#   already chartered to remove. That is the broken-intermediate-state ADL-47's
#   expand/contract discipline exists to prevent — not a judgement that ownership
#   written by hand outside `repositories/` was ever acceptable.
#
#   WHY THE ENUMERATION IS STILL SPLIT IN TWO despite the policy collapsing into
#   one. The zones no longer differ in STRENGTH — both fail the build, and one
#   verdict covers them. They stay separately enumerated because each half
#   carries its own NON-EMPTINESS assertion (below): "`repositories/` yielded
#   production sources" and "the widened scan yielded sources outside
#   `repositories/`".
#
#   What those assertions actually protect against is a future EDIT TO THIS
#   SCRIPT'S OWN ENUMERATION — a `find` predicate that stops matching, an
#   exclusion that widens past its target. (A moved or missing directory is
#   already caught by the directory-existence checks further down; these two are
#   the layer behind that.) Under a single merged `find`, either mistake would
#   leave the check scanning a fraction of the tree and reporting PASS, because a
#   merged enumeration is satisfied by whatever half still matches. Split, each
#   half must independently prove it found something.
#
#   Both were verified by injection rather than assumed (2026-08-10): breaking the
#   Zone A pattern (`*.ts` → `*.tsx`) and over-widening the Zone B exclusion each
#   produced exit 1 with the corresponding "enumeration is broken" message, on a
#   tree that is otherwise clean. Same fail-closed reasoning as the chokepoint
#   existence + definition checks below: a guard that can pass while inspecting
#   nothing is not a guard.
#
# ================================================================
# CHECK 2 — No `getDb` in routes  (ENFORCED)
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
# ENFORCED (2026-08-10, ADL-53 §6 Stage 5 — "introduced warn-only earlier
# (expand); flipped here (contract)").
#
#   > SUPERSEDED (2026-08-10) — retained for history. This check was authored
#   > warn-only by Stage 3: routes legitimately still held `getDb` until Stages 2
#   > and 4 relocated those reads, and erroring then would have red-ed the trunk.
#   > Stage 4 took the count to zero across all 12 route files; Stage 5 flips it.
#
# The flip is what converts the door-completeness argument above from a
# description into a guarantee. Warn-only, it merely narrated a route acquiring a
# DB handle; enforced, "a route handler ran an unscoped query against a user
# table" is not mergeable, because the route layer cannot obtain the handle at all.
#
# MENTIONS, NOT CALL SITES — a deliberate choice, restated here because this check
# is now an error and every future reader inherits the consequence.
#
#   This check counts every occurrence of the literal string `getDb` in
#   `src/backend/routes/**`, NOT just `const db = getDb()` call sites. Three
#   classes of match are therefore counted that are not themselves unscoped
#   queries: import bindings, `ReturnType<typeof getDb>` TYPE references, and
#   comments asserting a route holds no direct handle. (Live examples of all three
#   existed in `cities.ts`/`items.ts`/`trips.ts`/`places.ts` when this was written;
#   Stages 2–4 removed every one, and the surviving route comments now DESCRIBE
#   the rule rather than quote the string — e.g. `routes/trips.ts`. The classes are
#   documented because they will recur, not because any instance is live.)
#   ADL-53 §5.1 flags exactly this as a counting trap, so the decision is made
#   explicitly rather than by accident:
#
#     - Counting call sites would make the guard EVADABLE and forfeit its whole
#       claim. `const d = getDb()`, `const { select } = getDb()`, or passing
#       `getDb` itself as a value are all unscoped-query doors that a
#       `const db = getDb()` pattern sails past. Door-completeness is a property
#       of the STRING, and the string is the only thing that makes this a
#       one-line fail-closed check rather than an AST rule (ADL-53 OQ-1).
#     - The false positives are cheap and self-clearing. A comment is reworded
#       (OP-30: fix your own text, never weaken the scanner); the type refs left
#       `routes/` when Stage 2 moved the helpers using them into
#       `citiesRepository`. Both predictions held — the count reached zero without
#       a single exemption being added.
#     - It matches the sibling check above, which also matches TEXT, not syntax,
#       for the same fail-closed reason.
#
#   To keep that honest rather than merely strict, the output CLASSIFIES each
#   match (call-site / type-ref / import / comment / mention). Now that the check
#   is an error, the tag is the first thing to read on a failure: `comment` means
#   reword your own prose and you are done; the other tags mean a read needs
#   relocating into a repository. Neither ever means adding an exemption here.
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
# Zone A and Zone B are ENFORCED IDENTICALLY (Stage 5) — the names survive only
# because each half carries its own non-emptiness assertion, which is what stops
# a broken `find` passing the check vacuously. Together they cover exactly
# `src/backend/**/*.ts` minus `__tests__/`, with no overlap.
#
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

# Both scans carry the same label and the same weight (Stage 5); the counts stay
# separate only so the PASS line can report the coverage of each enumeration.
scan_ownership "RESIDUAL" "${ZONE_A_FILES[@]}"
zone_a_residuals="$scan_hits"

scan_ownership "RESIDUAL" "${ZONE_B_FILES[@]}"
zone_b_residuals="$scan_hits"

ownership_residuals=$((zone_a_residuals + zone_b_residuals))

# ----------------------------------------------------------------
# CHECK 2 — `getDb` in routes (enforced)
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
    echo "GETDB $rel:$lineno [$kind]"
    echo "    $stripped"
    getdb_hits=$((getdb_hits + 1))
    file_hits=$((file_hits + 1))
  done < <(grep -nE "$GETDB_RE" "$f" || true)
  [ "$file_hits" -gt 0 ] && getdb_files=$((getdb_files + 1))
done

# ----------------------------------------------------------------
# Verdicts — BOTH checks are enforced (ADL-53 §6 Stage 5)
# ----------------------------------------------------------------
# Every failure is reported before exiting. A run that breaks both invariants
# must show both, not just the first: an implementer who fixes only what the
# output named, pushes, and fails again on the half it withheld learns to
# distrust the guard.
failed=0

if [ "$ownership_residuals" -gt 0 ]; then
  echo ""
  echo "scope-completeness-check: FAIL — CHECK 1"
  echo "  $ownership_residuals hand-authored ownership site(s) in src/backend/**"
  echo "  ($zone_a_residuals in repositories/, $zone_b_residuals elsewhere), listed above as RESIDUAL."
  echo "  ADL-53 §6: every ownership expression in the production backend must resolve"
  echo "  through src/backend/repositories/scope.ts — scopeToUser/ownedAnd for a"
  echo "  predicate, assertOwned/assertWritable for an existence check. That single"
  echo "  definition is what Phase-3 sharing (ADL-53 D7/§7) changes in one place."
  echo "  Route the site through the chokepoint. Do NOT exempt it here (OP-30)."
  failed=1
fi

if [ "$getdb_hits" -gt 0 ]; then
  echo ""
  echo "scope-completeness-check: FAIL — CHECK 2"
  echo "  'getDb' appears $getdb_hits time(s) across $getdb_files route file(s)."
  echo "  ADL-53 §3 item 1: the route layer holds no DB handle, so an unscoped query"
  echo "  against a user table cannot be written there. Required count is ZERO."
  echo "  Counted as MENTIONS, not call sites (see this script's header for why)."
  echo "  Read the [kind] tag on each line above: 'comment' means reword your own"
  echo "  prose; anything else means move the read into a repository. Neither means"
  echo "  adding an exclusion here (OP-30)."
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

echo ""
echo "scope-completeness-check: PASS"
echo "  Check 1 (ownership, enforced) — 0 residuals across $((${#ZONE_A_FILES[@]} + ${#ZONE_B_FILES[@]})) backend source(s)"
echo "    (${#ZONE_A_FILES[@]} in repositories/, ${#ZONE_B_FILES[@]} elsewhere; __tests__ excluded)."
echo "  Check 2 (getDb in routes, enforced) — 0 mention(s) across ${#ROUTE_FILES[@]} route file(s)."
