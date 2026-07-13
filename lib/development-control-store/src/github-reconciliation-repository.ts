import { GitHubReconciliationError, type GitHubEvidence, type GitHubReconciliationCursor, type GitHubReconciliationStore, type GitHubReconciliationSummary } from "@workspace/development-control-github";
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

function freezeSummary(summary: GitHubReconciliationSummary): GitHubReconciliationSummary {
  return Object.freeze({ ...summary, evidenceIds: Object.freeze([...summary.evidenceIds]), diagnostics: Object.freeze(summary.diagnostics.map((item) => Object.freeze({ ...item }))), nextCursor: Object.freeze({ ...summary.nextCursor }) });
}

export class InMemoryGitHubReconciliationRepository implements GitHubReconciliationStore {
  private evidence = new Map<string, GitHubEvidence>();
  private cursors = new Map<string, GitHubReconciliationCursor>();
  private runs = new Map<string, { requestFingerprint: string; summary: GitHubReconciliationSummary }>();
  failBeforeCommit = false;

  private key(repositoryId: string, stream: string): string { return `${repositoryId}:${stream}`; }
  async loadCursor(repositoryId: string, stream: string): Promise<GitHubReconciliationCursor | null> { return this.cursors.get(this.key(repositoryId, stream)) ?? null; }
  async persistAtomic(input: { readonly operationKey: string; readonly requestFingerprint: string; readonly evidence: readonly GitHubEvidence[]; readonly summary: GitHubReconciliationSummary }): Promise<GitHubReconciliationSummary> {
    const existing = this.runs.get(input.operationKey);
    if (existing) { if (existing.requestFingerprint !== input.requestFingerprint) throw new GitHubReconciliationError("IDEMPOTENCY_CONFLICT", "operation key reused for different reconciliation input"); return existing.summary; }
    const nextEvidence = new Map(this.evidence); const nextCursors = new Map(this.cursors); const nextRuns = new Map(this.runs);
    for (const item of input.evidence) { const prior = nextEvidence.get(item.evidenceId); if (prior && prior.fingerprint !== item.fingerprint) throw new GitHubReconciliationError("IDEMPOTENCY_CONFLICT", "evidence identity conflict"); nextEvidence.set(item.evidenceId, Object.freeze({ ...item })); }
    const summary = freezeSummary(input.summary); nextCursors.set(this.key(summary.repositoryId, summary.stream), summary.nextCursor); nextRuns.set(input.operationKey, { requestFingerprint: input.requestFingerprint, summary });
    if (this.failBeforeCommit) throw new GitHubReconciliationError("STORE_UNAVAILABLE", "atomic fixture failure");
    this.evidence = nextEvidence; this.cursors = nextCursors; this.runs = nextRuns; return summary;
  }
  listEvidence(): readonly GitHubEvidence[] { return Object.freeze([...this.evidence.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId))); }
  listRuns(): readonly GitHubReconciliationSummary[] { return Object.freeze([...this.runs.values()].map((value) => value.summary).sort((a, b) => a.runId.localeCompare(b.runId))); }
}

export class PostgresGitHubReconciliationRepository implements GitHubReconciliationStore {
  constructor(private readonly db: Database) {}
  async loadCursor(repositoryId: string, stream: string): Promise<GitHubReconciliationCursor | null> {
    const [row] = await this.db.select().from(schema.developmentGitHubReconciliationCursorsTable).where(and(eq(schema.developmentGitHubReconciliationCursorsTable.repositoryId, repositoryId), eq(schema.developmentGitHubReconciliationCursorsTable.stream, stream))).limit(1);
    return row ? Object.freeze({ repositoryId: row.repositoryId, stream: row.stream, cursor: row.cursor, etag: row.etag, lastObservedAt: row.lastObservedAt?.toISOString() ?? null, retryAt: row.retryAt?.toISOString() ?? null, version: row.version }) : null;
  }
  async persistAtomic(input: { readonly operationKey: string; readonly requestFingerprint: string; readonly evidence: readonly GitHubEvidence[]; readonly summary: GitHubReconciliationSummary }): Promise<GitHubReconciliationSummary> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.operationKey}))`);
      const [existing] = await tx.select().from(schema.developmentGitHubReconciliationRunsTable).where(eq(schema.developmentGitHubReconciliationRunsTable.operationKey, input.operationKey)).orderBy(asc(schema.developmentGitHubReconciliationRunsTable.recordedAt)).limit(1);
      if (existing) { if (existing.requestFingerprint !== input.requestFingerprint) throw new GitHubReconciliationError("IDEMPOTENCY_CONFLICT", "operation key reused for different reconciliation input"); return freezeSummary(existing.summary); }
      const recordedAt = new Date();
      for (const item of input.evidence) {
        if (item.actorId && item.actorLogin) await tx.insert(schema.developmentGitHubIdentitiesTable).values({ repositoryId: item.repositoryId, actorId: item.actorId, displayLogin: item.actorLogin, firstObservedAt: new Date(item.createdAt), lastObservedAt: new Date(item.updatedAt) }).onConflictDoUpdate({ target: [schema.developmentGitHubIdentitiesTable.repositoryId, schema.developmentGitHubIdentitiesTable.actorId], set: { displayLogin: item.actorLogin, lastObservedAt: new Date(item.updatedAt) } });
        await tx.insert(schema.developmentGitHubEvidenceTable).values({ evidenceId: item.evidenceId, fingerprint: item.fingerprint, repositoryId: item.repositoryId, repositoryName: item.repositoryName, objectType: item.objectType, objectId: item.objectId, sourceUrl: item.sourceUrl, actorId: item.actorId, actorLogin: item.actorLogin, sourceCreatedAt: new Date(item.createdAt), sourceUpdatedAt: new Date(item.updatedAt), contentHash: item.contentHash, deleted: item.deleted, approvalBinding: item.approvalBinding, headSha: item.headSha, previousHeadSha: item.previousHeadSha, recordedAt }).onConflictDoNothing();
      }
      const next = input.summary.nextCursor;
      await tx.insert(schema.developmentGitHubReconciliationCursorsTable).values({ repositoryId: next.repositoryId, stream: next.stream, cursor: next.cursor, etag: next.etag, lastObservedAt: next.lastObservedAt ? new Date(next.lastObservedAt) : null, retryAt: next.retryAt ? new Date(next.retryAt) : null, version: next.version, updatedAt: recordedAt }).onConflictDoUpdate({ target: [schema.developmentGitHubReconciliationCursorsTable.repositoryId, schema.developmentGitHubReconciliationCursorsTable.stream], set: { cursor: next.cursor, etag: next.etag, lastObservedAt: next.lastObservedAt ? new Date(next.lastObservedAt) : null, retryAt: next.retryAt ? new Date(next.retryAt) : null, version: next.version, updatedAt: recordedAt } });
      await tx.insert(schema.developmentGitHubReconciliationRunsTable).values({ runId: input.summary.runId, repositoryId: input.summary.repositoryId, stream: input.summary.stream, operationKey: input.operationKey, requestFingerprint: input.requestFingerprint, status: input.summary.status, diagnostics: input.summary.diagnostics, summary: input.summary, recordedAt });
      return freezeSummary(input.summary);
    });
  }
}
