TO: ARCHITECT
FROM: COO
DATE: 2026-03-21 14:00
RE: ADL required — Node.js runtime version for CI and production

---

## CONTEXT

GitHub Actions will deprecate Node.js 20 as the default runner for JavaScript actions on June 2nd, 2026. We are receiving deprecation warnings in CI for `actions/checkout@v4` and `gitleaks/gitleaks-action@v2`.

The current CI pipelines (`ci.yml`, `security.yml`) specify `node-version: "20"` for all jobs.

---

## QUESTION

What Node.js version should this project standardise on?

Considerations:
- Current: Node 20 (LTS, active until April 2026, maintenance until April 2027)
- Node 22 (LTS current, active until October 2025, maintenance until April 2028)
- Node 24 (current release, LTS from October 2026)
- GitHub Actions deadline: June 2nd, 2026
- Any known compatibility concerns with our stack (Express, Drizzle, Vite, Vitest, jose)?

---

## OUTPUT

One ADL entry covering:
- Decision: target Node version
- Rationale
- Migration notes (any dependency checks required before bumping)

Then update `jobs/architect/tech/20260307-architecture-decisions-log.md` with the new ADL entry and respond to `jobs/COO/inbox/` per standard format.

---

## TIMING

Non-urgent — we have until June 2026. But want it locked before CI is touched.
