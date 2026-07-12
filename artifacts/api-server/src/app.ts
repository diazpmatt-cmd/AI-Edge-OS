import express, { type Express } from "express";
import cors from "cors";
import pinoHttpImport from "pino-http";
import path from "path";
import { fileURLToPath } from "url";

const pinoHttp = (pinoHttpImport as any).default ?? pinoHttpImport;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import oauthCallbacksRouter from "./routes/oauth-callbacks";
import telnyxRouter from "./routes/telnyx";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

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

// Serve uploaded social-post images (public — no auth required for image display)
app.use("/api/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Serve custom audio greetings (public — fetched by Telnyx during calls)
app.use("/api/audio", express.static(path.join(__dirname, "..", "public", "audio")));

// PUBLIC routes — mounted before Clerk middleware (no auth required)
// OAuth callbacks: Google/Meta/TikTok redirects verified via state tokens
// Telnyx webhooks: incoming SMS/calls from Telnyx servers (verified by source IP / payload)
app.use("/api", oauthCallbacksRouter);
app.use("/api", telnyxRouter);

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
