import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/google/callback")({
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

        // Step 1: receive code
        if (errParam) {
          console.error("[oauth/google/callback] step=receive_code google_error=", errParam);
          return redirectBack({ oauth: "error", step: "receive_code", reason: errParam });
        }
        if (!code || !state) {
          console.error("[oauth/google/callback] step=receive_code missing", { hasCode: !!code, hasState: !!state });
          return redirectBack({ oauth: "error", step: "receive_code", reason: "missing_code_or_state" });
        }
        console.log("[oauth/google/callback] step=receive_code OK");

        // Step 2: verify state
        let payload: { uid: string; p: string };
        try {
          const { verifyState } = await import("@/lib/oauth-state.server");
          payload = verifyState<{ uid: string; p: string }>(state);
          console.log("[oauth/google/callback] step=verify_state OK uid=", payload.uid, "p=", payload.p);
        } catch (e: any) {
          console.error("[oauth/google/callback] step=verify_state FAILED", e?.message);
          return redirectBack({ oauth: "error", step: "verify_state", reason: e?.message ?? "invalid_state" });
        }

        try {
          const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
          const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
          const publicAppUrl = process.env.PUBLIC_APP_URL;
          if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
          const redirectUri = `${publicAppUrl.replace(/\/$/, "")}/api/oauth/google/callback`;

          // Step 3: token exchange
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          });
          const tok = await tokenRes.json();
          if (!tokenRes.ok) {
            console.error("[oauth/google/callback] step=token_exchange FAILED", tok);
            return redirectBack({
              oauth: "error",
              step: "token_exchange",
              reason: tok?.error ?? "token_exchange_failed",
            });
          }
          console.log("[oauth/google/callback] step=token_exchange OK");

          // Step 4: userinfo
          let accountName: string | null = null;
          let accountId: string | null = null;
          try {
            const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
              headers: { Authorization: `Bearer ${tok.access_token}` },
            });
            if (!uiRes.ok) {
              const body = await uiRes.text().catch(() => "");
              console.error("[oauth/google/callback] step=userinfo FAILED status=", uiRes.status, body.slice(0, 200));
              return redirectBack({ oauth: "error", step: "userinfo", reason: `userinfo_${uiRes.status}` });
            }
            const ui = await uiRes.json();
            accountName = ui.email ?? ui.name ?? null;
            accountId = ui.sub ?? null;
            console.log("[oauth/google/callback] step=userinfo OK email=", accountName);
          } catch (e: any) {
            console.error("[oauth/google/callback] step=userinfo threw", e?.message);
            return redirectBack({ oauth: "error", step: "userinfo", reason: e?.message ?? "userinfo_failed" });
          }

          const expiresAt = tok.expires_in
            ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString()
            : null;

          // Step 5: upsert row
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: upsertErr } = await supabaseAdmin
            .from("social_connections")
            .upsert(
              {
                user_id: payload.uid,
                provider: payload.p,
                account_id: accountId,
                account_name: accountName,
                access_token: tok.access_token ?? null,
                refresh_token: tok.refresh_token ?? null,
                expires_at: expiresAt,
                scope: tok.scope ?? null,
                token_type: tok.token_type ?? null,
                provider_metadata: {},
                last_error: null,
                last_verified_at: new Date().toISOString(),
              },
              { onConflict: "user_id,provider" },
            );
          if (upsertErr) {
            console.error("[oauth/google/callback] step=upsert FAILED", upsertErr);
            return redirectBack({ oauth: "error", step: "upsert", reason: upsertErr.message });
          }
          console.log("[oauth/google/callback] step=upsert OK provider=", payload.p);

          return redirectBack({ oauth: "success", connected: payload.p, provider: payload.p });
        } catch (e: any) {
          console.error("[oauth/google/callback] unexpected error", e);
          return redirectBack({ oauth: "error", step: "unknown", reason: e?.message ?? "unknown" });
        }
      },
    },
  },
});
