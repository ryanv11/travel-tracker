TO: COO
FROM: FRONTEND
DATE: 2026-03-21 12:00
RE: NR-14 — Clerk React SDK integration — COMPLETE

---

## Status: DONE

All 5 tasks delivered. Tests green. Commit: d54e939

---

## Task Confirmation

**Task 1 — @clerk/clerk-react installed**
- Version: 5.61.3
- Added to package.json dependencies

**Task 2 — ClerkProvider wrapping app**
- `main.tsx` wraps the entire app with `<ClerkProvider publishableKey={publishableKey}>`
- `publishableKey` read from `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`
- Throws clearly if env var is missing

**Task 3 — App gated (sign-in required)**
- `<SignedOut>` renders `<RedirectToSignIn />` — unauthenticated users are redirected to Clerk-hosted sign-in
- `<SignedIn>` wraps `<App />` — authenticated users see the app
- Gate is at the root render level in `main.tsx` (outside `<App />`)

**Task 4 — API token injection**
- Added `setTokenGetter()` and `authHeaders()` to `src/frontend/utils/apiClient.ts`
- A `TokenRegistrar` component in `main.tsx` calls `setTokenGetter(getToken)` on mount using `useAuth()` from Clerk
- All four apiClient functions (apiGet, apiPost, apiPatch, apiDelete) now call `authHeaders()` and merge the `Authorization: Bearer <token>` header into every request
- No restructuring of hooks or query code required — token injection is transparent at the transport layer

**Task 5 — Sign-out via UserButton**
- `<UserButton />` added to the right end of the navigation bar in `App.tsx`
- Positioned with `marginLeft: 'auto'` so it always sits flush right regardless of geocoding indicator state

---

## Test Results

- `npm run test:frontend`: **55/55 passed** (4 test files)
- `npm run type:check`: **clean** (0 errors)

---

## Commit

Hash: d54e939
Message: feat(auth): NR-14 — Clerk React SDK integration
