#!/usr/bin/env bash
# PostToolUse hook (OP-35 / ADL-50) — warns when a BRIEF touches a high-stakes ATDD trigger
# (schema.ts, migrations/, or require(Owner|Auth)) but states NO ATDD-first decision.
#
# Backs up the Architect-prompt marking + the COO's dispatch-QA-first duty: a brief on the
# access-matrix / data-integrity classes that carries no ATDD decision has bypassed the rule
# (and, if it also bypassed the Architect, a second process violation). Scope is deliberately
# narrow so it does not fire on every doc that mentions a migration: only
#   - `gh issue create` / `gh pr create` / `gh issue comment` bodies (the brief/handoff channel), and
#   - Write/Edit into a file whose name contains "brief" under jobs/**.
#
# KNOWN BLIND SPOT (stated, per the negative-findings rule): PostToolUse hooks see Write/Edit/Bash,
# NOT Agent-tool dispatch prompts, so a brief dispatched directly through the Agent tool is invisible
# here. The Architect-prompt marking + the COO duty are the primary controls; this is a backstop for
# the gh-issue and brief-file channels.
#
# Warn-only by design (OP-26/OP-28 precedent): regex on natural language false-positives, and a hard
# block would stall an agent mid-task. Outputs nothing when clean — zero tokens on the common case.

INPUT=$(cat)

result=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', {})
    cmd = ti.get('command', '') or ''
    if cmd:
        if 'gh issue create' in cmd or 'gh pr create' in cmd or 'gh issue comment' in cmd:
            print('<gh-brief>')
            print('---AFG-SEP---')
            print(cmd)
        else:
            print(''); print('---AFG-SEP---'); print('')
    else:
        print(ti.get('file_path', ''))
        print('---AFG-SEP---')
        print(ti.get('content', '') or ti.get('new_string', '') or '')
except Exception:
    print(''); print('---AFG-SEP---'); print('')
" 2>/dev/null)

FILE=$(printf '%s' "$result" | awk '/---AFG-SEP---/{exit} {print}')
CONTENT=$(printf '%s' "$result" | awk 'f{print} /---AFG-SEP---/{f=1}')

# Only briefs: a gh issue/PR body, or a *brief* file under jobs/**.
case "$FILE" in
  '<gh-brief>') ;;
  */jobs/*brief*|*/jobs/*Brief*) ;;
  *) exit 0 ;;
esac

[ -z "$CONTENT" ] && exit 0

# High-stakes ATDD triggers: schema, migrations, or an auth/owner gate / access matrix.
TRIGGER_RE='schema\.ts|migrations/|requireOwner|requireAuth|require\(Owner|access[ -]matrix'
# A stated ATDD decision anywhere in the brief.
ATDD_RE='ATDD-first|ATDD first|ATDD:|acceptance-test-first|acceptance test first'

if printf '%s' "$CONTENT" | grep -qiE "$TRIGGER_RE"; then
  if ! printf '%s' "$CONTENT" | grep -qiE "$ATDD_RE"; then
    if [ "$FILE" = '<gh-brief>' ]; then
      echo "atdd-first-guard: this brief touches a high-stakes ATDD trigger (schema/migration/auth-gate) but states no ATDD-first decision. Per CLAUDE.md OP-35 (ADL-50), a brief on the access-matrix / data-integrity classes is ATDD-first — QA writes red acceptance tests before the implementer. Mark it ATDD-first: yes/no; if yes, dispatch QA first. If this brief also bypassed the Architect, that is a second process violation to correct."
    else
      echo "atdd-first-guard: $FILE touches a high-stakes ATDD trigger (schema/migration/auth-gate) but states no ATDD-first decision. Per CLAUDE.md OP-35 (ADL-50), mark it ATDD-first: yes/no; if yes, QA writes red acceptance tests before the implementer runs."
    fi
  fi
fi

exit 0
