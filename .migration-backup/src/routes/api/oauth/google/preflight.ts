import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/google/preflight")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { checkGoogleRedirectUri } = await import(
            "@/lib/oauth-preflight.server"
          );
          const result = await checkGoogleRedirectUri();
          return new Response(JSON.stringify(result, null, 2), {
            status: result.ok ? 200 : 409,
            headers: { "content-type": "application/json" },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? String(e) }, null, 2),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
