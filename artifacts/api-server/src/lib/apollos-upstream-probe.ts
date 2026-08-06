export interface ApollosUpstreamProbeTarget {
  readonly url: string;
  readonly origin: string;
  readonly hostname: string;
}

function allowedOrigins(env: NodeJS.ProcessEnv): ReadonlySet<string> {
  return new Set(
    (env.APOLLOS_REPAIR_UPSTREAM_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function resolveApollosUpstreamProbeTarget(
  env: NodeJS.ProcessEnv,
): ApollosUpstreamProbeTarget | null {
  const raw = env.APOLLOS_REPAIR_UPSTREAM_HEALTH_URL?.trim();
  if (!raw) return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (
    (target.protocol !== "https:" && target.protocol !== "http:") ||
    target.username ||
    target.password ||
    target.hash
  ) {
    return null;
  }
  if (!allowedOrigins(env).has(target.origin)) return null;
  return Object.freeze({
    url: target.toString(),
    origin: target.origin,
    hostname: target.hostname,
  });
}

export interface ApollosUpstreamProbeResult {
  readonly verified: boolean;
  readonly evidence: {
    readonly configured: boolean;
    readonly origin: string | null;
    readonly hostname: string | null;
    readonly status: number | null;
    readonly redirected: boolean;
    readonly latencyMs: number | null;
  };
}

export async function runApollosUpstreamHealthProbe(
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ApollosUpstreamProbeResult> {
  const target = resolveApollosUpstreamProbeTarget(env);
  if (!target) {
    return Object.freeze({
      verified: false,
      evidence: Object.freeze({
        configured: false,
        origin: null,
        hostname: null,
        status: null,
        redirected: false,
        latencyMs: null,
      }),
    });
  }
  const startedAt = Date.now();
  const response = await fetchImpl(target.url, {
    method: "GET",
    redirect: "manual",
    signal,
    headers: { Accept: "application/json" },
  });
  const latencyMs = Math.max(0, Date.now() - startedAt);
  const redirected = response.status >= 300 && response.status < 400;
  return Object.freeze({
    verified: response.status === 200 && !redirected,
    evidence: Object.freeze({
      configured: true,
      origin: target.origin,
      hostname: target.hostname,
      status: response.status,
      redirected,
      latencyMs,
    }),
  });
}
