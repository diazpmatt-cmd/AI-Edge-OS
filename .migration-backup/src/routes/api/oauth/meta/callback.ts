import { createFileRoute } from "@tanstack/react-router";

const GRAPH_VERSION = "v21.0";

export const Route = createFileRoute("/api/oauth/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        const errReason = url.searchParams.get("error_reason");
        const errDesc = url.searchParams.get("error_description");

        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => {
          query[k] = k === "code" ? `${v.slice(0, 6)}…(${v.length})` : v;
        });

        // Build a live trace we'll persist before every return
        const { setMetaCallbackTrace } = await import("@/lib/meta-callback-trace.server");
        const trace: import("@/lib/meta-callback-trace.server").MetaCallbackTrace = {
          at: new Date().toISOString(),
          fullCallbackUrl: url.toString(),
          query,
          receivedCode: !!code,
          receivedState: !!state,
          oauthError: errParam,
          oauthErrorReason: errReason,
          oauthErrorDescription: errDesc,
          stateVerified: null,
          stateVerifyError: null,
          tokenExchange: null,
          longLivedExchange: null,
          meFetch: null,
          permissionsFetch: null,
          pagesFetch: null,
          pageDetails: [],
          businessesFetch: null,
          ownedPagesFetch: [],
          upsert: null,
          finalRedirect: null,
        };

        const redirectBack = (params: Record<string, string>, uidForTrace: string | null) => {
          const target = new URL("/connections", url.origin);
          for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
          trace.finalRedirect = target.toString();
          if (uidForTrace) setMetaCallbackTrace(uidForTrace, trace);
          return Response.redirect(target.toString(), 302);
        };

        if (errParam || errReason) {
          console.error("[oauth/meta/callback] step=receive_code", { errParam, errReason, errDesc });
          return redirectBack(
            { meta: "error", step: "receive_code", reason: errParam ?? errReason ?? "user_denied" },
            null,
          );
        }
        if (!code || !state) {
          return redirectBack(
            { meta: "error", step: "receive_code", reason: "missing_code_or_state" },
            null,
          );
        }

        let payload: { uid: string; p: string };
        try {
          const { verifyState } = await import("@/lib/oauth-state.server");
          payload = verifyState<{ uid: string; p: string }>(state);
          trace.stateVerified = true;
        } catch (e: any) {
          trace.stateVerified = false;
          trace.stateVerifyError = e?.message ?? "invalid_state";
          console.error("[oauth/meta/callback] step=verify_state FAILED", e?.message);
          return redirectBack(
            { meta: "error", step: "verify_state", reason: e?.message ?? "invalid_state" },
            null,
          );
        }
        const uid = payload.uid;

        try {
          const appId = process.env.META_APP_ID!;
          const appSecret = process.env.META_APP_SECRET!;
          const publicAppUrl = process.env.PUBLIC_APP_URL;
          if (!appId || !appSecret) throw new Error("META_APP_ID or META_APP_SECRET not configured");
          if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
          const redirectUri = `${publicAppUrl.replace(/\/$/, "")}/api/oauth/meta/callback`;

          // Step 3: short-lived user access token
          const tokUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
          tokUrl.searchParams.set("client_id", appId);
          tokUrl.searchParams.set("client_secret", appSecret);
          tokUrl.searchParams.set("redirect_uri", redirectUri);
          tokUrl.searchParams.set("code", code);
          const tokRes = await fetch(tokUrl.toString());
          const tokText = await tokRes.text();
          let tok: any = {};
          try { tok = JSON.parse(tokText); } catch { /* keep raw */ }
          trace.tokenExchange = {
            attempted: true,
            httpStatus: tokRes.status,
            ok: tokRes.ok && !!tok.access_token,
            error: tok?.error?.message ?? (tokRes.ok ? null : "token_exchange_failed"),
            rawSnippet: tokText.slice(0, 400),
            hasAccessToken: !!tok?.access_token,
            tokenType: tok?.token_type ?? null,
          };
          if (!tokRes.ok || !tok.access_token) {
            console.error("[oauth/meta/callback] step=token_exchange FAILED", tok);
            return redirectBack(
              { meta: "error", step: "token_exchange", reason: tok?.error?.message ?? "token_exchange_failed" },
              uid,
            );
          }
          let userAccessToken: string = tok.access_token;

          // Step 3b: long-lived (60 day) token (best-effort)
          try {
            const llUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
            llUrl.searchParams.set("grant_type", "fb_exchange_token");
            llUrl.searchParams.set("client_id", appId);
            llUrl.searchParams.set("client_secret", appSecret);
            llUrl.searchParams.set("fb_exchange_token", userAccessToken);
            const llRes = await fetch(llUrl.toString());
            const ll = await llRes.json();
            const ok = llRes.ok && !!ll.access_token;
            if (ok) userAccessToken = ll.access_token;
            trace.longLivedExchange = { attempted: true, ok, error: ok ? null : (ll?.error?.message ?? "ll_exchange_failed") };
          } catch (e: any) {
            trace.longLivedExchange = { attempted: true, ok: false, error: e?.message ?? "ll_exception" };
          }

          // Step 4a: identify the user via /me
          const meUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
          meUrl.searchParams.set("fields", "id,name");
          meUrl.searchParams.set("access_token", userAccessToken);
          const meRes = await fetch(meUrl.toString());
          const meText = await meRes.text();
          let me: any = {};
          try { me = JSON.parse(meText); } catch { /* keep raw */ }
          trace.meFetch = {
            attempted: true,
            httpStatus: meRes.status,
            ok: meRes.ok && !!me?.id,
            userId: me?.id ?? null,
            userName: me?.name ?? null,
            rawSnippet: meText.slice(0, 400),
          };
          if (!meRes.ok || !me?.id) {
            console.error("[oauth/meta/callback] step=fetch_me FAILED", me);
            return redirectBack(
              { meta: "error", step: "fetch_me", reason: me?.error?.message ?? "fetch_me_failed" },
              uid,
            );
          }

          // Step 4a-bis: granted/declined permissions
          try {
            const permsUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions`);
            permsUrl.searchParams.set("access_token", userAccessToken);
            const permsRes = await fetch(permsUrl.toString());
            const permsText = await permsRes.text();
            let permsJson: any = {};
            try { permsJson = JSON.parse(permsText); } catch { /* keep raw */ }
            const permsArr: Array<{ permission: string; status: string }> = Array.isArray(permsJson?.data) ? permsJson.data : [];
            trace.permissionsFetch = {
              attempted: true,
              httpStatus: permsRes.status,
              ok: permsRes.ok,
              granted: permsArr.filter((p) => p.status === "granted").map((p) => p.permission),
              declined: permsArr.filter((p) => p.status !== "granted").map((p) => p.permission),
              rawSnippet: permsText.slice(0, 1000),
            };
          } catch (e: any) {
            trace.permissionsFetch = {
              attempted: true, httpStatus: 0, ok: false, granted: [], declined: [],
              rawSnippet: `exception: ${e?.message ?? "unknown"}`,
            };
          }

          // Step 4b: fetch managed Pages (may be empty under reduced scopes)
          const pagesUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
          pagesUrl.searchParams.set(
            "fields",
            "id,name,access_token,category,tasks",
          );
          pagesUrl.searchParams.set("access_token", userAccessToken);
          const pagesRes = await fetch(pagesUrl.toString());
          const pagesText = await pagesRes.text();
          let pagesJson: any = {};
          try { pagesJson = JSON.parse(pagesText); } catch { /* keep raw */ }
          const pages = Array.isArray(pagesJson?.data) ? pagesJson.data : [];
          trace.pagesFetch = {
            attempted: true,
            httpStatus: pagesRes.status,
            ok: pagesRes.ok,
            count: pages.length,
            rawSnippet: pagesText.slice(0, 4000),
            pages: pages.map((p: any) => ({
              id: String(p.id),
              name: p.name ?? null,
              tasks: Array.isArray(p.tasks) ? p.tasks : null,
              category: p.category ?? null,
            })),
          };

          // Step 4c: per-page details (NPE / Business owner / published)
          for (const p of pages) {
            try {
              const dUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${p.id}`);
              dUrl.searchParams.set(
                "fields",
                "id,name,is_published,has_transitioned_to_new_page_experience,owner_business{id,name}",
              );
              dUrl.searchParams.set("access_token", p.access_token ?? userAccessToken);
              const dRes = await fetch(dUrl.toString());
              const dText = await dRes.text();
              let dJson: any = {};
              try { dJson = JSON.parse(dText); } catch { /* keep raw */ }
              trace.pageDetails.push({
                pageId: String(p.id),
                httpStatus: dRes.status,
                ok: dRes.ok,
                isPublished: typeof dJson.is_published === "boolean" ? dJson.is_published : null,
                hasTransitionedToNewPageExperience:
                  typeof dJson.has_transitioned_to_new_page_experience === "boolean"
                    ? dJson.has_transitioned_to_new_page_experience
                    : null,
                ownerBusiness: dJson.owner_business
                  ? { id: String(dJson.owner_business.id), name: dJson.owner_business.name ?? null }
                  : null,
                rawSnippet: dText.slice(0, 1500),
              });
            } catch (e: any) {
              trace.pageDetails.push({
                pageId: String(p.id), httpStatus: 0, ok: false,
                isPublished: null, hasTransitionedToNewPageExperience: null, ownerBusiness: null,
                rawSnippet: `exception: ${e?.message ?? "unknown"}`,
              });
            }
          }

          // Step 4d: Business Manager — owned pages (Business-owned Pages
          // are often NOT returned by /me/accounts even when the user has
          // a role on them; they must be fetched per business.)
          try {
            const bizUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/businesses`);
            bizUrl.searchParams.set("fields", "id,name");
            bizUrl.searchParams.set("access_token", userAccessToken);
            const bizRes = await fetch(bizUrl.toString());
            const bizText = await bizRes.text();
            let bizJson: any = {};
            try { bizJson = JSON.parse(bizText); } catch { /* keep raw */ }
            const businesses: Array<{ id: string; name?: string }> = Array.isArray(bizJson?.data) ? bizJson.data : [];
            trace.businessesFetch = {
              attempted: true,
              httpStatus: bizRes.status,
              ok: bizRes.ok,
              count: businesses.length,
              rawSnippet: bizText.slice(0, 4000),
              businesses: businesses.map((b) => ({ id: String(b.id), name: b.name ?? null })),
            };
            for (const b of businesses) {
              try {
                const opUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${b.id}/owned_pages`);
                opUrl.searchParams.set("fields", "id,name");
                opUrl.searchParams.set("access_token", userAccessToken);
                const opRes = await fetch(opUrl.toString());
                const opText = await opRes.text();
                let opJson: any = {};
                try { opJson = JSON.parse(opText); } catch { /* keep raw */ }
                const owned = Array.isArray(opJson?.data) ? opJson.data : [];
                trace.ownedPagesFetch.push({
                  businessId: String(b.id),
                  businessName: b.name ?? null,
                  httpStatus: opRes.status,
                  ok: opRes.ok,
                  count: owned.length,
                  pageIds: owned.map((p: any) => String(p.id)),
                  rawSnippet: opText.slice(0, 1500),
                });
              } catch (e: any) {
                trace.ownedPagesFetch.push({
                  businessId: String(b.id), businessName: b.name ?? null,
                  httpStatus: 0, ok: false, count: 0, pageIds: [],
                  rawSnippet: `exception: ${e?.message ?? "unknown"}`,
                });
              }
            }
          } catch (e: any) {
            trace.businessesFetch = {
              attempted: true, httpStatus: 0, ok: false, count: 0,
              rawSnippet: `exception: ${e?.message ?? "unknown"}`, businesses: [],
            };
          }

          const pagesError = !pagesRes.ok
            ? (pagesJson?.error?.message ?? `pages_http_${pagesRes.status}`)
            : null;

          // Step 5: ALWAYS upsert provider="facebook" with the FB user identity
          // so the UI shows Connected even when no Pages are returned.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const fbUpsert = await supabaseAdmin.from("social_connections").upsert(
            {
              user_id: uid,
              provider: "facebook",
              account_id: String(me.id),
              account_name: String(me.name ?? me.id),
              access_token: userAccessToken,
              refresh_token: null,
              expires_at: null,
              scope: "public_profile,pages_show_list",
              token_type: "bearer",
              provider_metadata: {
                fb_user: { id: me.id, name: me.name ?? null },
                pages_count: pages.length,
                pages: pages.map((p: any) => ({
                  id: String(p.id),
                  name: p.name ?? null,
                  category: p.category ?? null,
                  has_instagram: !!p.instagram_business_account?.id,
                  instagram_username: p.instagram_business_account?.username ?? null,
                })),
              },
              last_error: pagesError,
              last_verified_at: new Date().toISOString(),
            },
            { onConflict: "user_id,provider" },
          );
          trace.upsert = {
            attempted: true,
            provider: "facebook",
            ok: !fbUpsert.error,
            error: fbUpsert.error?.message ?? null,
            userId: uid,
          };
          if (fbUpsert.error) {
            console.error("[oauth/meta/callback] step=upsert_facebook FAILED", fbUpsert.error);
            return redirectBack(
              { meta: "error", step: "upsert_facebook", reason: fbUpsert.error.message },
              uid,
            );
          }

          // Step 5b: if pages exist, also stash the _meta_pending row for the picker
          if (pages.length > 0) {
            const { error: pendErr } = await supabaseAdmin.from("social_connections").upsert(
              {
                user_id: uid,
                provider: "_meta_pending",
                account_id: null,
                account_name: "Meta pending",
                access_token: userAccessToken,
                refresh_token: null,
                expires_at: null,
                scope: null,
                token_type: "bearer",
                provider_metadata: { pages },
                last_error: null,
                last_verified_at: new Date().toISOString(),
              },
              { onConflict: "user_id,provider" },
            );
            if (pendErr) {
              console.error("[oauth/meta/callback] step=upsert_pending FAILED", pendErr);
              // Non-fatal — the facebook row is already saved.
            }
            return redirectBack({ connected: "facebook", meta: "pick" }, uid);
          }

          // No pages → connection still stored as identity-only.
          return redirectBack({ connected: "facebook", meta: "no_pages" }, uid);
        } catch (e: any) {
          console.error("[oauth/meta/callback] unexpected error", e);
          return redirectBack(
            { meta: "error", step: "unknown", reason: e?.message ?? "unknown" },
            uid,
          );
        }
      },
    },
  },
});
