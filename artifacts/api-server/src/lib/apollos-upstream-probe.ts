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
