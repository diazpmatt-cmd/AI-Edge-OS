import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const query: Record<string, string> = {};
        for (const [k, v] of url.searchParams.entries()) query[k] = v;

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        const errDesc = url.searchParams.get("error_description");
        const errSubtype = url.searchParams.get("error_subtype");
        const errUri = url.searchParams.get("error_uri");

        const { setYouTubeCallbackTrace } = await import(
          "@/lib/youtube-callback-trace.server"
        );

        // Build a working trace. uid is unknown until we verify state.
        let uid: string | null = null;
        const trace: import("@/lib/youtube-callback-trace.server").YouTubeCallbackTrace = {
          at: new Date().toISOString(),
          fullCallbackUrl: request.url,
          query,
          receivedCode: !!code,
          receivedState: !!state,
          // We got here => Google routed back to us. If error is "access_denied",
          // the user saw consent and declined. If error is something like
          // invalid_request/invalid_scope, Google rejected BEFORE consent.
          reachedConsent: !!code || errParam === "access_denied",
          oauthError: errParam,
          oauthErrorDescription: errDesc,
          oauthErrorSubtype: errSubtype,
          oauthErrorUri: errUri,
          stateVerified: null,
          stateVerifyError: null,
          tokenExchange: null,
          channelFetch: null,
          upsertError: null,
          finalRedirect: null,
        };

        const redirectBack = (params: Record<string, string>) => {
          const target = new URL("/connections", url.origin);
          for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
          trace.finalRedirect = target.toString();
          if (uid) setYouTubeCallbackTrace(uid, trace);
          return Response.redirect(target.toString(), 302);
        };

        // Verify state first so we know the uid and can persist the trace.
        if (state) {
          try {
            const { verifyState } = await import("@/lib/oauth-state.server");
            const payload = verifyState<{ uid: string; p: string }>(state);
            uid = payload.uid;
            trace.stateVerified = true;
          } catch (e: any) {
            trace.stateVerified = false;
            trace.stateVerifyError = e?.message ?? "invalid_state";
          }
        }

        if (errParam) {
          return redirectBack({
            oauth: "error",
            step: "receive_code",
            reason: errParam,
            error_description: errDesc ?? "",
          });
        }
        if (!code || !state) {
          return redirectBack({
            oauth: "error",
            step: "receive_code",
            reason: "missing_code_or_state",
          });
        }
        if (trace.stateVerified === false) {
          return redirectBack({
            oauth: "error",
            step: "verify_state",
            reason: trace.stateVerifyError ?? "invalid_state",
          });
        }

        try {
          const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
          const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
          const publicAppUrl = process.env.PUBLIC_APP_URL;
          if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
          const redirectUri = `${publicAppUrl.replace(/\/$/, "")}/api/oauth/youtube/callback`;

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
          const tokenText = await tokenRes.text();
          let tok: any = {};
          try {
            tok = JSON.parse(tokenText);
          } catch {
            /* keep raw */
          }
          // Redact secrets in the snippet preview.
          const redactedSnippet = tokenText
            .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"<redacted>"')
            .replace(/"refresh_token"\s*:\s*"[^"]+"/g, '"refresh_token":"<redacted>"')
            .replace(/"id_token"\s*:\s*"[^"]+"/g, '"id_token":"<redacted>"')
            .slice(0, 800);

          trace.tokenExchange = {
            attempted: true,
            httpStatus: tokenRes.status,
            ok: tokenRes.ok,
            error: tok?.error ?? null,
            errorDescription: tok?.error_description ?? null,
            errorSubtype: tok?.error_subtype ?? null,
            rawSnippet: redactedSnippet,
            hasAccessToken: !!tok?.access_token,
            hasRefreshToken: !!tok?.refresh_token,
            grantedScope: tok?.scope ?? null,
            expiresIn: typeof tok?.expires_in === "number" ? tok.expires_in : null,
            tokenType: tok?.token_type ?? null,
          };

          if (!tokenRes.ok) {
            return redirectBack({
              oauth: "error",
              step: "token_exchange",
              reason: tok?.error ?? "token_exchange_failed",
              error_description: tok?.error_description ?? "",
            });
          }

          // Fetch the user's YouTube channel
          let channelId: string | null = null;
          let channelName: string | null = null;
          try {
            const chRes = await fetch(
              "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
              { headers: { Authorization: `Bearer ${tok.access_token}` } },
            );
            const chText = await chRes.text();
            trace.channelFetch = {
              attempted: true,
              httpStatus: chRes.status,
              ok: chRes.ok,
              channelId: null,
              channelTitle: null,
              rawSnippet: chText.slice(0, 600),
            };
            if (chRes.ok) {
              try {
                const ch = JSON.parse(chText);
                const item = ch.items?.[0];
                if (item) {
                  channelId = item.id ?? null;
                  channelName = item.snippet?.title ?? null;
                  trace.channelFetch.channelId = channelId;
                  trace.channelFetch.channelTitle = channelName;
                }
              } catch {
                /* ignore */
              }
            }
          } catch (e: any) {
            trace.channelFetch = {
              attempted: true,
              httpStatus: 0,
              ok: false,
              channelId: null,
              channelTitle: null,
              rawSnippet: `fetch_threw: ${e?.message ?? "unknown"}`,
            };
          }

          const expiresAt = tok.expires_in
            ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString()
            : null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: upsertErr } = await supabaseAdmin
            .from("social_connections")
            .upsert(
              {
                user_id: uid!,
                provider: "youtube",
                account_id: channelId,
                account_name: channelName,
                access_token: tok.access_token ?? null,
                refresh_token: tok.refresh_token ?? null,
                expires_at: expiresAt,
                scope: tok.scope ?? null,
                token_type: tok.token_type ?? null,
                provider_metadata: { channel_id: channelId, channel_name: channelName },
                last_error: null,
                last_verified_at: new Date().toISOString(),
              },
              { onConflict: "user_id,provider" },
            );
          if (upsertErr) {
            trace.upsertError = upsertErr.message;
            return redirectBack({
              oauth: "error",
              step: "upsert",
              reason: upsertErr.message,
            });
          }

          return redirectBack({
            oauth: "success",
            connected: "youtube",
            provider: "youtube",
          });
        } catch (e: any) {
          return redirectBack({
            oauth: "error",
            step: "unknown",
            reason: e?.message ?? "unknown",
          });
        }
      },
    },
  },
});
