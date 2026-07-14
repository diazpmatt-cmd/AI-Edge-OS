import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DAB2A_AUTHORITY_POLICY,
  deterministicHash,
  type DevelopmentAuthorityPolicy,
  type DevelopmentCoordinationStore,
} from "@workspace/development-control";
import {
  createDevelopmentControlBridgeStoreRuntime,
  createDevelopmentControlDatabaseConfig,
  type BridgeGitEvidenceReader,
  type BridgeRateLimitRepository,
  type BridgeRequestLedgerRepository,
  type DevelopmentControlDatabaseConfig,
} from "@workspace/development-control-store";
import { CanonicalBridgeReadAdapter } from "./adapters.js";
import type { RemoteBridgeAuthConfig } from "./auth.js";
import {
  RemoteBridgeRuntime,
  createRemoteMcpHttpHandler,
  type RemoteBridgeClock,
} from "./runtime.js";

export type Dab3cEnvironment = Readonly<Record<string, string | undefined>>;

interface Dab3cActivationConfig {
  readonly database: DevelopmentControlDatabaseConfig;
  readonly resourceUrl: string;
  readonly documentationUrl: string;
  readonly authorizationServerIssuer: string;
  readonly auth: RemoteBridgeAuthConfig;
  readonly expectedRepositoryId: string;
  readonly expectedHumanAuthorityActorId: string;
}
interface Dab3cStoreRuntime {
  readonly store: DevelopmentCoordinationStore;
  readonly bridge: BridgeRequestLedgerRepository & BridgeGitEvidenceReader;
  readonly rateLimits: BridgeRateLimitRepository;
  close(): Promise<void>;
}

export interface Dab3cActivationDependencies {
  readonly readEnvironment: () => Dab3cEnvironment;
  readonly clock?: RemoteBridgeClock;
  readonly createStoreRuntime?: (input: {
    readonly database: DevelopmentControlDatabaseConfig;
    readonly authorityPolicy?: DevelopmentAuthorityPolicy;
  }) => Dab3cStoreRuntime;
}

const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_NODE_BODY_BYTES = 65_536;
const NUMERIC_ID = /^[1-9][0-9]{0,30}$/;
const ACTOR_ID = /^github-actor:[1-9][0-9]{0,30}$/;
const KEY_ID = /^[A-Za-z0-9._:-]{1,200}$/;

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "remote_bridge_unavailable" }), {
    status: 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function required(
  environment: Dab3cEnvironment,
  name: string,
  max = 2_000,
): string {
  const value = environment[name]?.trim();
  if (!value || value.length > max) throw new Error("DAB3C_CONFIG_INVALID");
  return value;
}

function exactHttpsUrl(value: string, path?: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DAB3C_CONFIG_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (path !== undefined && url.pathname !== path)
  ) {
    throw new Error("DAB3C_CONFIG_INVALID");
  }
  return url.toString();
}

function decodePublicKey(encoded: string): string {
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8").trim();
  } catch {
    throw new Error("DAB3C_CONFIG_INVALID");
  }
  if (
    !decoded.startsWith("-----BEGIN PUBLIC KEY-----") ||
    !decoded.endsWith("-----END PUBLIC KEY-----") ||
    decoded.length > 8_192
  ) {
    throw new Error("DAB3C_CONFIG_INVALID");
  }
  return `${decoded}\n`;
}

