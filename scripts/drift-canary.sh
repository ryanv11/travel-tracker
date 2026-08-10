#!/usr/bin/env bash
# Drift canary (design-reflection R2 / OP-40) — a fast, mechanical scan for the
# stale-inheritable / doc-rot class that no incident-born rule catches and that, until now,
# only the PO caught (at human latency). Invoked by /coo-startup on a cadence (every 5th
# session; the deep audit every 15th), NOT on every tool call — it is a periodic sweep, not
# a PostToolUse hook.
#
# Warn-only by design: it prints findings and always exits 0. A finding is a prompt to
# triage (per CLAUDE.md's negative-findings rule, re-probe before acting), not a gate.
# Standing remediation discipline is delete-and-point: delete the rot-prone specific, point
# to the single maintained source, don't restate/enumerate (the firewall-audit precedent).
#
# Deliberately small and high-signal to start; add checks in the python block as new rot
# classes are found. Uses inline python3 (same convention as negative-findings-guard.sh).

set -u
WS="${1:-/workspace}"
cd "$WS" || { echo "drift-canary: cannot cd to $WS"; exit 0; }

python3 - "$WS" <<'PY'
import os, re, sys

WS = sys.argv[1]
os.chdir(WS)

# Doc/config surface to scan. Walk the governance-bearing trees; skip node_modules/.git.
SCAN_DIRS = [".claude", "_shared", "jobs"]
SCAN_FILES = ["CLAUDE.md", "CODEBASE.md"]
EXTS = (".md", ".txt", ".json")

def scan_files():
    for f in SCAN_FILES:
        if os.path.isfile(f):
            yield f
    for d in SCAN_DIRS:
        for root, dirs, files in os.walk(d):
            dirs[:] = [x for x in dirs if x not in (".git", "node_modules")]
            for fn in files:
                if fn.endswith(EXTS):
                    yield os.path.join(root, fn)

def read_lines(f):
    try:
        with open(f, encoding="utf-8", errors="replace") as fh:
            return fh.read().splitlines()
    except Exception:
        return []

# Lines in a removed/superseded/historical context legitimately name a deleted file.
# Checked over a window (the stamp often sits a few lines below the retained text).
HISTORICAL_RE = re.compile(r"supersed|removed|deleted|historical|retired|no longer|for history", re.I)
# A supersession stamp usually sits within the same bullet/section as the retained text —
# a few lines before or (more often) after it. Scan a generous window both directions.
WINDOW_BACK, WINDOW_FWD = 3, 16

# ── Check A: dangling .claude/hooks/*.sh references (the atdd-first-guard rot class) ──────
HOOK_RE = re.compile(r"\.claude/hooks/[A-Za-z0-9._-]+\.sh")
print("== drift-canary A: dangling .claude/hooks/*.sh references ==")
a_findings = 0
files = list(scan_files())
for f in files:
    lines = read_lines(f)
    for i, line in enumerate(lines):
        for ref in HOOK_RE.findall(line):
            if os.path.isfile(ref):
                continue
            window = "\n".join(lines[max(0, i - WINDOW_BACK):i + WINDOW_FWD])
            if HISTORICAL_RE.search(window):
                continue  # intentionally-historical mention
            print(f"  - {f}:{i+1}: references missing {ref}")
            a_findings += 1
if a_findings == 0:
    print("  (clean)")

# ── Check B: broken relative markdown links in CLAUDE.md / CODEBASE.md ────────────────────
LINK_RE = re.compile(r"\]\(([^)]+)\)")
print("== drift-canary B: broken relative markdown links (CLAUDE.md, CODEBASE.md) ==")
b_findings = 0
for doc in ("CLAUDE.md", "CODEBASE.md"):
    if not os.path.isfile(doc):
        continue
    for i, line in enumerate(read_lines(doc)):
        for link in LINK_RE.findall(line):
            if re.match(r"^(https?://|mailto:|#)", link):
                continue
            path = link.split("#", 1)[0]
            if not path:
                continue
            if not os.path.exists(path):
                print(f"  - {doc}:{i+1}: link target missing → {link}")
                b_findings += 1
if b_findings == 0:
    print("  (clean)")

# ── Check C: ADL-log numbering contiguity ────────────────────────────────────────────────
# A gap (e.g. …52, 54 with no 53) means an ADL id is referenced-but-absent — the record-decision
# invariant is contiguous numbering. Deterministic, zero false positives. (Added from the OP-40
# deep-audit dogfood 2026-08-09, which found the ADL-53 gap by hand.)
ADL_LOG = "jobs/architect/tech/20260307-architecture-decisions-log.md"
print("== drift-canary C: ADL-log numbering contiguity ==")
c_findings = 0
adl_nums = []
if os.path.isfile(ADL_LOG):
    adl_nums = sorted(set(int(m) for m in re.findall(r"(?m)^## ADL-(\d+)\b", "\n".join(read_lines(ADL_LOG)))))
    for n in (set(range(adl_nums[0], adl_nums[-1] + 1)) - set(adl_nums)) if adl_nums else set():
        print(f"  - ADL-{n} missing from the log (headers run {adl_nums[0]}..{adl_nums[-1]})")
        c_findings += 1
if c_findings == 0:
    print("  (clean)")

# ── Check D: ADL-reference resolvability ─────────────────────────────────────────────────
# Every ADL-NN cited in the always-read records must resolve to a log header or a standalone
# ADL-NN*.md. Catches dangling ids (and the same ADL-53 gap from a second angle).
import glob
print("== drift-canary D: ADL-reference resolvability ==")
d_findings = 0
defined = set(adl_nums)
for f in glob.glob("jobs/architect/tech/ADL-*.md"):
    m = re.search(r"ADL-(\d+)", os.path.basename(f))
    if m:
        defined.add(int(m.group(1)))
seen = {}
for f in ("_project/tracker.json", "CLAUDE.md", "CODEBASE.md"):
    if not os.path.isfile(f):
        continue
    for i, line in enumerate(read_lines(f)):
        for m in re.findall(r"ADL-(\d+)", line):
            n = int(m)
            if n not in defined:
                seen.setdefault(n, (f, i + 1))
for n, (f, ln) in sorted(seen.items()):
    print(f"  - ADL-{n} referenced ({f}:{ln}) but not defined in the log or a standalone ADL-*.md")
    d_findings += 1
if d_findings == 0:
    print("  (clean)")

total = a_findings + b_findings + c_findings + d_findings
print(f"drift-canary: {total} finding(s) (warn-only). Triage per negative-findings rule; "
      f"remediate with delete-and-point.")
PY
exit 0
