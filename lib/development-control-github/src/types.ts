import type { AuthorizationCategory } from "@workspace/development-control";

export type GitHubObjectType = "repository" | "actor" | "issue" | "issue_comment" | "pull_request_review" | "pull_request" | "commit" | "ref" | "check_run" | "commit_status";
export type GitHubDiagnosticCode = "matched" | "not_found" | "not_attributable" | "mutable_field_rejected" | "revision_mismatch" | "specification_hash_mismatch" | "stale_sha" | "force_push_detected" | "conflicting_evidence" | "rate_limited" | "secondary_rate_limited" | "unavailable" | "lagging";
export type GitHubReadMethod = "GET" | "HEAD";

export interface GitHubApprovalBinding { readonly taskId: string; readonly specificationRevision: number; readonly specificationHash: string; readonly expectedOriginMainSha: string; readonly categories: readonly AuthorizationCategory[]; }

/** Transient caller-supplied observation. Content is hashed/extracted, never persisted. */
export interface GitHubSourceObservation {
  readonly repositoryId: string; readonly repositoryName: string; readonly objectType: GitHubObjectType; readonly objectId: string; readonly sourceUrl: string;
  readonly actorId: string | null; readonly actorLogin: string | null; readonly createdAt: string; readonly updatedAt: string; readonly content: string | null;
  readonly deleted?: boolean; readonly mutableField?: boolean; readonly headSha?: string | null; readonly previousHeadSha?: string | null;
}

export interface GitHubEvidence {
  readonly evidenceId: string; readonly fingerprint: string; readonly repositoryId: string; readonly repositoryName: string; readonly objectType: GitHubObjectType; readonly objectId: string;
  readonly sourceUrl: string; readonly actorId: string | null; readonly actorLogin: string | null; readonly createdAt: string; readonly updatedAt: string; readonly contentHash: string;
  readonly deleted: boolean; readonly approvalBinding: GitHubApprovalBinding | null; readonly headSha: string | null; readonly previousHeadSha: string | null;
}

export interface GitHubDiagnostic { readonly code: GitHubDiagnosticCode; readonly evidenceId: string | null; readonly detail: string; }
export interface GitHubIdentityPolicy { readonly repositoryId: string; readonly approvingActorId: string; }
export interface GitHubApprovalExpectation extends GitHubApprovalBinding { readonly repositoryId: string; }
export interface GitHubReadRequest { readonly method: GitHubReadMethod; readonly repositoryId: string; readonly stream: string; readonly cursor: string | null; readonly etag: string | null; }
export interface GitHubRateLimitObservation { readonly kind: "primary" | "secondary"; readonly retryAfterSeconds: number | null; readonly resetAt: string | null; }
export interface GitHubReadPage { readonly status: 200 | 304 | 403 | 429 | 503; readonly observations: readonly GitHubSourceObservation[]; readonly nextCursor: string | null; readonly etag: string | null; readonly rateLimit: GitHubRateLimitObservation | null; }
export interface ReadOnlyGitHubClient { read(request: GitHubReadRequest): Promise<GitHubReadPage>; }
export interface GitHubReconciliationCursor { readonly repositoryId: string; readonly stream: string; readonly cursor: string | null; readonly etag: string | null; readonly lastObservedAt: string | null; readonly retryAt: string | null; readonly version: number; }
export interface GitHubReconciliationSummary { readonly runId: string; readonly repositoryId: string; readonly stream: string; readonly status: "succeeded" | "not_modified" | "rate_limited" | "unavailable"; readonly evidenceIds: readonly string[]; readonly diagnostics: readonly GitHubDiagnostic[]; readonly nextCursor: GitHubReconciliationCursor; }
export interface GitHubReconciliationStore { loadCursor(repositoryId: string, stream: string): Promise<GitHubReconciliationCursor | null>; persistAtomic(input: { readonly operationKey: string; readonly requestFingerprint: string; readonly evidence: readonly GitHubEvidence[]; readonly summary: GitHubReconciliationSummary; }): Promise<GitHubReconciliationSummary>; }
export interface GitHubClock { now(): string; }
export class GitHubReconciliationError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "GitHubReconciliationError"; } }
