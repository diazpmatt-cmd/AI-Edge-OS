import { Router }  from "express";
import { getAuth } from "@clerk/express";
import {
  db, pool,
  DrizzleBacklinkRepository,
  FixtureBacklinkDataProvider,
  BBB_FIXTURE_BACKLINK_OBSERVATIONS,
  BBB_BACKLINK_ALLOWED_SERVICES,
  BBB_BACKLINK_BLOCKED_PHRASES,
  ingestFixtureBacklinks,
  BACKLINK_MAX_PAGE_SIZE,
  type BacklinkWorkflowStatus,
  type BacklinkOpportunityCategory,
} from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";

const router = Router();
const repo   = new DrizzleBacklinkRepository(db);

function isRelationMissingError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "42P01";
  }
  return false;
}

async function resolveClient(req: any, res: any): Promise<{ userId: string; client: { id: string; [key: string]: unknown } } | null> {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return null;
  }
  if (!resolved.found) {
    res.status(404).json({ error: "client_not_found", reason: resolved.reason });
    return null;
  }
  return { userId, client: resolved.client };
}

// ── GET /api/backlinks/opportunities ─────────────────────────────────────────

router.get("/api/backlinks/opportunities", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit  = Math.min(BACKLINK_MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit)  || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const category       = req.query.category       as BacklinkOpportunityCategory | undefined;
  const workflowStatus = req.query.workflowStatus as BacklinkWorkflowStatus       | undefined;

  try {
    const result = await repo.listOpportunities(client.id, {
      limit,
      offset,
      ...(category       && { category }),
      ...(workflowStatus && { workflowStatus }),
    });
    res.json(result);
  } catch (err) {
    if (isRelationMissingError(err)) { res.json({ items: [], limit, offset }); return; }
    console.error("[backlinks] listOpportunities error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/opportunities/:id ─────────────────────────────────────

router.get("/api/backlinks/opportunities/:id", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const { id } = req.params;
  if (!id?.trim()) { res.status(400).json({ error: "id_required" }); return; }

  try {
    const opportunity = await repo.getOpportunityById(id, client.id);
    if (!opportunity) { res.status(404).json({ error: "not_found" }); return; }

    const [wfRes, evidence] = await Promise.all([
      pool.query<{
        id: string; client_id: string; opportunity_id: string; status: string;
        owner_id: string | null; next_action: string | null; due_at: Date | null;
        outcome_summary: string | null; version: number;
        created_at: Date; updated_at: Date; completed_at: Date | null;
      }>(
        `SELECT id, client_id, opportunity_id, status, owner_id, next_action, due_at,
                outcome_summary, version, created_at, updated_at, completed_at
         FROM backlink_workflows
         WHERE opportunity_id = $1 AND client_id = $2 LIMIT 1`,
        [id, client.id],
      ),
      repo.listEvidenceForProspect(opportunity.prospectId, client.id),
    ]);

    res.json({ opportunity, workflow: wfRes.rows[0] ?? null, evidence });
  } catch (err) {
    if (isRelationMissingError(err)) { res.status(404).json({ error: "not_found" }); return; }
    console.error("[backlinks] getOpportunityById error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── PATCH /api/backlinks/workflows/:opportunityId ─────────────────────────────

router.patch("/api/backlinks/workflows/:opportunityId", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { userId, client } = auth;

  const { opportunityId } = req.params;
  if (!opportunityId?.trim()) { res.status(400).json({ error: "opportunityId_required" }); return; }

  const { toStatus, reason, ownerId, nextAction, dueAt, outcomeSummary } = req.body as {
    toStatus?:        BacklinkWorkflowStatus;
    reason?:          string;
    ownerId?:         string;
    nextAction?:      string;
    dueAt?:           string;
    outcomeSummary?:  string;
  };

  if (!toStatus) { res.status(400).json({ error: "toStatus_required" }); return; }

  try {
    const workflow = await repo.transitionWorkflow(opportunityId, client.id, {
      toStatus,
      actorId:        userId,
      reason:         reason         ?? null,
      ownerId:        ownerId        ?? null,
      nextAction:     nextAction     ?? null,
      dueAt:          dueAt          ? new Date(dueAt) : null,
      outcomeSummary: outcomeSummary ?? null,
    });
    res.json({ workflow });
  } catch (err: any) {
    if (err?.message?.includes("invalid transition") || err?.message?.includes("not found")) {
      res.status(400).json({ error: "invalid_transition", message: err.message });
      return;
    }
    if (isRelationMissingError(err)) { res.status(404).json({ error: "not_found" }); return; }
    console.error("[backlinks] transitionWorkflow error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── GET /api/backlinks/runs ───────────────────────────────────────────────────

router.get("/api/backlinks/runs", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  try {
    const result = await pool.query(
      `SELECT id, client_id, provider_id, provider_revision, mode, status, capabilities,
              attempt_count, started_at, attempt_started_at, completed_at,
              counts_observed, counts_accepted, counts_rejected, counts_merged_evidence,
              counts_prospect_count, counts_evidence_count, counts_opportunity_count, counts_workflow_count,
              failure_stage, failure_code
       FROM backlink_ingestion_runs
       WHERE client_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [client.id, limit],
    );
    res.json({ runs: result.rows });
  } catch (err) {
    if (isRelationMissingError(err)) { res.json({ runs: [] }); return; }
    console.error("[backlinks] listRuns error:", err);
    res.status(500).json({ error: "db_error" });
  }
});

// ── POST /api/backlinks/ingest/fixture ───────────────────────────────────────

router.post("/api/backlinks/ingest/fixture", async (req, res): Promise<void> => {
  const auth = await resolveClient(req, res);
  if (!auth) return;
  const { client } = auth;

  const now      = new Date();
  const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);

  try {
    const result = await ingestFixtureBacklinks({
      trustedClientId: client.id,
      provider,
      discovery: {
        clientId:           client.id,
        clientDomain:       "bedbugsbeyond.com",
        competitorDomains:  [],
        serviceIds:         [...BBB_BACKLINK_ALLOWED_SERVICES],
        city:               "Foley",
        region:             "Baldwin County, Alabama",
        limit:              50,
      },
      normalizationPolicy: {
        allowedServiceIds: BBB_BACKLINK_ALLOWED_SERVICES,
        blockedPhrases:    [...BBB_BACKLINK_BLOCKED_PHRASES],
        now,
      },
      repository: repo,
      now,
    });
    res.json(result);
  } catch (err: any) {
    console.error("[backlinks] ingest fixture error:", err);
    res.status(500).json({ error: "ingest_failed", message: err?.message ?? "Unknown error" });
  }
});

export default router;
