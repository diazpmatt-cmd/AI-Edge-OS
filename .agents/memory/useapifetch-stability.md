---
name: useApiFetch hook stability
description: Why useApiFetch uses useCallback([getToken]) and what breaks without it.
---

# useApiFetch — Identity Stability

The hook in `src/lib/api.ts` wraps the returned `authFetch` function with `useCallback([getToken])`.

**Why:** Without memoization, `useApiFetch()` returns a new function identity every render. Any page that puts `apiFetch` in a `useCallback`/`useEffect`/`useMemo` dependency array creates an infinite loop: new `apiFetch` → new callback → effect fires → re-render → new `apiFetch` → …

**How to apply:**
- `getToken` from Clerk's `useAuth()` is stable — it only changes on auth state changes, not on every render. Safe to use as the sole dep.
- Token is fetched fresh at call time (`await getToken()`) inside the callback — no stale JWT risk.
- Pages should use `[apiFetch]` in dep arrays (not `[]`) now that the hook is stable. The `useRef` workaround pattern is obsolete.
- Adding a hook inside a custom hook during an HMR hot-reload causes a one-time "hooks called in different order" error in open browser tabs. This is an HMR artifact only — a full page refresh clears it.
