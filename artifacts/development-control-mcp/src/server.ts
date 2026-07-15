import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { createDab3cNodeHandler, type Dab3cEnvironment } from "./activation.js";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 3000;
const SHUTDOWN_GRACE_MS = 10_000;

export interface StandaloneBindAddress {
  readonly host: string;
  readonly port: number;
}

export function resolveStandaloneBindAddress(
  environment: Dab3cEnvironment,
): StandaloneBindAddress {
  const host = environment.HOST?.trim() || DEFAULT_HOST;
  const rawPort = environment.PORT?.trim();
  const port = rawPort === undefined || rawPort === "" ? DEFAULT_PORT : Number(rawPort);
  if (
    host.length > 253 ||
    /[\s/\\]/.test(host) ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error("DAB3D_BIND_CONFIG_INVALID");
  }
  return Object.freeze({ host, port });
}

function jsonResponse(
  response: import("node:http").ServerResponse,
  status: number,
  body: Readonly<Record<string, string>>,
  allow?: string,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  if (allow) response.setHeader("allow", allow);
  response.end(JSON.stringify(body));
}

export function createDab3dStandaloneServer(input: {
  readonly readEnvironment: () => Dab3cEnvironment;
}): Server {
  const handler = createDab3cNodeHandler({
    readEnvironment: input.readEnvironment,
  });
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://standalone.invalid").pathname;
    if (path === "/healthz") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        jsonResponse(response, 405, { error: "method_not_allowed" }, "GET, HEAD");
        return;
      }
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.end(request.method === "HEAD" ? undefined : '{"status":"ok"}');
      return;
    }
    if (path !== "/mcp") {
      jsonResponse(response, 404, { error: "not_found" });
      return;
    }
    await handler(request, response);
  });
}

export function installDab3dShutdownHandlers(
  server: Server,
  input: {
    readonly exit?: (code: number) => never;
    readonly setTimer?: typeof setTimeout;
  } = {},
): () => void {
  const exit = input.exit ?? process.exit;
  const setTimer = input.setTimer ?? setTimeout;
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timer = setTimer(() => {
      server.closeAllConnections();
      exit(1);
    }, SHUTDOWN_GRACE_MS);
    timer.unref();
    server.close((error) => {
      clearTimeout(timer);
      exit(error ? 1 : 0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return () => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
  };
}

export function startDab3dStandaloneServer(
  environment: Dab3cEnvironment = process.env,
): Server {
  const { host, port } = resolveStandaloneBindAddress(environment);
  const server = createDab3dStandaloneServer({
    readEnvironment: () => environment,
  });
  installDab3dShutdownHandlers(server);
  server.listen(port, host);
  return server;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  startDab3dStandaloneServer();
}
