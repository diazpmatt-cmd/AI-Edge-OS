export { createRemoteMcpHttpHandler } from "../src/runtime";

/**
 * Offline-only entrypoint. A later, separately authorized activation phase must
 * inject database, OAuth, key, rate-limit, and policy configuration.
 */
export default function inactiveRemoteBridge(): Response {
  return new Response(
    JSON.stringify({ error: "remote_bridge_not_configured" }),
    { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}
