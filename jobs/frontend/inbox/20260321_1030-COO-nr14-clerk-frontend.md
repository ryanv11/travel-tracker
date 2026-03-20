TO: FRONTEND
FROM: COO
DATE: 2026-03-21 10:30
RE: NR-14 — Clerk React SDK integration

---

## OVERVIEW

Add Clerk authentication to the React frontend. Users must sign in before they can use the app. After sign-in, all API requests must include the Clerk session token as a Bearer header.

This task is independent of the Tailwind/UI migration brief (also in your inbox). You may work on them in sequence — do this one first as it is the auth gate.

---

## ENVIRONMENT VARIABLES

Already set in `.env.local`:

| Variable | Value |
|----------|-------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_anVzdC1yYXB0b3ItODkuY2xlcmsuYWNjb3VudHMuZGV2JA` |

---

## TASK 1 — INSTALL CLERK REACT SDK

```bash
npm install @clerk/clerk-react
```

---

## TASK 2 — WRAP APP WITH CLERKPROVIDER

In `src/frontend/main.tsx`, wrap the app:

```tsx
import { ClerkProvider } from '@clerk/clerk-react';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

<ClerkProvider publishableKey={publishableKey}>
  <App />
</ClerkProvider>
```

---

## TASK 3 — PROTECT THE APP (SIGN-IN GATE)

The entire app requires authentication. Use Clerk's `<SignedIn>` / `<SignedOut>` components (or `useAuth` hook) to gate the app:

```tsx
import { SignedIn, SignedOut, SignInButton, RedirectToSignIn } from '@clerk/clerk-react';

// Either redirect unauthenticated users to Clerk's hosted sign-in:
<SignedOut><RedirectToSignIn /></SignedOut>
<SignedIn><App /></SignedIn>
```

Use whichever pattern (redirect vs inline sign-in component) fits cleanest with the current `App.tsx` structure. The goal is: unauthenticated users see sign-in, authenticated users see the app.

---

## TASK 4 — ATTACH TOKEN TO ALL API REQUESTS

All API calls to the backend must include the Clerk session token as a Bearer token in the `Authorization` header.

The app uses React Query + a centralized API client. Find where `fetch` or `axios` calls are made (likely an `api.ts` or similar utility) and inject the header.

Pattern using Clerk's `useAuth` hook:
```ts
const { getToken } = useAuth();
const token = await getToken();
// attach as: Authorization: `Bearer ${token}`
```

If the API client is not hook-aware (plain `fetch` calls), use `clerk.session?.getToken()` from the Clerk singleton or restructure to pass the token from a hook context.

The exact integration point depends on the current API client structure — read it first and choose the cleanest approach.

---

## TASK 5 — SIGN OUT UI

Add a sign-out control somewhere appropriate in the app chrome (nav bar, header, etc.). Use Clerk's `<UserButton />` component — it provides a pre-built avatar + dropdown with sign-out built in.

```tsx
import { UserButton } from '@clerk/clerk-react';
<UserButton />
```

Place it in the top navigation bar where it makes sense visually.

---

## DELIVERY REQUIREMENTS

1. `@clerk/clerk-react` installed
2. `ClerkProvider` wrapping the app with the correct publishable key
3. App gated — unauthenticated users see sign-in, not app content
4. All API requests include `Authorization: Bearer <token>` header
5. Sign-out available via `<UserButton />`
6. `npm run test:frontend` passes
7. `npm run type:check` passes

---

## OUT OF SCOPE

- Backend auth implementation — handled by separate Backend brief
- Any changes to API routes or middleware
- User profile page or account settings

---

## COMPLETION REPORT

File to: `/workspace/jobs/COO/inbox/` using standard filename format.

Include:
- Confirmation of all 5 tasks complete
- Where `<UserButton />` was placed
- How the API token injection was implemented (brief description)
- Test pass counts
- Commit hash
