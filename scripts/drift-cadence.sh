#!/usr/bin/env bash
# Drift-cadence gate (OP-40) — decides whether the drift canary / deep coherence audit is
# due, and records that they ran. Invoked by /coo-startup step 0.5.
#
# WHY THIS EXISTS (2026-08-10). The original cadence check was one line:
#
#     sc=$(grep -c '"action":"session_end"' drift-ledger.jsonl); [ $((sc % 15)) -eq 0 ] && ...
#
# It had two defects that compounded, and the PO caught both:
#
#   1. THE COUNTER CAN SILENTLY STOP. `session_end` is written by a SessionEnd hook. The hook
#      script and its settings.json wiring are both correct (canaried), but the event did not
#      reach it for two consecutive session closes, so the count froze. Root cause upstream of
#      the hook is UNVERIFIED — probes run: (a) piped synthetic input to session-end.sh, which
#      wrote a correct line and exited 0; (b) read the SessionEnd wiring in settings.json, which
#      is present and correct. Blind spot: neither probe can observe whether the harness emitted
#      the event at all. This script is built to not care.
#
#   2. MODULUS IS NOT IDEMPOTENT. Due-ness was recomputed from `count % N` with no record of
#      whether the check had actually RUN at that count. A frozen counter therefore re-fires the
#      most expensive check in the system every session, forever (observed: the deep audit was
#      re-reported due three sessions running after it had already been done). The symmetric
#      failure is worse and silent: freeze on a non-multiple and the audit never fires again,
#      with nothing to say so.
#
# THE FIX, in the shape frameworks #32 asks for — lead with the invariant, not the helper:
#
#   INVARIANT: a periodic check is due when the recorded distance since its LAST RECORDED RUN
#   reaches its interval. Not when an absolute counter happens to hit a multiple.
#
# That makes the gate idempotent (a run is recorded, so it cannot re-fire) and turns a skipped
# session into a one-session delay instead of an infinite loop or an infinite skip.
#
# The tick is deliberately the MAX of three independent, differently-failing session sources —
# no single one is trustworthy (they currently read 75 / 70 / 68 for the same history, each
# undercounting different sessions):
#   - `session_end` ledger entries   — harness SessionEnd hook; misses when the event doesn't fire
#   - `reviewed` ledger entries      — /coo-startup step 4; misses a session that skipped startup
#   - COO park docs                  — /coo-merge-and-close; misses a session that didn't close out
# Max, not sum: sources overlap, and max is monotonic, so the tick never goes backwards.
# Its ABSOLUTE value is not meaningful and is not meant to equal the true session number —
# only its differences are used.
#
# SECOND AXIS, failing differently: a wall-clock staleness backstop. If every tick source froze
# at once, elapsed-ticks would never grow and the check would go silent — the exact fail-silent
# class OP-40 exists to catch. So a run older than its staleness window is flagged DUE on time
# alone, regardless of ticks.
#
# Warn-only, like drift-canary.sh: prints and always exits 0. Never gates.
#
# Usage:
#   drift-cadence.sh check                 # report tick + due-ness for both checks
#   drift-cadence.sh record <canary|deep>  # append a run record at the current tick
#   drift-cadence.sh record <kind> --tick N --ts ISO8601   # backfill a historical run

set -u
WS="/workspace"
cd "$WS" || { echo "drift-cadence: cannot cd to $WS"; exit 0; }

python3 - "$@" <<'PY'
import json, os, re, subprocess, sys
from datetime import datetime, timezone

# Paths are env-overridable so the due/not-due logic can be exercised against a throwaway
# ledger without touching the real one. Defaults are the live paths.
LEDGER = os.environ.get("DRIFT_LEDGER", "/workspace/.planning/drift-ledger.jsonl")
PARKDOCS = os.environ.get("DRIFT_PARKDOCS", "/workspace/jobs/COO/park-docs")

# kind -> (label, interval in ticks, staleness window in days)
CHECKS = {
    "canary": ("drift canary", 5, 21),
    "deep":   ("deep coherence audit", 15, 60),
}


def now():
    """Current UTC. Deliberately read once so a single run is internally consistent."""
    return datetime.now(timezone.utc)


