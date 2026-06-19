/**
 * Thin fetch helper for API endpoints not yet in the generated client
 * (e.g. /api/social-connections).
 *
 * Uses `customFetch` from @workspace/api-client-react so that the base URL
 * and auth token configured via `setBaseUrl` / `setAuthTokenGetter` are
 * automatically applied.
 */
export { customFetch } from "@workspace/api-client-react";