export function parseDab3cActivationConfig(
  environment: Dab3cEnvironment,
): Dab3cActivationConfig {
  if (environment.DAB3C_ENABLED !== "true") {
    throw new Error("DAB3C_NOT_ENABLED");
  }
  if (environment.DAB3C_KILL_SWITCH !== "false") {
    throw new Error("DAB3C_KILL_SWITCH_ACTIVE");
  }
  const resourceUrl = exactHttpsUrl(
    required(environment, "DAB3C_RESOURCE_URL", 500),
    "/mcp",
  );
  const documentationUrl = exactHttpsUrl(
    required(environment, "DAB3C_DOCUMENTATION_URL", 500),
  );
  const authorizationServerIssuer = exactHttpsUrl(
    required(environment, "DAB3C_OAUTH_ISSUER", 500),
  );
  const authorizedParty = required(
    environment,
    "DAB3C_OAUTH_AUTHORIZED_PARTY",
    300,
  );
  const subject = required(environment, "DAB3C_OAUTH_SUBJECT", 300);
  const keyId = required(environment, "DAB3C_OAUTH_KEY_ID", 200);
  const repositoryId = required(environment, "DAB3C_REPOSITORY_ID", 31);
  const actorId = required(environment, "DAB3C_MATTHEW_ACTOR_ID", 50);
  const generation = Number(
    required(environment, "DAB3C_REVOCATION_GENERATION", 10),
  );
  if (
    !KEY_ID.test(keyId) ||
    !NUMERIC_ID.test(repositoryId) ||
    !ACTOR_ID.test(actorId) ||
    !Number.isSafeInteger(generation) ||
    generation < 1
  ) {
    throw new Error("DAB3C_CONFIG_INVALID");
  }
  const publicKey = decodePublicKey(
    required(environment, "DAB3C_OAUTH_PUBLIC_KEY_PEM_B64", 12_000),
  );
  const database = createDevelopmentControlDatabaseConfig({
    connectionString: required(
      environment,
      "DAB3C_CONTROL_DATABASE_URL",
      2_000,
    ),
    maxConnections: 5,
  });
  return Object.freeze({
    database,
    resourceUrl,
    documentationUrl,
    authorizationServerIssuer,
    expectedRepositoryId: repositoryId,
    expectedHumanAuthorityActorId: actorId,
    auth: Object.freeze({
      issuer: authorizationServerIssuer,
      audience: resourceUrl,
      allowedAuthorizedParties: Object.freeze([authorizedParty]),
      allowedSubjects: Object.freeze([subject]),
      requiredScope: "dab:read" as const,
      allowedAlgorithms: Object.freeze(["RS256"] as const),
      pinnedPublicKeys: Object.freeze({ [keyId]: publicKey }),
      revocationGeneration: generation,
      maxTokenLifetimeSeconds: 15 * 60,
      clockSkewSeconds: 30,
    }),
  });
}

export function createDab3cWebHandler(
  dependencies: Dab3cActivationDependencies,
): (request: Request) => Promise<Response> {
  let initialized:
    | Promise<((request: Request) => Promise<Response>) | null>
    | undefined;
  const initialize = async (): Promise<
    ((request: Request) => Promise<Response>) | null
  > => {
    try {
      const environment = dependencies.readEnvironment();
      const config = parseDab3cActivationConfig(environment);
      const createStore =
        dependencies.createStoreRuntime ??
        createDevelopmentControlBridgeStoreRuntime;
      const store = createStore({
        database: config.database,
        authorityPolicy: Object.freeze({
          ...DAB2A_AUTHORITY_POLICY,
          materialAuthorityActorId: config.expectedHumanAuthorityActorId,
        }),
      });
      const clock = dependencies.clock ?? {
        now: () => new Date().toISOString(),
      };
      const runtime = new RemoteBridgeRuntime({
        auth: config.auth,
        expectedRepositoryId: config.expectedRepositoryId,
        expectedHumanAuthorityActorId:
          config.expectedHumanAuthorityActorId,
        clock,
        killSwitch: () =>
          dependencies.readEnvironment().DAB3C_KILL_SWITCH !== "false",
        rateLimiter: {
          consume: (principalId, now) =>
            store.rateLimits.consume({
              principalReferenceHash: deterministicHash(
                principalId,
                "bridge_principal_hash",
              ),
              now,
              windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
              limit: RATE_LIMIT_REQUESTS,
            }),
        },
        adapter: new CanonicalBridgeReadAdapter(store.store, store.bridge),
        ledger: store.bridge,
      });
      return createRemoteMcpHttpHandler({
        runtime,
        resourceUrl: config.resourceUrl,
        authorizationServerIssuer: config.authorizationServerIssuer,
        documentationUrl: config.documentationUrl,
      });
    } catch {
      return null;
    }
  };
  return async (request: Request): Promise<Response> => {
    initialized ??= initialize();
    const handler = await initialized;
    return handler ? handler(request) : unavailable();
  };
}

async function nodeBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_NODE_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function nodeHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

export function createDab3cNodeHandler(
  dependencies: Dab3cActivationDependencies,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const webHandler = createDab3cWebHandler(dependencies);
  return async (request, response): Promise<void> => {
    let webResponse: Response;
    try {
      const environment = dependencies.readEnvironment();
      const configuredResource = environment.DAB3C_RESOURCE_URL;
      const base = configuredResource
        ? new URL(configuredResource).origin
        : "https://unconfigured.invalid";
      const requestUrl = new URL(request.url ?? "/mcp", base);
      if (requestUrl.pathname === "/api/mcp") requestUrl.pathname = "/mcp";
      const method = request.method ?? "GET";
      const body = method === "GET" || method === "HEAD"
        ? undefined
        : await nodeBody(request);
      webResponse = await webHandler(
        new Request(requestUrl, {
          method,
          headers: nodeHeaders(request),
          body,
        }),
      );
    } catch {
      webResponse = unavailable();
    }
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  };
}