def parse_ts(s):
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def read_ledger():
    """Ledger lines as dicts. Tolerates a malformed line rather than dying on it —
    this is a warn-only advisory gate, not an integrity check."""
    out = []
    try:
        with open(LEDGER) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except Exception:
                    continue
    except FileNotFoundError:
        pass
    return out


def tick_sources(entries):
    """The three independent session counters. Each undercounts differently."""
    session_end = sum(1 for e in entries if e.get("action") == "session_end")
    reviewed = sum(1 for e in entries if e.get("action") == "reviewed")
    try:
        parks = len([f for f in os.listdir(PARKDOCS) if f.endswith(".txt")])
    except OSError:
        parks = 0
    return {"session_end": session_end, "reviewed": reviewed, "park_docs": parks}


def current_tick(entries):
    srcs = tick_sources(entries)
    return max(srcs.values()), srcs


def last_run(entries, kind):
    """Most recent recorded run of `kind`, by tick. None if never recorded."""
    runs = [e for e in entries if e.get("action") == "drift_audit_run" and e.get("kind") == kind]
    if not runs:
        return None
    return max(runs, key=lambda e: (e.get("tick") or 0))


def cmd_check(entries):
    tick, srcs = current_tick(entries)
    spread = max(srcs.values()) - min(srcs.values())
    print(f"drift-cadence: tick={tick}  "
          f"(session_end={srcs['session_end']} reviewed={srcs['reviewed']} "
          f"park_docs={srcs['park_docs']})")
    # A frozen or diverging source is the failure that started all this — make it visible
    # rather than letting it silently distort the cadence.
    if spread > 10:
        print(f"  ! tick sources disagree by {spread} — one may have stopped firing; "
              f"the max keeps cadence safe but investigate before trusting any single count")

    any_due = False
    for kind, (label, interval, stale_days) in CHECKS.items():
        prev = last_run(entries, kind)
        if prev is None:
            print(f"  {label}: DUE — no run ever recorded (bootstrap)")
            any_due = True
            continue

        prev_tick = prev.get("tick") or 0
        elapsed = tick - prev_tick
        prev_ts = parse_ts(prev.get("ts") or "")
        age_days = (now() - prev_ts).days if prev_ts else None

        due_ticks = elapsed >= interval
        due_time = age_days is not None and age_days >= stale_days

        if due_ticks or due_time:
            why = []
            if due_ticks:
                why.append(f"{elapsed} ticks since last run (interval {interval})")
            if due_time:
                why.append(f"last run {age_days}d ago (staleness window {stale_days}d)")
            print(f"  {label}: DUE — {'; '.join(why)}")
            any_due = True
        else:
            remaining = interval - elapsed
            age_str = f", {age_days}d ago" if age_days is not None else ""
            print(f"  {label}: not due — last run at tick {prev_tick}{age_str}; "
                  f"next in {remaining} tick(s)")

    if not any_due:
        print("drift-cadence: nothing due this session.")
    else:
        print("drift-cadence: run what is DUE, then record it "
              "(`scripts/drift-cadence.sh record <canary|deep>`) — an unrecorded run re-fires next session.")


def cmd_record(entries, argv):
    if not argv or argv[0] not in CHECKS:
        print(f"drift-cadence: record needs a kind ({'|'.join(CHECKS)})")
        return
    kind = argv[0]

    tick = None
    ts = None
    rest = argv[1:]
    for i, a in enumerate(rest):
        if a == "--tick" and i + 1 < len(rest):
            try:
                tick = int(rest[i + 1])
            except ValueError:
                pass
        if a == "--ts" and i + 1 < len(rest):
            ts = rest[i + 1]

    if tick is None:
        tick, _ = current_tick(entries)
    if ts is None:
        ts = now().strftime("%Y-%m-%dT%H:%M:%SZ")

    rec = {"ts": ts, "action": "drift_audit_run", "kind": kind, "tick": tick}
    with open(LEDGER, "a") as fh:
        fh.write(json.dumps(rec) + "\n")
    label, interval, _ = CHECKS[kind]
    print(f"drift-cadence: recorded {label} run at tick {tick} — next due at tick {tick + interval}")


argv = sys.argv[1:]
cmd = argv[0] if argv else "check"
entries = read_ledger()

if cmd == "check":
    cmd_check(entries)
elif cmd == "record":
    cmd_record(entries, argv[1:])
else:
    print(f"drift-cadence: unknown command '{cmd}' (expected: check | record)")
PY
exit 0
