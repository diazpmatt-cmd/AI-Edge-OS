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
import { logger } from "./lib/logger";
import { bootstrapPublishingMutationGuard } from "./lib/publishing-mutation-guard";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requireInternalPublishAdapter } from "./middlewares/internalPublishAdapterMiddleware";
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

try {
  await bootstrapPublishingMutationGuard();
} catch (error) {
  logger.error(
    {
      err: error instanceof Error ? error.message : String(error),
    },
    "[publishing-mutation-guard] database trigger bootstrap failed",
  );
}

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
// Block both unauthenticated and signed-in direct calls before the main router;
// canonical callers supply the shared in-process scheduler secret.
app.use("/api/social-posts/:id/publish", requireInternalPublishAdapter);

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

app.use("/api", router);

export default app;
