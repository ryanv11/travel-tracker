# Travel Tracker — Packaging & Security Readiness Report
**To:** COO  **From:** Architect  **Date:** 2026-03-11

---

### Executive Summary

The app is in good shape for a developer workstation but requires targeted architectural work before it can be distributed as a signed macOS app or extended to iOS. The most important principle governing sequencing: **decisions made now about data storage and the client–server boundary are expensive to reverse later.** iOS in particular forces a fundamentally different model than an embedded Electron app — getting ahead of that now avoids a rewrite.

**iOS scope confirmed as aspirational** — the architecture will be designed to support it from the start without foreclosing the option, even if we never ship it.

---

## Phase 1 — Architectural Foundation *(Do First — High Reversal Cost)*

These items must be resolved before packaging work begins. Getting them wrong locks in technical debt that is painful to undo after a .dmg ships.

### 1.1 Hosted Backend Architecture *(iOS decision resolved)*

iOS cannot run a local embedded server. Since iOS is in scope, the primary architecture must target a **hosted API** — not a server bundled inside the macOS app.

- Deploy Express API to a cloud host (Fly.io / Railway)
- Drizzle schema designed to target both SQLite (local/dev/Electron) and Postgres/Turso (cloud/iOS)
- Electron .dmg may optionally include a local Express + SQLite fallback for offline use, but primary architecture is API-first
- Both the macOS app and the future iOS app become thin clients against the same backend

**Impact if deferred:** Electron ships with an embedded server; iOS requires rebuilding the entire backend boundary. This is the highest-cost mistake to make late.

### 1.2 Authentication — Phase 1, Not Phase 3

Currently the app has no auth layer. This is acceptable for a local single-user tool but is a hard blocker before any API is deployed outside localhost — even in staging.

- Auth must be in place before the hosted backend goes live
- JWT or session-based; exact implementation TBD
- Building Electron without auth and adding it later for iOS is the classic expensive sequencing mistake

### 1.3 Replace `@libsql/client` with `better-sqlite3`

`@libsql/client` ships native binaries that must be recompiled against Electron's Node ABI on every build machine and CI runner. `better-sqlite3` is the de-facto Electron + SQLite standard — synchronous API, well-maintained, first-class Electron support.

This is a contained swap at the Drizzle layer. Do it now before Electron scaffolding is added.

### 1.4 Environment-Aware API Base URL

The frontend must resolve its API target at build time via Vite's `import.meta.env`, targeting:
- `localhost:3001` in dev
- Local Express in Electron (offline mode)
- Hosted API URL for cloud / iOS

---

## Phase 2 — macOS .dmg Packaging

With Phase 1 complete, packaging work is well-scoped.

### 2.1 Electron Scaffold

- **Context isolation ON, `nodeIntegration` OFF** — security baseline, non-negotiable
- `contextBridge` + `ipcMain`/`ipcRenderer` for main↔renderer communication
- Load the Vite build via `loadFile()` — no HTTP server needed for the UI
- Express (if offline mode is supported) spawned as a managed child process

### 2.2 DB Bootstrapping

- On first launch, run migrations into `~/Library/Application Support/travel-tracker/`
- Auto-run `db:migrate` on every launch to handle app updates
- Never bundle the dev DB into the app package

### 2.3 Build Pipeline

Use `electron-builder` for DMG creation:
- Separate targets for `arm64` (Apple Silicon) and `x64` (Intel), or a universal binary
- `electron-rebuild` step in CI to compile native modules against the correct Electron ABI
- Add `electron-builder.yml` alongside existing CI workflows

### 2.4 Code Signing & Notarization

Without notarization, Gatekeeper blocks launch on other Macs. For personal use on a single machine, skip this. For any distribution:
- Requires Apple Developer account ($99/yr)
- `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD` stored as GitHub Actions secrets
- Add a `release.yml` workflow that builds, signs, notarizes, and uploads to GitHub Releases

---

## Phase 3 — iOS Readiness *(Contingent on Phase 1 cloud deployment)*

| Work item | Notes |
|-----------|-------|
| Deploy Express API to cloud | Fly.io / Railway — Dockerfile straightforward from existing Express setup |
| Auth layer live | Must precede any cloud deployment |
| Capacitor shell | Wraps existing React/Vite build with minimal changes — lowest friction path |
| Map compatibility | `react-map-gl` / MapLibre works in Capacitor; no rewrite needed |
| Offline/sync (optional) | If local-first is desired on iOS, evaluate ElectricSQL or PowerSync |

**Capacitor** is the recommended iOS path — it reuses the Vite build directly. React Native offers better native performance but requires rewriting every UI component.

---

## Phase 4 — Security Audit *(Pre-Production Gate)*

A full audit is a blocking gate before any public release. Key focus areas:

### 4.1 API Security
- **Input validation:** Confirm Zod schemas cover all API boundaries including path params and query strings — not just request bodies
- **Rate limiting:** `express-rate-limit` is present; verify limits are appropriate and applied to all routes
- **CORS:** Confirm `cors()` config is restrictive — wildcard origins are not acceptable in production
- **HTTP headers:** `helmet` is present; audit configuration against OWASP recommendations, especially `Content-Security-Policy`

### 4.2 Authentication & Authorization
- No auth currently — hard blocker for any hosted deployment (addressed in Phase 1)
- Post-implementation: audit token storage, expiry, refresh, and session invalidation

### 4.3 Data at Rest
- SQLite DB stored unencrypted — acceptable for a personal local tool; note as a risk if the machine is shared
- For any cloud DB, confirm encryption at rest is enabled at the infrastructure level

### 4.4 Dependency Supply Chain
- `npm audit` is in CI (`security.yml`) — verify it is configured to fail on high/critical, not just report
- Gitleaks secret scanning is in CI — confirm `.env.local` is in `.gitignore` and no secrets have leaked into git history
- `pg` package is present in dependencies but not used — dead dependencies are unnecessary attack surface; remove it

### 4.5 Electron-Specific Risks *(after Phase 2)*
- **RCE via XSS:** With `nodeIntegration: false` and `contextIsolation: true`, XSS cannot escalate to OS — verify these are enforced in `BrowserWindow` config
- **`webSecurity`:** Must remain `true` — never disable for convenience
- **Protocol handlers:** If custom URL schemes are registered, audit for protocol hijacking
- **Auto-update integrity:** If `electron-updater` is added, verify update packages are signed and the update URL cannot be tampered with

### 4.6 Geocoding API Keys
- Geocoding API key must never be embedded in the frontend bundle (visible to any user who inspects the app)
- All geocoding calls must be proxied through the Express backend so the key never leaves the server

### 4.7 Semgrep SAST Coverage
- Verify Semgrep ruleset covers both TypeScript backend and React frontend
- Add Electron-specific Semgrep rules after Phase 2

---

## Summary Sequencing

```
Phase 1 (now)               Phase 2 (macOS .dmg)       Phase 3 (iOS)              Phase 4 (pre-prod)
────────────────────        ────────────────────        ────────────────────        ────────────────────
Hosted backend arch         Electron scaffold           Cloud API deployed          Full security audit
Auth layer                  DB bootstrapping            Auth live                   Penetration test
better-sqlite3 swap         electron-builder DMG        Capacitor shell             Sign-off gate
API URL strategy            Code signing                Offline/sync (TBD)
```

The single highest-leverage decision — **iOS in scope, hosted backend confirmed** — has been made. Implementation can begin on Phase 1.
