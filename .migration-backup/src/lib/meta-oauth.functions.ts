import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Meta (Facebook + Instagram Business) OAuth.
 *
 * Flow:
 *   1. startMetaOAuth() → returns Facebook OAuth URL (user-token scope).
 *   2. /api/oauth/meta/callback exchanges code → user access token,
 *      fetches /me/accounts (pages) with `instagram_business_account` field,
 *      stores a temp row with provider="_meta_pending" + pages list in
 *      provider_metadata, then redirects to /connections?meta=pick.
 *   3. UI calls getMetaPendingPages() to render a picker.
 *   4. selectMetaPage({ pageId }) upserts provider="facebook" with the
 *      Page access token; if the Page has an IG Business account, also
 *      upserts provider="instagram". Deletes the _meta_pending row.
 */

export const META_SCOPES = [
  "public_profile",
  "pages_show_list",
  // Required to read /me/businesses and /{business_id}/owned_pages — without
  // this, Business-Portfolio-owned Pages are invisible to /me/accounts AND
  // /me/businesses returns HTTP 400. App admins/devs/testers can grant this
  // without App Review.
  "business_management",
].join(",");

const GRAPH_VERSION = "v21.0";

function getMetaRedirectUri() {
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  if (!publicAppUrl) throw new Error("PUBLIC_APP_URL not configured");
  return `${publicAppUrl.replace(/\/$/, "")}/api/oauth/meta/callback`;
}

export const getMetaOAuthConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const appId = process.env.META_APP_ID ?? "";
    const hasSecret = !!process.env.META_APP_SECRET;
    let redirectUri = "";
    try {
      redirectUri = getMetaRedirectUri();
    } catch {
      /* ignore */
    }
    return {
      configured: !!(appId && hasSecret && redirectUri),
      appId,
      hasSecret,
      redirectUri,
    };
  });

/**
 * Meta/Facebook OAuth diagnostics — surfaces the exact authorization URL,
 * client_id, redirect_uri, scope string, response_type, graph version and
 * a freshly-signed state token for inspection.
 */
export const getMetaDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const appId = process.env.META_APP_ID ?? "";
    const hasSecret = !!process.env.META_APP_SECRET;
    const publicAppUrl = process.env.PUBLIC_APP_URL ?? "";
    let redirectUri = "";
    try {
      redirectUri = getMetaRedirectUri();
    } catch {
      /* ignore */
    }

    let state = "";
    try {
      const { signState } = await import("./oauth-state.server");
      state = signState({ uid: context.userId, p: "meta" });
    } catch {
      /* ignore */
    }

    const configId = process.env.META_CONFIG_ID ?? "";

    let authUrl = "";
    if (appId && redirectUri) {
      const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
      u.searchParams.set("client_id", appId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("response_type", "code");
      if (configId) {
        // Facebook Login for Business — triggers the page/asset picker
        u.searchParams.set("config_id", configId);
      } else {
        u.searchParams.set("scope", META_SCOPES);
      }
      // Force Facebook to re-show the permission dialog so the user can
      // grant Page-level permissions instead of silently reusing a prior
      // "name + profile picture" grant.
      u.searchParams.set("auth_type", "rerequest");
      u.searchParams.set("state", state || "(generated at connect time)");
      authUrl = u.toString();
    }

    return {
      configured: !!(appId && hasSecret && redirectUri),
      appId,
      hasSecret,
      publicAppUrlSet: !!publicAppUrl,
      publicAppUrl,
      redirectUri,
      graphVersion: GRAPH_VERSION,
      responseType: "code",
      scope: META_SCOPES,
      scopes: META_SCOPES.split(","),
      configIdSet: !!configId,
      configId,
      authType: "rerequest",
      state,
      authUrl,
    };
  });

export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error("META_APP_ID not configured");
    if (!process.env.META_APP_SECRET) throw new Error("META_APP_SECRET not configured");
    const redirectUri = getMetaRedirectUri();

    const { signState } = await import("./oauth-state.server");
    const state = signState({ uid: context.userId, p: "meta" });

    const configId = process.env.META_CONFIG_ID ?? "";
    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    if (configId) {
      // Facebook Login for Business — server-side configuration controls
      // which permissions / assets (Pages, IG) are requested and shows the
      // Business Login asset-picker UI.
      url.searchParams.set("config_id", configId);
    } else {
      url.searchParams.set("scope", META_SCOPES);
    }
    // Force the permission dialog so Facebook re-prompts the user for
    // pages_show_list instead of silently reusing prior consent.
    url.searchParams.set("auth_type", "rerequest");
    url.searchParams.set("state", state);

    return { url: url.toString(), redirectUri, usedConfigId: !!configId };
  });

