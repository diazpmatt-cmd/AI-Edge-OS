import { deterministicHash } from "@workspace/development-control";
import { evaluateApprovalEvidence, diagnoseRef } from "./identity.js";
import { diagnoseObservationConflicts, normalizeGitHubObservations } from "./normalizer.js";
import { calculateBackoff, diagnoseReconciliationLag } from "./rate-limit.js";
import { GitHubReconciliationError, type GitHubApprovalExpectation, type GitHubClock, type GitHubDiagnostic, type GitHubIdentityPolicy, type GitHubReconciliationCursor, type GitHubReconciliationStore, type GitHubReconciliationSummary, type ReadOnlyGitHubClient } from "./types.js";

function cursor(input: Partial<GitHubReconciliationCursor> & Pick<GitHubReconciliationCursor, "repositoryId" | "stream">): GitHubReconciliationCursor {
  return Object.freeze({ repositoryId: input.repositoryId, stream: input.stream, cursor: input.cursor ?? null, etag: input.etag ?? null, lastObservedAt: input.lastObservedAt ?? null, retryAt: input.retryAt ?? null, version: input.version ?? 1 });
}

export async function reconcileGitHub(input: { readonly repositoryId: string; readonly stream: string; readonly client: ReadOnlyGitHubClient; readonly store: GitHubReconciliationStore; readonly clock: GitHubClock; readonly identityPolicy: GitHubIdentityPolicy; readonly approvalExpectation?: GitHubApprovalExpectation; readonly attempt?: number }): Promise<GitHubReconciliationSummary> {
  if ("clientId" in input || "tenantId" in input || "customerId" in input) throw new GitHubReconciliationError("CUSTOMER_IDENTITY_FORBIDDEN", "customer identity is forbidden");
  const current = await input.store.loadCursor(input.repositoryId, input.stream) ?? cursor({ repositoryId: input.repositoryId, stream: input.stream });
  const page = await input.client.read({ method: "GET", repositoryId: input.repositoryId, stream: input.stream, cursor: current.cursor, etag: current.etag });
  const streamKey = `${input.repositoryId}:${input.stream}`;
  if (page.status === 403 || page.status === 429) {
    if (!page.rateLimit) throw new GitHubReconciliationError("INVALID_READ_RESPONSE", "rate-limit observation required");
    const backoff = calculateBackoff({ observation: page.rateLimit, attempt: input.attempt ?? 0, clock: input.clock });
    const nextCursor = cursor({ ...current, retryAt: backoff.retryAt });
    const requestFingerprint = deterministicHash({ streamKey, status: backoff.diagnostic, retryAt: backoff.retryAt }, "github_request");
    const summary = Object.freeze({ runId: deterministicHash({ streamKey, requestFingerprint }, "github_run"), repositoryId: input.repositoryId, stream: input.stream, status: "rate_limited" as const, evidenceIds: Object.freeze([]), diagnostics: Object.freeze([{ code: backoff.diagnostic, evidenceId: null, detail: "bounded retry is required" }]), nextCursor });
    return input.store.persistAtomic({ operationKey: `${streamKey}:${requestFingerprint}`, requestFingerprint, evidence: Object.freeze([]), summary });
  }
  if (page.status === 503) {
    const requestFingerprint = deterministicHash({ streamKey, status: "unavailable", at: input.clock.now() }, "github_request");
    const summary = Object.freeze({ runId: deterministicHash({ streamKey, requestFingerprint }, "github_run"), repositoryId: input.repositoryId, stream: input.stream, status: "unavailable" as const, evidenceIds: Object.freeze([]), diagnostics: Object.freeze([{ code: "unavailable" as const, evidenceId: null, detail: "GitHub observation source unavailable" }]), nextCursor: current });
    return input.store.persistAtomic({ operationKey: `${streamKey}:${requestFingerprint}`, requestFingerprint, evidence: Object.freeze([]), summary });
  }
  const evidence = page.status === 304 ? Object.freeze([]) : normalizeGitHubObservations(page.observations);
  const diagnostics: GitHubDiagnostic[] = [];
  diagnostics.push(...diagnoseObservationConflicts(evidence));
  for (const item of evidence) {
    if (item.objectType === "issue_comment" || item.objectType === "pull_request_review" || item.approvalBinding) {
      if (input.approvalExpectation) diagnostics.push(evaluateApprovalEvidence(item, input.identityPolicy, input.approvalExpectation));
    } else if (item.objectType === "issue") diagnostics.push(Object.freeze({ code: "mutable_field_rejected", evidenceId: item.evidenceId, detail: "mutable issue fields are proposal context only" }));
    if (input.approvalExpectation) { const refDiagnostic = diagnoseRef(item, input.approvalExpectation.expectedOriginMainSha); if (refDiagnostic) diagnostics.push(refDiagnostic); }
  }
  const lastObservedAt = evidence.length ? evidence[evidence.length - 1].updatedAt : current.lastObservedAt;
  const lagDiagnostic = diagnoseReconciliationLag(lastObservedAt, input.clock);
  if (lagDiagnostic) diagnostics.push(lagDiagnostic);
  const nextCursor = cursor({ repositoryId: input.repositoryId, stream: input.stream, cursor: page.status === 304 ? current.cursor : page.nextCursor, etag: page.etag ?? current.etag, lastObservedAt, retryAt: null, version: current.version + 1 });
  const requestFingerprint = deterministicHash({ streamKey, status: page.status, evidence: evidence.map((item) => item.fingerprint), nextCursor: page.status === 304 ? current.cursor : page.nextCursor }, "github_request");
  const operationKey = `${streamKey}:${requestFingerprint}`;
  const summary: GitHubReconciliationSummary = Object.freeze({ runId: deterministicHash({ operationKey, requestFingerprint }, "github_run"), repositoryId: input.repositoryId, stream: input.stream, status: page.status === 304 ? "not_modified" : "succeeded", evidenceIds: Object.freeze(evidence.map((item) => item.evidenceId)), diagnostics: Object.freeze(diagnostics.sort((a, b) => (a.evidenceId ?? "").localeCompare(b.evidenceId ?? "") || a.code.localeCompare(b.code))), nextCursor });
  return input.store.persistAtomic({ operationKey, requestFingerprint, evidence, summary });
}
