import { deterministicHash } from "@workspace/development-control";
import { GitHubReconciliationError, type GitHubApprovalBinding, type GitHubDiagnostic, type GitHubEvidence, type GitHubSourceObservation } from "./types";

const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;
const SHA = /^[0-9a-f]{40}$/;
const SPEC_HASH = /^spec_[0-9a-f]{64}$/;
const ALLOWED_TYPES = new Set(["repository", "actor", "issue", "issue_comment", "pull_request_review", "pull_request", "commit", "ref", "check_run", "commit_status"]);

function bounded(value: string, field: string, max: number): string {
  const result = value.trim();
  if (!result || result.length > max) throw new GitHubReconciliationError("INVALID_OBSERVATION", `${field} is invalid`);
  return result;
}

function timestamp(value: string): string {
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new GitHubReconciliationError("INVALID_OBSERVATION", "timestamp must be canonical ISO-8601");
  return normalized;
}

export function extractApprovalBinding(content: string | null): GitHubApprovalBinding | null {
  if (!content || content.length > 20_000) return null;
  const task = content.match(/(?:^|\n)-?\s*Task(?: ID)?:\s*([A-Z0-9-]{1,100})\s*(?:\n|$)/i)?.[1];
  const revision = content.match(/(?:^|\n)-?\s*Specification revision:\s*([0-9]{1,9})\s*(?:\n|$)/i)?.[1];
  const hash = content.match(/(?:^|\n)(?:Canonical specification hash:\s*\n\s*|-?\s*Specification hash:\s*)(spec_[0-9a-f]{64})\s*(?:\n|$)/i)?.[1];
  const sha = content.match(/(?:^|\n)-?\s*Expected origin\/main SHA:\s*([0-9a-f]{40})\s*(?:\n|$)/i)?.[1];
  const categoryBlock = content.match(/Authorized categories:\s*\n((?:\s*-\s*(?:Scope|Editing|Committing|Pushing|Merging|Deployment|Credentials|Paid providers|External actions)\s*\n?)+)/i)?.[1];
  if (!task || !revision || !hash || !sha || !categoryBlock || !SPEC_HASH.test(hash) || !SHA.test(sha)) return null;
  const categories = [...categoryBlock.matchAll(/-\s*(Scope|Editing|Committing|Pushing|Merging|Deployment|Credentials|Paid providers|External actions)/gi)].map((match) => match[1].toLowerCase().replaceAll(" ", "_").replace("paid_providers", "paid_provider").replace("external_actions", "external_action"));
  return Object.freeze({ taskId: task, specificationRevision: Number(revision), specificationHash: hash, expectedOriginMainSha: sha, categories: Object.freeze([...new Set(categories)].sort()) }) as GitHubApprovalBinding;
}

export function normalizeGitHubObservation(input: GitHubSourceObservation): GitHubEvidence {
  if ("clientId" in input || "tenantId" in input || "customerId" in input) throw new GitHubReconciliationError("CUSTOMER_IDENTITY_FORBIDDEN", "customer identity is forbidden");
  if (!NUMERIC_ID.test(input.repositoryId) || !NUMERIC_ID.test(input.objectId) || !ALLOWED_TYPES.has(input.objectType)) throw new GitHubReconciliationError("INVALID_OBSERVATION", "stable numeric identities are required");
  if (input.actorId !== null && !NUMERIC_ID.test(input.actorId)) throw new GitHubReconciliationError("INVALID_OBSERVATION", "stable numeric actor identity is required");
  const sourceUrl = input.sourceUrl.trim();
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.\-\/]+(?:#[A-Za-z0-9_.\-]+)?$/.test(sourceUrl)) throw new GitHubReconciliationError("INVALID_OBSERVATION", "canonical GitHub source URL required");
  const content = input.content === null ? null : input.content.trim();
  if (content !== null && content.length > 20_000) throw new GitHubReconciliationError("INVALID_OBSERVATION", "bounded content required");
  const createdAt = timestamp(input.createdAt); const updatedAt = timestamp(input.updatedAt);
  const contentHash = deterministicHash({ content, deleted: input.deleted === true }, "content");
  const fingerprint = deterministicHash({ repositoryId: input.repositoryId, objectType: input.objectType, objectId: input.objectId, updatedAt, contentHash }, "github_observation");
  const evidenceId = deterministicHash({ repositoryId: input.repositoryId, objectType: input.objectType, objectId: input.objectId, fingerprint }, "github_evidence");
  return Object.freeze({ evidenceId, fingerprint, repositoryId: input.repositoryId, repositoryName: bounded(input.repositoryName, "repositoryName", 200), objectType: input.objectType, objectId: input.objectId, sourceUrl, actorId: input.actorId, actorLogin: input.actorLogin === null ? null : bounded(input.actorLogin, "actorLogin", 100), createdAt, updatedAt, contentHash, deleted: input.deleted === true, approvalBinding: input.objectType === "issue_comment" || input.objectType === "pull_request_review" ? extractApprovalBinding(content) : null, headSha: input.headSha?.toLowerCase() ?? null, previousHeadSha: input.previousHeadSha?.toLowerCase() ?? null });
}

export function normalizeGitHubObservations(inputs: readonly GitHubSourceObservation[]): readonly GitHubEvidence[] {
  const byFingerprint = new Map<string, GitHubEvidence>();
  for (const input of inputs) { const evidence = normalizeGitHubObservation(input); const prior = byFingerprint.get(evidence.fingerprint); if (prior && prior.evidenceId !== evidence.evidenceId) throw new GitHubReconciliationError("IDEMPOTENCY_CONFLICT", "observation fingerprint conflict"); byFingerprint.set(evidence.fingerprint, evidence); }
  return Object.freeze([...byFingerprint.values()].sort((a, b) => {
    const prefix = a.updatedAt.localeCompare(b.updatedAt) || a.objectType.localeCompare(b.objectType);
    if (prefix) return prefix;
    const numeric = BigInt(a.objectId) < BigInt(b.objectId) ? -1 : BigInt(a.objectId) > BigInt(b.objectId) ? 1 : 0;
    return numeric || a.fingerprint.localeCompare(b.fingerprint);
  }));
}

export function diagnoseObservationConflicts(evidence: readonly GitHubEvidence[]): readonly GitHubDiagnostic[] {
  const groups = new Map<string, GitHubEvidence[]>();
  for (const item of evidence) {
    const key = `${item.repositoryId}:${item.objectType}:${item.objectId}:${item.updatedAt}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Object.freeze([...groups.values()].filter((items) => new Set(items.map((item) => item.contentHash)).size > 1).flatMap((items) => items.map((item) => Object.freeze({ code: "conflicting_evidence" as const, evidenceId: item.evidenceId, detail: "same authoritative object version carried different bounded content" }))).sort((a, b) => (a.evidenceId ?? "").localeCompare(b.evidenceId ?? "")));
}