export const getMetaPendingPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("social_connections")
      .select("provider_metadata, last_verified_at")
      .eq("user_id", context.userId)
      .eq("provider", "_meta_pending")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { pages: [] as Array<{ id: string; name: string; hasInstagram: boolean; instagramUsername: string | null }> };
    const meta = (data.provider_metadata ?? {}) as any;
    const pages = Array.isArray(meta.pages) ? meta.pages : [];
    return {
      pages: pages.map((p: any) => ({
        id: String(p.id),
        name: String(p.name ?? p.id),
        hasInstagram: !!p.instagram_business_account?.id,
        instagramUsername: p.instagram_business_account?.username ?? null,
      })),
    };
  });

export const selectMetaPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pageId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: pending, error: readErr } = await context.supabase
      .from("social_connections")
      .select("provider_metadata")
      .eq("user_id", context.userId)
      .eq("provider", "_meta_pending")
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!pending) throw new Error("No pending Meta connection. Start the OAuth flow again.");

    const meta = (pending.provider_metadata ?? {}) as any;
    const pages = Array.isArray(meta.pages) ? meta.pages : [];
    const page = pages.find((p: any) => String(p.id) === data.pageId);
    if (!page) throw new Error("Selected page not found in pending Meta pages.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Upsert Facebook page connection
    const fbUpsert = await supabaseAdmin.from("social_connections").upsert(
      {
        user_id: context.userId,
        provider: "facebook",
        account_id: String(page.id),
        account_name: String(page.name ?? page.id),
        access_token: page.access_token ?? null,
        refresh_token: null,
        expires_at: null, // page tokens are typically long-lived
        scope: META_SCOPES,
        token_type: "bearer",
        provider_metadata: { category: page.category ?? null, tasks: page.tasks ?? null },
        last_error: null,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (fbUpsert.error) throw new Error(`Facebook upsert failed: ${fbUpsert.error.message}`);

    // Upsert Instagram connection if the Page has an IG Business account
    let instagram: { id: string; username: string | null } | null = null;
    if (page.instagram_business_account?.id) {
      instagram = {
        id: String(page.instagram_business_account.id),
        username: page.instagram_business_account.username ?? null,
      };
      const igUpsert = await supabaseAdmin.from("social_connections").upsert(
        {
          user_id: context.userId,
          provider: "instagram",
          account_id: instagram.id,
          account_name: instagram.username ?? instagram.id,
          access_token: page.access_token ?? null, // IG Graph uses the Page token
          refresh_token: null,
          expires_at: null,
          scope: META_SCOPES,
          token_type: "bearer",
          provider_metadata: { facebook_page_id: String(page.id) },
          last_error: null,
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      );
      if (igUpsert.error) throw new Error(`Instagram upsert failed: ${igUpsert.error.message}`);
    }

    // Clear the pending row
    await supabaseAdmin
      .from("social_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "_meta_pending");

    return { facebook: { id: String(page.id), name: String(page.name ?? page.id) }, instagram };
  });

export const cancelMetaPending = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("social_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "_meta_pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMetaCallbackTrace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getMetaCallbackTraceForUser } = await import("./meta-callback-trace.server");
    return { trace: getMetaCallbackTraceForUser(context.userId) };
  });

export const saveManualFacebookPageId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pageId: string }) => d)
  .handler(async ({ data, context }) => {
    const pageId = String(data.pageId ?? "").trim();
    if (!pageId) throw new Error("Facebook Page ID is required.");

    const { data: fb, error: fbErr } = await context.supabase
      .from("social_connections")
      .select("access_token, account_id, account_name, provider_metadata")
      .eq("user_id", context.userId)
      .eq("provider", "facebook")
      .maybeSingle();
    if (fbErr) throw new Error(fbErr.message);
    if (!fb?.access_token) {
      return { status: "no_facebook" as const, debug: null };
    }

    const userToken = fb.access_token;
    const lookupUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}`);
    lookupUrl.searchParams.set("fields", "id,name,instagram_business_account{id,username,name}");
    lookupUrl.searchParams.set("access_token", userToken);
    const endpoint = lookupUrl.toString().replace(userToken, "<USER_TOKEN>");

    const lookupRes = await fetch(lookupUrl.toString());
    const rawText = await lookupRes.text();
    let rawResponse: any = rawText;
    try { rawResponse = JSON.parse(rawText); } catch { /* keep raw text */ }

    const pageName = rawResponse?.name ? String(rawResponse.name) : null;
    const ig = rawResponse?.instagram_business_account?.id
      ? {
          id: String(rawResponse.instagram_business_account.id),
          username: rawResponse.instagram_business_account.username ?? null,
          name: rawResponse.instagram_business_account.name ?? null,
        }
      : null;
    const errorMessage = rawResponse?.error?.message ?? (lookupRes.ok ? null : `page_lookup_http_${lookupRes.status}`);
    const debug = {
      selectedPageId: pageId,
      pageIds: [pageId],
      pageNames: [pageName ?? pageId],
      endpoint,
      httpStatus: lookupRes.status,
      ok: lookupRes.ok,
      rawResponse,
      rawText: rawText.slice(0, 4000),
      instagramBusinessAccountId: ig?.id ?? null,
      pageLookups: [{
        pageId,
        pageName: pageName ?? pageId,
        endpoint,
        httpStatus: lookupRes.status,
        ok: lookupRes.ok,
        rawResponse,
        instagramBusinessAccountId: ig?.id ?? null,
        igDetailsEndpoint: null,
        igDetailsHttpStatus: null,
        igDetailsResponse: ig,
      }],
    };

    const fbMeta = (fb.provider_metadata ?? {}) as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fbUpdate = await supabaseAdmin
      .from("social_connections")
      .update({
        provider_metadata: {
          ...fbMeta,
          selected_page_id: pageId,
          selected_page_name: pageName,
          manual_page_lookup: {
            at: new Date().toISOString(),
            endpoint,
            httpStatus: lookupRes.status,
            ok: lookupRes.ok,
            rawResponse,
          },
        },
        last_error: lookupRes.ok ? null : errorMessage,
        last_verified_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId)
      .eq("provider", "facebook");
    if (fbUpdate.error) throw new Error(`Facebook update failed: ${fbUpdate.error.message}`);

    if (ig) {
      const igUpsert = await supabaseAdmin.from("social_connections").upsert(
        {
          user_id: context.userId,
          provider: "instagram",
          account_id: ig.id,
          account_name: ig.username ?? ig.name ?? ig.id,
          access_token: userToken,
          refresh_token: null,
          expires_at: null,
          scope: META_SCOPES,
          token_type: "bearer",
          provider_metadata: {
            facebook_page_id: pageId,
            facebook_page_name: pageName,
            selected_page_id: pageId,
            instagram_username: ig.username,
            instagram_name: ig.name,
          },
          last_error: null,
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      );
      if (igUpsert.error) throw new Error(`Instagram upsert failed: ${igUpsert.error.message}`);
    }

    return {
      status: !lookupRes.ok ? "lookup_failed" as const : ig ? "connected" as const : "saved" as const,
      page: { id: pageId, name: pageName },
      instagram: ig,
      debug,
    };
  });

const GRAPH_VERSION_IG = "v21.0";

/**
 * Discover and connect an Instagram Business account using the stored
 * Facebook user access token. Currently uses pages_show_list only;
 * Instagram discovery requires instagram_basic which needs App Review.
 *
 * Returns one of:
 *   { status: "connected", instagram: { id, username, pageId, pageName } }
 *   { status: "no_instagram", pagesChecked: number }
 *   { status: "missing_permission", scope: string, message: string }
 *   { status: "no_facebook" }
 *   { status: "needs_app_review", message: string }
 */
export const connectInstagramFromFacebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const debug: {
      userTokenPresent: boolean;
      selectedPageId: string | null;
      pagesEndpoint: string;
      pagesHttpStatus: number | null;
      pagesError: any;
      pageIds: string[];
      pageNames: string[];
      pageLookups: Array<{
        pageId: string;
        pageName: string;
        endpoint: string;
        httpStatus: number;
        ok: boolean;
        rawResponse: any;
        instagramBusinessAccountId: string | null;
        igDetailsEndpoint: string | null;
        igDetailsHttpStatus: number | null;
        igDetailsResponse: any;
      }>;
    } = {
      userTokenPresent: false,
      selectedPageId: null,
      pagesEndpoint: "",
      pagesHttpStatus: null,
      pagesError: null,
      pageIds: [],
      pageNames: [],
      pageLookups: [],
    };

    const { data: fb, error: fbErr } = await context.supabase
      .from("social_connections")
      .select("access_token, account_id, account_name, provider_metadata")
      .eq("user_id", context.userId)
      .eq("provider", "facebook")
      .maybeSingle();
    if (fbErr) throw new Error(fbErr.message);
    if (!fb?.access_token) {
      return { status: "no_facebook" as const, debug };
    }
    const userToken = fb.access_token;
    debug.userTokenPresent = true;
    const fbMeta = (fb.provider_metadata ?? {}) as any;
    const selectedPageId = fbMeta.selected_page_id ? String(fbMeta.selected_page_id) : null;
    debug.selectedPageId = selectedPageId;

    if (selectedPageId) {
      const lookupUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION_IG}/${selectedPageId}`);
      lookupUrl.searchParams.set("fields", "id,name,instagram_business_account{id,username,name}");
      lookupUrl.searchParams.set("access_token", userToken);
      const lookupRes = await fetch(lookupUrl.toString());
      const lookupJson: any = await lookupRes.json().catch(() => ({}));
      const igAccount = lookupJson?.instagram_business_account;
      const igId: string | null = igAccount?.id ? String(igAccount.id) : null;
      debug.pageIds = [selectedPageId];
      debug.pageNames = [String(lookupJson?.name ?? selectedPageId)];
      debug.pageLookups.push({
        pageId: selectedPageId,
        pageName: String(lookupJson?.name ?? selectedPageId),
        endpoint: lookupUrl.toString().replace(userToken, "<USER_TOKEN>"),
        httpStatus: lookupRes.status,
        ok: lookupRes.ok,
        rawResponse: lookupJson,
        instagramBusinessAccountId: igId,
        igDetailsEndpoint: null,
        igDetailsHttpStatus: null,
        igDetailsResponse: igAccount ?? null,
      });

      if (!lookupRes.ok) {
        return { status: "no_instagram" as const, pagesChecked: 1, debug };
      }

      if (igId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const igUpsert = await supabaseAdmin.from("social_connections").upsert(
          {
            user_id: context.userId,
            provider: "instagram",
            account_id: igId,
            account_name: igAccount?.username ?? igAccount?.name ?? igId,
            access_token: userToken,
            refresh_token: null,
            expires_at: null,
            scope: META_SCOPES,
            token_type: "bearer",
            provider_metadata: {
              facebook_page_id: selectedPageId,
              facebook_page_name: lookupJson?.name ?? null,
              selected_page_id: selectedPageId,
              instagram_username: igAccount?.username ?? null,
              instagram_name: igAccount?.name ?? null,
            },
            last_error: null,
            last_verified_at: new Date().toISOString(),
          },
          { onConflict: "user_id,provider" },
        );
        if (igUpsert.error) {
          throw new Error(`Instagram upsert failed: ${igUpsert.error.message}`);
        }
        return {
          status: "connected" as const,
          instagram: {
            id: igId,
            username: igAccount?.username ?? null,
            name: igAccount?.name ?? null,
            pageId: selectedPageId,
            pageName: lookupJson?.name ?? selectedPageId,
          },
          debug,
        };
      }

      return { status: "no_instagram" as const, pagesChecked: 1, debug };
    }

    const pagesUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION_IG}/me/accounts`);
    pagesUrl.searchParams.set("fields", "id,name,access_token");
    pagesUrl.searchParams.set("access_token", userToken);
    debug.pagesEndpoint = pagesUrl.toString().replace(userToken, "<USER_TOKEN>");

    const pagesRes = await fetch(pagesUrl.toString());
    debug.pagesHttpStatus = pagesRes.status;
    const pagesJson: any = await pagesRes.json().catch(() => ({}));
    if (!pagesRes.ok) {
      debug.pagesError = pagesJson?.error ?? null;
      const msg = pagesJson?.error?.message ?? `pages_http_${pagesRes.status}`;
      const code = pagesJson?.error?.code;
      if (code === 200 || code === 10 || /permission/i.test(String(msg))) {
        return {
          status: "missing_permission" as const,
          scope: "pages_show_list",
          message: msg,
          debug,
        };
      }
      // Code 100 ("nonexisting field accounts") means the stored token is not
      // a user token (likely a Page token) — surface as typed failure so the
      // UI can prompt a reconnect instead of crashing the route.
      return {
        status: "pages_list_failed" as const,
        message: msg,
        code: code ?? null,
        debug,
      };
    }
    const pages: Array<{ id: string; name?: string; access_token?: string }> = Array.isArray(pagesJson?.data)
      ? pagesJson.data
      : [];
    debug.pageIds = pages.map((p) => String(p.id));
    debug.pageNames = pages.map((p) => String(p.name ?? p.id));

    if (pages.length === 0) {
      return { status: "no_instagram" as const, pagesChecked: 0, debug };
    }

    let foundPage:
      | { page: typeof pages[number]; igId: string; igUsername: string | null; igName: string | null }
      | null = null;

    for (const page of pages) {
      const tokenForLookup = page.access_token ?? userToken;
      const lookupUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION_IG}/${page.id}`);
      lookupUrl.searchParams.set("fields", "instagram_business_account");
      lookupUrl.searchParams.set("access_token", tokenForLookup);

      const lookupRes = await fetch(lookupUrl.toString());
      const lookupJson: any = await lookupRes.json().catch(() => ({}));

      const igId: string | null = lookupJson?.instagram_business_account?.id
        ? String(lookupJson.instagram_business_account.id)
        : null;

      let igDetailsEndpoint: string | null = null;
      let igDetailsHttpStatus: number | null = null;
      let igDetailsResponse: any = null;
      let igUsername: string | null = null;
      let igName: string | null = null;

      if (igId) {
        const detailsUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION_IG}/${igId}`);
        detailsUrl.searchParams.set("fields", "id,username,name");
        detailsUrl.searchParams.set("access_token", tokenForLookup);
        igDetailsEndpoint = detailsUrl.toString().replace(tokenForLookup, "<PAGE_TOKEN>");
        const detailsRes = await fetch(detailsUrl.toString());
        igDetailsHttpStatus = detailsRes.status;
        igDetailsResponse = await detailsRes.json().catch(() => ({}));
        igUsername = igDetailsResponse?.username ?? null;
        igName = igDetailsResponse?.name ?? null;
      }

      debug.pageLookups.push({
        pageId: String(page.id),
        pageName: String(page.name ?? page.id),
        endpoint: lookupUrl.toString().replace(tokenForLookup, "<PAGE_TOKEN>"),
        httpStatus: lookupRes.status,
        ok: lookupRes.ok,
        rawResponse: lookupJson,
        instagramBusinessAccountId: igId,
        igDetailsEndpoint,
        igDetailsHttpStatus,
        igDetailsResponse,
      });

      if (igId && !foundPage) {
        foundPage = { page, igId, igUsername, igName };
      }
    }

    if (foundPage) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const igUpsert = await supabaseAdmin.from("social_connections").upsert(
        {
          user_id: context.userId,
          provider: "instagram",
          account_id: foundPage.igId,
          account_name: foundPage.igUsername ?? foundPage.igName ?? foundPage.igId,
          access_token: foundPage.page.access_token ?? userToken,
          refresh_token: null,
          expires_at: null,
          scope: META_SCOPES,
          token_type: "bearer",
          provider_metadata: {
            facebook_page_id: String(foundPage.page.id),
            facebook_page_name: String(foundPage.page.name ?? foundPage.page.id),
            instagram_username: foundPage.igUsername,
            instagram_name: foundPage.igName,
          },
          last_error: null,
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      );
      if (igUpsert.error) {
        throw new Error(`Instagram upsert failed: ${igUpsert.error.message}`);
      }
      return {
        status: "connected" as const,
        instagram: {
          id: foundPage.igId,
          username: foundPage.igUsername,
          name: foundPage.igName,
          pageId: String(foundPage.page.id),
          pageName: String(foundPage.page.name ?? foundPage.page.id),
        },
        debug,
      };
    }

    const permErr = debug.pageLookups.find((l) => {
      const err = l.rawResponse?.error;
      return err && (/instagram_basic/i.test(String(err.message ?? "")) || err.code === 200 || err.code === 10);
    });
    if (permErr) {
      return {
        status: "missing_permission" as const,
        scope: "instagram_basic",
        message:
          permErr.rawResponse?.error?.message ??
          "Meta did not return instagram_business_account. The instagram_basic permission is required.",
        debug,
      };
    }

    return { status: "no_instagram" as const, pagesChecked: pages.length, debug };
  });

/**
 * Discover Pages owned by a specific Business Portfolio (Business Manager).
 *
 * Used when a Page is owned by a BM and therefore does not appear in
 * /me/accounts. Calls (in order):
 *   GET /{bm_id}?fields=id,name
 *   GET /{bm_id}/owned_pages?fields=id,name,instagram_business_account{id,username,name}
 *   GET /{bm_id}/client_pages?fields=id,name,instagram_business_account{id,username,name}
 *
 * Requires `business_management` permission on the user token.
 * Returns raw response bodies for every request so the UI can render them.
 */
export const discoverPagesViaBusinessPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { businessId: string }) => d)
  .handler(async ({ data, context }) => {
    const businessId = String(data.businessId ?? "").trim();
    if (!businessId) throw new Error("Business Portfolio ID is required.");

    const { data: fb, error: fbErr } = await context.supabase
      .from("social_connections")
      .select("access_token, provider_metadata")
      .eq("user_id", context.userId)
      .eq("provider", "facebook")
      .maybeSingle();
    if (fbErr) throw new Error(fbErr.message);
    if (!fb?.access_token) return { status: "no_facebook" as const, debug: null };

    const userToken = fb.access_token;
    const sanitize = (u: string) => u.replace(userToken, "<USER_TOKEN>");

    const callGraph = async (path: string, fields: string) => {
      const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
      u.searchParams.set("fields", fields);
      u.searchParams.set("access_token", userToken);
      const res = await fetch(u.toString());
      const text = await res.text();
      let json: any = text;
      try { json = JSON.parse(text); } catch { /* keep raw */ }
      return {
        endpoint: sanitize(u.toString()),
        httpStatus: res.status,
        ok: res.ok,
        rawResponse: json,
        rawText: text.slice(0, 4000),
        errorMessage: json?.error?.message ?? (res.ok ? null : `http_${res.status}`),
        errorCode: json?.error?.code ?? null,
        errorSubcode: json?.error?.error_subcode ?? null,
        errorType: json?.error?.type ?? null,
      };
    };

    const businessInfo = await callGraph(businessId, "id,name,primary_page");
    const ownedPages = await callGraph(
      `${businessId}/owned_pages`,
      "id,name,instagram_business_account{id,username,name}",
    );
    const clientPages = await callGraph(
      `${businessId}/client_pages`,
      "id,name,instagram_business_account{id,username,name}",
    );

    const collect = (resp: any) => {
      const arr = Array.isArray(resp?.rawResponse?.data) ? resp.rawResponse.data : [];
      return arr.map((p: any) => ({
        id: String(p.id),
        name: p.name ?? null,
        instagram: p.instagram_business_account?.id
          ? {
              id: String(p.instagram_business_account.id),
              username: p.instagram_business_account.username ?? null,
              name: p.instagram_business_account.name ?? null,
            }
          : null,
      }));
    };
    const pages = [...collect(ownedPages), ...collect(clientPages)];
    // Deduplicate by id
    const seen = new Set<string>();
    const pagesDedup = pages.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

    // Hint: explain HTTP 400 on /me/businesses if business_management was not granted.
    let hint: string | null = null;
    if (!businessInfo.ok && businessInfo.errorCode === 200) {
      hint = "HTTP 400 with code 200 → the user token is missing business_management. Reconnect Facebook to grant it.";
    } else if (!ownedPages.ok && ownedPages.errorCode === 200) {
      hint = "owned_pages failed with code 200 → business_management permission not granted on the user token.";
    }

    return {
      status: pagesDedup.length > 0 ? "found" as const : "empty" as const,
      businessId,
      hint,
      pages: pagesDedup,
      debug: { businessInfo, ownedPages, clientPages },
    };
  });
