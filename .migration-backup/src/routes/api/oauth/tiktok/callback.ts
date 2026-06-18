import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");

        const redirectBack = (params: Record<string, string>) => {
          const target = new URL("/connections", url.origin);
          for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
          return Response.redirect(target.toString(), 302);
        };

        if (errParam) return redirectBack({ oauth: "error", step: "receive_code", reason: errParam });
        if (!code || !state) return redirectBack({ oauth: "error", step: "receive_code", reason: "missing_code_or_state" });

        let payload: { uid: string; p: string };
        try {
          const { verifyState } = await import("@/lib/oauth-state.server");
          payload = verifyState<{ uid: string; p: string }>(state);
        } catch (e: any) {
          return redirectBack({ oauth: "error", step: "verify_state", reason: e?.message ?? "invalid_state" });
        }

        try {
          const clientKey = process.env.TIKTOK_CLIENT_KEY!;
          const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
          const publicAppUrl = process.env.PUBLIC_APP_URL;
          if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
          const redirectUri = `${publicAppUrl.replace(/\/$/, "")}/api/oauth/tiktok/callback`;

          const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_key: clientKey,
              client_secret: clientSecret,
              code,
              grant_type: "authorization_code",
              redirect_uri: redirectUri,
            }),
          });
          const tok = await tokenRes.json();
          if (!tokenRes.ok || tok.error) {
            return redirectBack({
              oauth: "error",
              step: "token_exchange",
              reason: tok?.error ?? tok?.error_description ?? "token_exchange_failed",
            });
          }

          let accountId: string | null = tok.open_id ?? null;
          let accountName: string | null = null;
          try {
            const uiRes = await fetch(
              "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username",
              { headers: { Authorization: `Bearer ${tok.access_token}` } },
            );
            if (uiRes.ok) {
              const ui = await uiRes.json();
              const u = ui.data?.user;
              if (u) {
                accountId = u.open_id ?? accountId;
                accountName = u.username ?? u.display_name ?? null;
              }
            }
          } catch (e: any) {
            console.error("[oauth/tiktok/callback] userinfo threw", e?.message);
          }

          const expiresAt = tok.expires_in
            ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString()
            : null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: upsertErr } = await supabaseAdmin
            .from("social_connections")
            .upsert(
              {
                user_id: payload.uid,
                provider: "tiktok",
                account_id: accountId,
                account_name: accountName,
                access_token: tok.access_token ?? null,
                refresh_token: tok.refresh_token ?? null,
                expires_at: expiresAt,
                scope: tok.scope ?? null,
                token_type: tok.token_type ?? "bearer",
                provider_metadata: { open_id: tok.open_id ?? null },
                last_error: null,
                last_verified_at: new Date().toISOString(),
              },
              { onConflict: "user_id,provider" },
            );
          if (upsertErr) return redirectBack({ oauth: "error", step: "upsert", reason: upsertErr.message });

          return redirectBack({ oauth: "success", connected: "tiktok", provider: "tiktok" });
        } catch (e: any) {
          return redirectBack({ oauth: "error", step: "unknown", reason: e?.message ?? "unknown" });
        }
      },
    },
  },
});
