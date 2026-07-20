# Completion Report — BUG-28: Non-destructive place-date PATCH + date-order validation

**Note:** Reconstructed by COO from PR #139's diff during merge review — the
implementing agent did not file a completion report before the session-limit
cutoff. Content is accurate to what was actually merged, not a paraphrase of
the agent's own account.

**Tracker:** BUG-28 · **GitHub:** issue #136, PR #139 (merged 2026-07-19)
**BRD:** DP-05 · **Branch:** `fix/bug28-place-date-patch`

## Summary of changes
PO ruling implemented: PATCH preserves omitted date fields; explicit `null`
still clears; cross-field validation rejects `arrived_on > departed_on`.

- `repositories/places.ts::updateDates` — only sets fields that are `!==
  undefined` in the update payload (was: `arrivedOn ?? null` unconditionally,
  clearing the other field on every single-field PATCH).
- `routes/places.ts` PATCH handler — ownership + lock verified first
  (`assertWritable`), then validates against the **merged result** (existing
  stored value fills in for an omitted field) so a single-field PATCH is still
  checked against the other field's current value, not just the request body.
  Rejects with `ValidationError('departed_on must be on or after arrived_on')`.
  Same-day (`arrived_on == departed_on`) is accepted.
- Tests added: `repositories/__tests__/places.test.ts` (omitted-field
  preservation, explicit-null-clears), `routes/__tests__/places.test.ts`
  (400 on bad order incl. single-field update, 201 on same-day boundary),
  new `validation/__tests__/places.schemas.test.ts`.
- `audits/session-b-code-safety.md` stamped RESOLVED citing PR #139.

## Security checklist (per brief)
1. `requireAuth` global; no owner-only change. 2. Ownership verified via
`assertWritable(userId, ...)` before any read/mutation. 3. No schema changes.

## CI — PR #139
9/9 checks pass (verified via `gh pr checks 139` before merge).
