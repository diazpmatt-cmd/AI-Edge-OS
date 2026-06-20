---
name: Clerk auth pattern for API calls
description: Why apiFetch alone always 401s through the Vite dev proxy, and the correct useApiFetch hook pattern to use instead.
---

## Rule
Every API call to the Express/API-server MUST attach a Clerk Bearer token via the `useApiFetch()` hook from `@/lib/api`. Never use the bare `apiFetch()` function from React components.

**Why:** The Vite dev proxy (`/api/* → localhost:8080`) forwards cookies but not in a way that Clerk's Express middleware (`@clerk/express` `clerkMiddleware`) can resolve to a real `userId`. The `getAuth(req)` call returns `{userId: null}` → 401. Attaching `Authorization: Bearer <token>` (obtained via `useAuth().getToken()`) is the only reliable path in both dev and production.

**How to apply:**
- In any React component/page that calls the API: `const authFetch = useApiFetch();`
- Use `authFetch<T>(path, init?)` everywhere instead of `apiFetch<T>(path, init?)`
- The bare `apiFetch(path, init, token?)` function in `api.ts` still exists and can be used server-to-server or in non-hook contexts where you already have a token string
- Confirmed working: after the fix, `/api/social-connections` returns 304 (authenticated + cached) instead of 401

## Files
- `artifacts/ai-edge-solutions/src/lib/api.ts` — defines both `apiFetch` and `useApiFetch`
- `artifacts/ai-edge-solutions/src/pages/ConnectionsPage.tsx` — reference implementation
