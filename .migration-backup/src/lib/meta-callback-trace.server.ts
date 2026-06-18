/**
 * In-memory per-user trace of the most recent Meta (Facebook) OAuth callback.
 * Survives only within a single worker instance — enough to surface immediate
 * diagnostics in the Facebook Debug panel on /connections.
 */

export type MetaCallbackTrace = {
  at: string;
  fullCallbackUrl: string;
  query: Record<string, string>;
  receivedCode: boolean;
  receivedState: boolean;
  oauthError: string | null;
  oauthErrorReason: string | null;
  oauthErrorDescription: string | null;
  stateVerified: boolean | null;
  stateVerifyError: string | null;
  tokenExchange: {
    attempted: boolean;
    httpStatus: number;
    ok: boolean;
    error: string | null;
    rawSnippet: string;
    hasAccessToken: boolean;
    tokenType: string | null;
  } | null;
  longLivedExchange: {
    attempted: boolean;
    ok: boolean;
    error: string | null;
  } | null;
  meFetch: {
    attempted: boolean;
    httpStatus: number;
    ok: boolean;
    userId: string | null;
    userName: string | null;
    rawSnippet: string;
  } | null;
  permissionsFetch: {
    attempted: boolean;
    httpStatus: number;
    ok: boolean;
    granted: string[];
    declined: string[];
    rawSnippet: string;
  } | null;
  pagesFetch: {
    attempted: boolean;
    httpStatus: number;
    ok: boolean;
    count: number;
    rawSnippet: string;
    pages: Array<{
      id: string;
      name: string | null;
      tasks: string[] | null;
      category: string | null;
    }>;
  } | null;
  pageDetails: Array<{
    pageId: string;
    httpStatus: number;
    ok: boolean;
    isPublished: boolean | null;
    hasTransitionedToNewPageExperience: boolean | null;
    ownerBusiness: { id: string; name: string | null } | null;
    rawSnippet: string;
  }>;
  businessesFetch: {
    attempted: boolean;
    httpStatus: number;
    ok: boolean;
    count: number;
    rawSnippet: string;
    businesses: Array<{ id: string; name: string | null }>;
  } | null;
  ownedPagesFetch: Array<{
    businessId: string;
    businessName: string | null;
    httpStatus: number;
    ok: boolean;
    count: number;
    pageIds: string[];
    rawSnippet: string;
  }>;
  upsert: {
    attempted: boolean;
    provider: string | null;
    ok: boolean;
    error: string | null;
    userId: string | null;
  } | null;
  finalRedirect: string | null;
};

const store = new Map<string, MetaCallbackTrace>();

export function setMetaCallbackTrace(uid: string, trace: MetaCallbackTrace) {
  store.set(uid, trace);
}

export function getMetaCallbackTraceForUser(uid: string): MetaCallbackTrace | null {
  return store.get(uid) ?? null;
}
