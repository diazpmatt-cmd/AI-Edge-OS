import express, { type Express } from "express";
import cors from "cors";
import pinoHttpImport from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import oauthCallbacksRouter from "./routes/oauth-callbacks";
import leadDeliveryWebhooksRouter from "./routes/lead-delivery-webhooks";
import telnyxRouter from "./routes/telnyx";
import competitorIntelligenceRouter from "./routes/competitor-intelligence";
import authorityProfileRouter from "./routes/authority-profile";
import backlinkScheduledSafetyRouter from "./routes/backlink-scheduled-safety";
import backlinkOpportunityIntelligenceRouter from "./routes/backlink-opportunity-intelligence";
import authorityOutreachDraftRouter from "./routes/authority-outreach-draft";
import authorityOutreachReadinessRouter from "./routes/authority-outreach-readiness";
import authorityTargetContactsRouter from "./routes/authority-target-contacts";
import authorityAcquisitionProofsRouter from "./routes/authority-acquisition-proofs";
import backlinkWorkflowPatchSafeRouter from "./routes/backlink-workflow-patch-safe";
import backlinkWorkflowActionsRouter from "./routes/backlink-workflow-actions";
import backlinksRouter from "./routes/backlinks";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requireInternalPublishAdapter } from "./middlewares/internalPublishAdapterMiddleware";
import { persistInternalPublishAdapterReceipts } from "./middlewares/internalPublishReceiptMiddleware";
import { rejectPublishingPostMutation } from "./middlewares/publishingMutationGuardMiddleware";

const pinoHttp = (pinoHttpImport as any).default ?? pinoHttpImport;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.join(
  __dirname,
  "..",
  "..",
  "ai-edge-solutions",
  "dist",
  "public",
);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res: any) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api/audio", express.static(path.join(__dirname, "..", "public", "audio")));

app.use(express.static(frontendDir));
app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/api/version", (_req, res) => {
  res.json({
    commit: process.env.APP_COMMIT_SHA || "unknown",
    branch: process.env.COOLIFY_BRANCH || "unknown",
    resource: process.env.COOLIFY_RESOURCE_UUID || "unknown",
    builtAt: process.env.APP_BUILD_TIME || "unknown",
  });
});

// PUBLIC routes — mounted before Clerk middleware (no auth required).
// Lifecycle correlation runs before the existing Telnyx handlers and always
// calls next(), preserving the current call-control and inbound intake flow.
app.use("/api", oauthCallbacksRouter);
app.use("/api", leadDeliveryWebhooksRouter);
app.use("/api", telnyxRouter);

// Provider adapters are an internal implementation detail of PublishingService.
// Block direct calls and persist their provider receipts before releasing the
// internal response to the canonical publishing pipeline.
app.use(
  "/api/social-posts/:id/publish",
  requireInternalPublishAdapter,
  persistInternalPublishAdapterReceipts,
);

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Friendly API boundary for every known user mutation that could alter or
// remove an approved payload while provider delivery is in flight. PostgreSQL's
// trigger remains the atomic authority if state changes after this read check.
app.patch("/api/social-posts/:id", rejectPublishingPostMutation);
app.delete("/api/social-posts/:id", rejectPublishingPostMutation);
app.post("/api/social-posts/bulk/publish", rejectPublishingPostMutation);
for (const pathSuffix of [
  "approve",
  "queue",
  "cancel",
  "image-match",
  "retry",
  "archive",
  "restore",
]) {
  app.post(
    `/api/social-posts/:id/${pathSuffix}`,
    rejectPublishingPostMutation,
  );
}

// These Authority/backlink routers were authored with canonical `/api/...`
// paths already included. Mount them once at the app root after Clerk so their
// public contract remains `/api/...` rather than the accidental `/api/api/...`
// produced when they are nested under the shared API router.
app.use(competitorIntelligenceRouter);
app.use(authorityProfileRouter);
app.use(backlinkScheduledSafetyRouter);
app.use(backlinkOpportunityIntelligenceRouter);
app.use(authorityOutreachDraftRouter);
app.use(authorityOutreachReadinessRouter);
app.use(authorityTargetContactsRouter);
app.use(authorityAcquisitionProofsRouter);
app.use(backlinkWorkflowPatchSafeRouter);
app.use(backlinkWorkflowActionsRouter);
app.use(backlinksRouter);

app.use("/api", router);

export default app;
