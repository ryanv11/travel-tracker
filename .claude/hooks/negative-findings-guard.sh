#!/usr/bin/env bash
# PostToolUse hook (OP-26) — warns when a Write/Edit into a deliverable or tracker note
# asserts an absence ("X does not exist / is unreachable / is not implemented") without a
# paired second-probe or UNVERIFIED marker nearby, per CLAUDE.md's negative-findings rule.
#
# EXTENDED 2026-07-28 (OP-29) to cover `gh issue create` / `gh pr create` bodies as well as
# file writes. The original hook only matched Write|Edit, which left the COO's own dominant
# failure path completely uncovered: the COO does not write briefs to files, it writes them
# into GitHub issue bodies via Bash. That is exactly how a false premise reached brief B2 on
# 2026-07-28 — the claim "AD-09's owner-only deactivation is not enforced on the backend
# today" was propagated from a planning doc into issue #298 without a second probe, and was
# flatly false (`adminRouter.use(requireOwner)` already gated every categories/activities
# route). PO direction the same day: the negative-findings rule binds the whole team, COO
# included, so its enforcement has to reach where the COO actually writes.
#
# Warn-only by design, not a PreToolUse block: regex against natural language will
# false-positive (e.g. an agent quoting this very rule), and a hard block would stall an
# agent mid-task for no reason. Revisit block-vs-warn once the real false-positive rate is
# known from use. Outputs nothing when clean — zero tokens on the common case, same
# convention as typecheck.sh.

WORKSPACE="/workspace"

INPUT=$(cat)

result=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    cmd = ti.get('command', '') or ''
    # Bash path: only briefs/reports authored into GitHub, not every shell command.
    if cmd:
        if 'gh issue create' in cmd or 'gh pr create' in cmd or 'gh issue comment' in cmd:
            print('<gh-brief>')
            print('---NFG-SEP---')
            print(cmd)
        else:
            print('')
            print('---NFG-SEP---')
            print('')
    else:
        print(ti.get('file_path', ''))
        print('---NFG-SEP---')
        print(ti.get('content', '') or ti.get('new_string', '') or '')
except Exception:
    print('')
    print('---NFG-SEP---')
    print('')
" 2>/dev/null)

FILE=$(printf '%s' "$result" | awk '/---NFG-SEP---/{exit} {print}')
CONTENT=$(printf '%s' "$result" | awk 'f{print} /---NFG-SEP---/{f=1}')

# Deliverables, tracker notes, and briefs authored into GitHub issues/PRs
case "$FILE" in
  */jobs/*|*/_project/tracker.json|'<gh-brief>') ;;
  *) exit 0 ;;
esac

[ -z "$CONTENT" ] && exit 0

# Widened 2026-07-28 (OP-29). The original set missed the two phrasings that actually
# produced this project's false premises: "is not enforced on the backend" (brief B2's
# AD-09 claim) and "there is no router.delete in trips.ts" (the Wave 0 claim the COO
# propagated unchecked). Absence-of-enforcement and "there is no X" are the highest-value
# patterns to catch precisely because designs get built straight on top of them.
ABSENCE_RE='does not exist|doesn'"'"'t exist|not found|no evidence of|is unreachable|cannot be verified|can'"'"'t be verified|not implemented|never implemented|is not enabled|is disabled|no such|not present in|not enforced|isn'"'"'t enforced|not gated|not validated|never validated|no call sites|never called|there is no |there are no |never wired'
PAIRING_RE='UNVERIFIED|probe 2|second probe|two independent probes|two probes'

if printf '%s' "$CONTENT" | grep -qiE "$ABSENCE_RE"; then
  if ! printf '%s' "$CONTENT" | grep -qiE "$PAIRING_RE"; then
    if [ "$FILE" = '<gh-brief>' ]; then
      echo "negative-findings-guard: this GitHub issue/PR body asserts something is missing/unreachable/not implemented but states no second probe and carries no UNVERIFIED marker. Briefs are the highest-leverage place for a false absence — an agent will build on it without re-checking. Per CLAUDE.md's negative-findings rule (which binds the COO propagating findings, not just agents writing them), verify it with a second independent probe or mark it UNVERIFIED with the blind spot stated. This exact failure produced brief B2's false AD-09 premise on 2026-07-28."
    else
      echo "negative-findings-guard: $FILE asserts something is missing/unreachable/not implemented but has no adjacent UNVERIFIED marker or second-probe mention. Per CLAUDE.md's negative-findings rule, confirm this with a second independent probe or mark it UNVERIFIED with the blind spot stated before treating it as fact."
    fi
  fi
fi

exit 0
