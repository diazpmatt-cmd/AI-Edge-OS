import type { AuthorizationCategory } from "@workspace/development-control";
import { type GitHubApprovalExpectation, type GitHubDiagnostic, type GitHubEvidence, type GitHubIdentityPolicy } from "./types.js";

function diagnostic(code: GitHubDiagnostic["code"], evidence: GitHubEvidence, detail: string): GitHubDiagnostic { return Object.freeze({ code, evidenceId: evidence.evidenceId, detail }); }

export function evaluateApprovalEvidence(evidence: GitHubEvidence, policy: GitHubIdentityPolicy, expected: GitHubApprovalExpectation): GitHubDiagnostic {
  if (evidence.objectType !== "issue_comment" && evidence.objectType !== "pull_request_review") return diagnostic("mutable_field_rejected", evidence, "only comments and reviews can carry approval evidence");
  if (evidence.repositoryId !== policy.repositoryId || evidence.repositoryId !== expected.repositoryId || evidence.actorId !== policy.approvingActorId) return diagnostic("not_attributable", evidence, "stable repository or actor identity did not match");
  if (evidence.deleted || !evidence.approvalBinding) return diagnostic("not_found", evidence, "bounded approval binding was unavailable");
  const binding = evidence.approvalBinding;
  if (binding.taskId !== expected.taskId || binding.specificationRevision !== expected.specificationRevision) return diagnostic("revision_mismatch", evidence, "task or revision did not match");
  if (binding.specificationHash !== expected.specificationHash) return diagnostic("specification_hash_mismatch", evidence, "specification hash did not match");
  if (binding.expectedOriginMainSha !== expected.expectedOriginMainSha) return diagnostic("stale_sha", evidence, "expected origin/main SHA did not match");
  const actual = new Set<AuthorizationCategory>(binding.categories); if (expected.categories.some((category) => !actual.has(category))) return diagnostic("not_found", evidence, "one or more independently required categories were absent");
  return diagnostic("matched", evidence, "exact attributable approval binding matched");
}

export function diagnoseRef(evidence: GitHubEvidence, expectedSha: string): GitHubDiagnostic | null {
  if (evidence.objectType !== "ref" || !evidence.headSha) return null;
  if (evidence.previousHeadSha && evidence.previousHeadSha !== evidence.headSha && evidence.previousHeadSha !== expectedSha) return diagnostic("force_push_detected", evidence, "authoritative ref history changed");
  return evidence.headSha === expectedSha ? null : diagnostic("stale_sha", evidence, "authoritative ref does not contain expected SHA");
}
