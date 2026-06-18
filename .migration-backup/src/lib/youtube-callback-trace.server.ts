/**
 * In-memory store for the most recent YouTube OAuth callback trace per user.
 * Survives only within a single worker instance — good enough to surface
 * the immediate callback diagnostics on /connections.
 */

export type YouTubeCallbackTrace = {
  at: string;
  fullCallbackUrl: string;
  query: Record<string, string>;
  receivedCode: boolean;
  receivedState: boolean;
  reachedConsent: boolean; // true if Google returned us to the callback (with code OR error). false if we never got back.
  oauthError: string | null;
  oauthErrorDescription: string | null;
  oauthErrorSubtype: string | null;
  oauthErrorUri: string | null;
  stateVerified: boolean | null;
  stateVerifyError: string | null;
  tokenExchange: {
    attempted: boolean;
    httpStatus: number;
    ok: boolean;
    error: string | null;
    errorDescription: string | null;
    errorSubtype: string | null;
    rawSnippet: string;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    grantedScope: string | null;
    expiresIn: number | null;
    tokenType: string | null;
  } | null;
  channelFetch: {
    attempted: boolean;
    httpStatus: number;
    ok: boolean;
    channelId: string | null;
    channelTitle: string | null;
    rawSnippet: string;
  } | null;
  upsertError: string | null;
  finalRedirect: string | null;
};

const store = new Map<string, YouTubeCallbackTrace>();

export function setYouTubeCallbackTrace(uid: string, trace: YouTubeCallbackTrace) {
  store.set(uid, trace);
}

export function getYouTubeCallbackTrace(uid: string): YouTubeCallbackTrace | null {
  return store.get(uid) ?? null;
}
