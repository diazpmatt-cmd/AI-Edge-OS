import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOCIAL_PROVIDERS } from "@/lib/social-providers";
import { toast } from "sonner";
import { Copy, Check, Info, AlertTriangle } from "lucide-react";
import {
  listConnections,
  disconnectProvider,
  startGoogleOAuth,
  getGoogleOAuthPreflight,
  testGoogleOAuth,
} from "@/lib/social-connections.functions";
import {
  startMetaOAuth,
  getMetaPendingPages,
  selectMetaPage,
  cancelMetaPending,
  getMetaOAuthConfig,
  getMetaDiagnostics,
  getMetaCallbackTrace,
  connectInstagramFromFacebook,
  saveManualFacebookPageId,
  discoverPagesViaBusinessPortfolio,
} from "@/lib/meta-oauth.functions";
import { startYouTubeOAuth, getYouTubeDiagnostics } from "@/lib/youtube-oauth.functions";
import { startTikTokOAuth, getTikTokOAuthConfig } from "@/lib/tiktok-oauth.functions";


export const Route = createFileRoute("/_authenticated/connections")({
  component: ConnectionsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <p className="text-sm text-destructive">Error: {error.message}</p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-sm text-muted-foreground">Not found.</p>
    </AppShell>
  ),
});

function PlatformIcon({ id }: { id: string }) {
  const colors: Record<string, string> = {
    google_business: "bg-blue-500",
    facebook: "bg-blue-600",
    instagram: "bg-pink-500",
    youtube: "bg-red-600",
    tiktok: "bg-black dark:bg-white dark:text-black",
    linkedin: "bg-blue-700",
  };
  const labels: Record<string, string> = {
    google_business: "G",
    facebook: "F",
    instagram: "I",
    youtube: "Y",
    tiktok: "T",
    linkedin: "L",
  };
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${colors[id] || "bg-muted text-muted-foreground"}`}
    >
      {labels[id] || "?"}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ConnectionsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listConnections);
  const startGoogle = useServerFn(startGoogleOAuth);
  const disconnect = useServerFn(disconnectProvider);
  const fetchPreflight = useServerFn(getGoogleOAuthPreflight);
  const runTest = useServerFn(testGoogleOAuth);
  type TestResult = Awaited<ReturnType<typeof testGoogleOAuth>>;
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [promptConsent, setPromptConsent] = useState(false);
  const [accessTypeOffline, setAccessTypeOffline] = useState(false);
  const preflightMounted = useRef(false);

  const { data: connections = [] } = useQuery({
    queryKey: ["social_connections"],
    queryFn: () => fetchList(),
  });

  const {
    data: preflight,
    refetch: refetchPreflight,
    isFetching: preflightFetching,
  } = useQuery({
    queryKey: ["google_oauth_preflight"],
    queryFn: () => fetchPreflight(),
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
  });

  const [connecting, setConnecting] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const startMeta = useServerFn(startMetaOAuth);
  const fetchMetaPending = useServerFn(getMetaPendingPages);
  const selectPage = useServerFn(selectMetaPage);
  const cancelPending = useServerFn(cancelMetaPending);
  const fetchMetaConfig = useServerFn(getMetaOAuthConfig);
  const fetchMetaDiag = useServerFn(getMetaDiagnostics);

  const { data: metaConfig } = useQuery({
    queryKey: ["meta_oauth_config"],
    queryFn: () => fetchMetaConfig(),
    staleTime: 60_000,
  });
  const {
    data: metaDiag,
    refetch: refetchMetaDiag,
    isFetching: metaDiagFetching,
  } = useQuery({
    queryKey: ["meta_diagnostics"],
    queryFn: () => fetchMetaDiag(),
    staleTime: 30_000,
  });
  const fetchMetaTrace = useServerFn(getMetaCallbackTrace);
  const {
    data: metaTraceData,
    refetch: refetchMetaTrace,
    isFetching: metaTraceFetching,
  } = useQuery({
    queryKey: ["meta_callback_trace"],
    queryFn: () => fetchMetaTrace(),
    staleTime: 10_000,
  });
  const metaTrace = metaTraceData?.trace ?? null;
  const [metaCallbackError, setMetaCallbackError] = useState<{
    step: string | null;
    reason: string | null;
    errParam: string | null;
    errReason: string | null;
    raw: string;
  } | null>(null);

  const startYouTube = useServerFn(startYouTubeOAuth);
  const fetchYouTubeDiag = useServerFn(getYouTubeDiagnostics);
  type YouTubeStartResult = Awaited<ReturnType<typeof startYouTubeOAuth>>;
  const [lastYouTubeStart, setLastYouTubeStart] = useState<YouTubeStartResult | null>(null);
  const [openingYouTubeDebug, setOpeningYouTubeDebug] = useState(false);
  const {
    data: ytDiag,
    refetch: refetchYtDiag,
    isFetching: ytDiagFetching,
  } = useQuery({
    queryKey: ["youtube_diagnostics"],
    queryFn: () => fetchYouTubeDiag(),
    staleTime: 30_000,
  });
  const startTikTok = useServerFn(startTikTokOAuth);
  const fetchTikTokConfig = useServerFn(getTikTokOAuthConfig);
  const { data: tiktokConfig } = useQuery({
    queryKey: ["tiktok_oauth_config"],
    queryFn: () => fetchTikTokConfig(),
    staleTime: 60_000,
  });

  const [metaPickerOpen, setMetaPickerOpen] = useState(false);
  const { data: metaPending } = useQuery({
    queryKey: ["meta_pending_pages"],
    queryFn: () => fetchMetaPending(),
    enabled: metaPickerOpen,
  });

  // Surface OAuth callback result
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("oauth");
    const connected = params.get("connected");
    const meta = params.get("meta");
    if (!status && !connected && !meta) return;
    if (status === "success" || connected) {
      const provider = params.get("provider") ?? connected ?? "account";
      const noPages = meta === "no_pages";
      toast.success(
        provider === "facebook" && noPages
          ? "Connected Facebook — no pages found"
          : `Connected ${provider}`,
      );
      if (provider === "facebook" && noPages) {
        setIgNotice("No Pages returned. Reconnect Facebook and make sure page access is granted, or paste Page ID manually.");
      }
      setOauthError(null);
      qc.invalidateQueries({ queryKey: ["social_connections"] });
      if (provider === "youtube" || connected === "youtube") {
        qc.invalidateQueries({ queryKey: ["youtube_diagnostics"] });
      }
      if (connected === "facebook" || meta) {
        refetchMetaTrace();
      }
    } else if (status === "error") {
      const reason = params.get("reason") ?? "unknown";
      const step = params.get("step");
      const msg = step ? `${step}: ${reason}` : reason;
      setOauthError(msg);
      toast.error(`Connection failed at ${msg}`);
    }
    if (meta === "pick") {
      setMetaPickerOpen(true);
    } else if (meta === "error") {
      const reason = params.get("reason") ?? "unknown";
      const step = params.get("step");
      const errParam = params.get("error");
      const errReason = params.get("error_reason");
      const msg = step ? `meta ${step}: ${reason}` : `meta: ${reason}`;
      setOauthError(msg);
      setMetaCallbackError({
        step,
        reason,
        errParam,
        errReason,
        raw: window.location.search,
      });
      refetchMetaTrace();
      toast.error(`Meta connection failed at ${msg}`);
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, [qc, refetchMetaTrace]);

  // Re-run preflight on every mount after the first (e.g., when user navigates back to /connections)
  useEffect(() => {
    if (!preflightMounted.current) {
      preflightMounted.current = true;
      return;
    }
    refetchPreflight();
  }, [refetchPreflight]);

  const disconnectMut = useMutation({
    mutationFn: (provider: string) => disconnect({ data: { provider } }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["social_connections"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to disconnect"),
  });

  // Open an OAuth authorization URL in a new top-level tab. We deliberately
  // avoid `window.location.href`, `window.top.location.href`, and assigning
  // `popup.location.href` after `window.open("about:blank")` — inside the
  // Lovable preview iframe those all fail with:
  //   "The current window does not have permission to navigate the target
  //    frame to accounts.google.com."
  // `window.open(url, "_blank", "noopener,noreferrer")` creates a brand-new
  // top-level browsing context that the iframe is allowed to spawn.
  const openOAuthUrl = (url: string, providerLabel: string) => {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error(
        `Popup blocked. Allow popups for this site, then click Connect ${providerLabel} again.`,
      );
      return false;
    }
    return true;
  };

  const handleConnectGoogle = async () => {
    setConnecting("google_business");
    setOauthError(null);
    try {
      const { url } = await startGoogle();
      openOAuthUrl(url, "Google");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start OAuth");
    } finally {
      setConnecting(null);
    }
  };

  const handleConnectMeta = async () => {
    setConnecting("meta");
    setOauthError(null);
    try {
      const { url } = await startMeta();
      openOAuthUrl(url, "Facebook");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start Meta OAuth");
    } finally {
      setConnecting(null);
    }
  };

  const igFromFb = useServerFn(connectInstagramFromFacebook);
  const saveManualPageId = useServerFn(saveManualFacebookPageId);
  const discoverViaBM = useServerFn(discoverPagesViaBusinessPortfolio);
  const [igNotice, setIgNotice] = useState<string | null>(null);
  const [igDebug, setIgDebug] = useState<any>(null);
  const [manualPageId, setManualPageId] = useState("");
  const [businessPortfolioId, setBusinessPortfolioId] = useState("663731734750534");
  const [bmDebug, setBmDebug] = useState<any>(null);
  const [bmPages, setBmPages] = useState<Array<{ id: string; name: string | null; instagram: any }>>([]);
  const bmDiscoverMut = useMutation({
    mutationFn: (bid: string) => discoverViaBM({ data: { businessId: bid } }),
    onSuccess: (res: any) => {
      setBmDebug(res?.debug ?? null);
      setBmPages(res?.pages ?? []);
      if (res.status === "found") {
        toast.success(`Found ${res.pages.length} Page(s) in Business Portfolio`);
      } else if (res.status === "empty") {
        toast.error(res.hint ?? "No Pages returned by Business Portfolio lookup");
      } else if (res.status === "no_facebook") {
        toast.error("Connect Facebook first.");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Business Portfolio lookup failed"),
  });
  const manualPageIdMut = useMutation({
    mutationFn: (pageId: string) => saveManualPageId({ data: { pageId } }),
    onSuccess: (res: any) => {
      setIgDebug(res?.debug ?? null);
      if (res.status === "connected") {
        toast.success(`Saved Page ID and connected Instagram @${res.instagram.username ?? res.instagram.id}`);
        setIgNotice(null);
      } else if (res.status === "saved") {
        toast.success("Saved Facebook Page ID");
        setIgNotice("Facebook Page ID saved. No linked Instagram Business account was returned for that Page ID.");
      } else if (res.status === "lookup_failed") {
        toast.error("Page lookup failed. Check the raw Meta response below.");
        setIgNotice("Page ID saved, but Meta returned an error for the page lookup.");
      } else if (res.status === "no_facebook") {
        toast.error("Connect Facebook first.");
        setIgNotice("Connect Facebook first, then save the Facebook Page ID.");
      }
      qc.invalidateQueries({ queryKey: ["social_connections"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save Page ID"),
  });
  const connectIgMut = useMutation({
    mutationFn: () => igFromFb(),
    onSuccess: (res: any) => {
      setIgDebug(res?.debug ?? null);
      console.log("[ig-connect] response", res);
      if (res.status === "connected") {
        toast.success(
          `Connected Instagram @${res.instagram.username ?? res.instagram.id} (via Page "${res.instagram.pageName}")`,
        );
        setIgNotice(null);
        qc.invalidateQueries({ queryKey: ["social_connections"] });
      } else if (res.status === "no_instagram") {
        setIgNotice((res.pagesChecked ?? 0) === 0
          ? "No Pages returned. Reconnect Facebook and make sure page access is granted, or paste Page ID manually."
          : `No linked Instagram Business account found across ${res.pagesChecked ?? 0} Page(s). Verify the Page is linked to your Instagram Professional account in Meta Business Suite → Linked Accounts.`,
        );
        toast.error("No Instagram Business account linked to your Pages.");
      } else if (res.status === "no_facebook") {
        setIgNotice("Connect Facebook first, then try Connect Instagram.");
        toast.error("Facebook not connected.");
      } else if (res.status === "missing_permission") {
        setIgNotice(
          `Missing permission (${res.scope}): ${res.message}. Re-connect Facebook to re-authorize.`,
        );
        toast.error(`Missing permission: ${res.message}`);
      } else if (res.status === "needs_app_review") {
        setIgNotice(res.message);
        toast.error("Instagram requires App Review.");
      } else if (res.status === "pages_list_failed") {
        setIgNotice(
          `Meta /me/accounts failed: ${res.message}${res.code ? ` (code ${res.code})` : ""}. The stored Facebook token may not be a user token — reconnect Facebook, or use the manual Page ID / Business Portfolio lookup below.`,
        );
        toast.error(`Pages list failed: ${res.message}`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to connect Instagram"),
  });

  const handleConnectInstagram = () => {
    setIgNotice(null);
    connectIgMut.mutate();
  };

  const handleConnectYouTube = async () => {
    setConnecting("youtube");
    setOauthError(null);
    try {
      const result = await startYouTube();
      setLastYouTubeStart(result);
      console.log("[youtube-oauth] opening top-level tab", {
        client_id: result.params.client_id,
        redirect_uri: result.params.redirect_uri,
        response_type: result.params.response_type,
        scope: result.params.scope,
        state: result.state,
        fullUrl: result.url,
      });
      openOAuthUrl(result.url, "YouTube");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start YouTube OAuth");
    } finally {
      setConnecting(null);
    }
  };

  const handleOpenYouTubeAuthUrl = async () => {
    setOpeningYouTubeDebug(true);
    setOauthError(null);
    try {
      const result = await startYouTube();
      setLastYouTubeStart(result);
      console.log("[youtube-oauth] debug open exact generated URL", {
        client_id: result.params.client_id,
        redirect_uri: result.params.redirect_uri,
        response_type: result.params.response_type,
        scope: result.params.scope,
        state: result.state,
        fullUrl: result.url,
      });
      openOAuthUrl(result.url, "YouTube");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate YouTube OAuth URL");
    } finally {
      setOpeningYouTubeDebug(false);
    }
  };

  const handleConnectTikTok = async () => {
    setConnecting("tiktok");
    setOauthError(null);
    try {
      const { url } = await startTikTok();
      openOAuthUrl(url, "TikTok");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start TikTok OAuth");
    } finally {
      setConnecting(null);
    }
  };


  const selectPageMut = useMutation({
    mutationFn: (pageId: string) => selectPage({ data: { pageId } }),
    onSuccess: (res) => {
      toast.success(
        res.instagram
          ? `Connected Facebook Page "${res.facebook.name}" + Instagram @${res.instagram.username ?? res.instagram.id}`
          : `Connected Facebook Page "${res.facebook.name}"`,
      );
      setMetaPickerOpen(false);
      qc.invalidateQueries({ queryKey: ["social_connections"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save selection"),
  });

  const handleCancelMeta = async () => {
    try {
      await cancelPending();
    } catch {
      /* ignore */
    }
    setMetaPickerOpen(false);
    qc.invalidateQueries({ queryKey: ["social_connections"] });
  };

  // The publishing OAuth flow stores rows with provider="google"; map it to
  // the "google_business" card so the UI reflects the connection.
  const connByProvider = new Map<string, any>(
    connections.map((c: any) => [c.provider === "google" ? "google_business" : c.provider, c]),
  );


  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Connected Accounts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage social and business profiles for publishing content.
            </p>
          </div>
          <Link
            to="/connections/status"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" />
            OAuth Status
          </Link>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Note: connecting an account here is separate from signing into AI Edge
          Solutions. Sign-in on <code className="rounded bg-muted px-1">/auth</code>{" "}
          uses Lovable-managed Google for identity only. Connecting below uses a
          dedicated OAuth client that grants offline publishing access and stores
          a refresh token for posting content on your behalf.
        </p>
      </div>

      {oauthError && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-destructive">
                Google connection failed
              </div>
              <p className="mt-1 text-muted-foreground">
                Callback step reported: <code className="rounded bg-muted px-1">{oauthError}</code>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Steps: receive code → verify state → exchange token → fetch userinfo → upsert row. The reason above identifies which step failed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOauthError(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}



      {preflight && !preflight.ok && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <div className="font-semibold text-destructive">
            Google OAuth misconfigured ({preflight.reason})
          </div>
          <p className="mt-1 text-muted-foreground">
            {preflight.reason === "redirect_uri_mismatch"
              ? "Google rejected the redirect_uri below. Add it verbatim to your OAuth client's Authorized redirect URIs in Google Cloud Console."
              : preflight.reason === "invalid_client"
                ? "Google does not recognize the configured client_id."
                : "Google OAuth preflight failed."}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchPreflight()}
              disabled={preflightFetching}
            >
              {preflightFetching ? "Checking…" : "Retry preflight"}
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  redirect_uri sent to Google
                </div>
                {preflight.redirectUri && (
                  <CopyButton text={preflight.redirectUri} />
                )}
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-xs">
                {preflight.redirectUri || "(not configured)"}
              </code>
            </div>

            {preflight.reason === "redirect_uri_mismatch" && preflight.redirectUri && (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Add this entry under Authorized redirect URIs
                  </div>
                  <CopyButton text={preflight.redirectUri} />
                </div>
                <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-xs">
                  {preflight.redirectUri}
                </code>
              </div>
            )}

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                client_id
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-xs">
                {preflight.clientId || "(not configured)"}
              </code>
            </div>

            {preflight.detail && (
              <p className="text-xs text-muted-foreground">{preflight.detail}</p>
            )}
          </div>
        </div>
      )}

      <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">Test Google Connect</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Base URL: client_id, redirect_uri, response_type=code, scope=openid email profile. Toggle variants below and compare what Google returns.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={accessTypeOffline}
                  onChange={(e) => setAccessTypeOffline(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                access_type=offline
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={promptConsent}
                  onChange={(e) => setPromptConsent(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                prompt=consent
              </label>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Button
              size="sm"
              onClick={async () => {
                setTesting(true);
                try {
                  const r = await runTest({ data: { promptConsent, accessTypeOffline } });
                  setTestResults((prev) => [r, ...prev].slice(0, 4));
                } catch (e: any) {
                  toast.error(e?.message ?? "Test failed");
                } finally {
                  setTesting(false);
                }
              }}
              disabled={testing}
            >
              {testing ? "Testing…" : "Run test"}
            </Button>
            {testResults.length > 0 && (
              <button
                type="button"
                onClick={() => setTestResults([])}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear results
              </button>
            )}
          </div>
        </div>

        {testResults.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {testResults.map((r, i) => {
              const prev = testResults[i + 1];
              const diffStatus = prev && prev.status !== r.status;
              const diffError = prev && (prev.error ?? "") !== (r.error ?? "");
              const diffLocation = prev && (prev.location ?? "") !== (r.location ?? "");
              return (
                <div
                  key={i}
                  className="rounded border border-border bg-background p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.ok ? "default" : "secondary"}>
                        {r.ok ? "OK" : "Issue"}
                      </Badge>
                      <span className="text-muted-foreground">HTTP {r.status || "—"}</span>
                    </div>
                    {i === 0 && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest</span>}
                  </div>

                  <div className="mt-2 font-medium">{r.variant}</div>

                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Authorization URL
                        </div>
                        {r.authUrl && <CopyButton text={r.authUrl} />}
                      </div>
                      <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">
                        {r.authUrl || "(not built)"}
                      </code>
                    </div>

                    {r.location && (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Location header
                          </div>
                          {diffLocation && (
                            <span className="rounded bg-amber-500/15 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              changed
                            </span>
                          )}
                        </div>
                        <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">
                          {r.location}
                        </code>
                      </div>
                    )}

                    {(r.error || r.errorDescription || r.errorSubtype) && (
                      <div className="rounded border border-destructive/40 bg-destructive/5 p-2">
                        <div className="flex items-center gap-1.5">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-destructive">
                            Google error
                          </div>
                          {diffError && (
                            <span className="rounded bg-amber-500/15 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              changed
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {r.error && <div><span className="text-muted-foreground">error:</span> {r.error}</div>}
                          {r.errorSubtype && <div><span className="text-muted-foreground">error_subtype:</span> {r.errorSubtype}</div>}
                          {r.errorDescription && <div><span className="text-muted-foreground">error_description:</span> {r.errorDescription}</div>}
                        </div>
                      </div>
                    )}

                    {r.bodySnippet && (
                      <details>
                        <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Response body
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">
{r.bodySnippet}
                        </pre>
                      </details>
                    )}

                    {prev && (diffStatus || diffError || diffLocation) && (
                      <div className="text-[10px] text-muted-foreground">
                        vs previous ({prev.variant}):{" "}
                        {diffStatus && <span>status {prev.status} → {r.status}. </span>}
                        {diffError && <span>error "{prev.error ?? "none"}" → "{r.error ?? "none"}". </span>}
                        {diffLocation && <span>location changed. </span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* YouTube debug panel */}
      <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">YouTube Connect Debug</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shows the exact scopes, redirect URI, full OAuth URL, and probes
              YouTube Data API v3 with your existing Google token.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenYouTubeAuthUrl}
              disabled={openingYouTubeDebug}
            >
              {openingYouTubeDebug ? "Opening…" : "Open YouTube Auth URL"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetchYtDiag()} disabled={ytDiagFetching}>
              {ytDiagFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        {ytDiag && (
          <div className="mt-3 space-y-3 text-xs">
            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">Reuses Google OAuth client?</div>
              <div className="mt-1 text-muted-foreground">
                Yes — same <code className="rounded bg-muted px-1">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
                <code className="rounded bg-muted px-1">GOOGLE_OAUTH_CLIENT_SECRET</code>. A separate consent step is required
                because the existing Google sign-in token has only{" "}
                <code className="rounded bg-muted px-1">openid email profile</code> scopes — YouTube Data API requires
                the YouTube scopes below (incremental auth, same Google account).
              </div>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">Requested YouTube scopes</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {ytDiag.config.scopes.map((s) => (
                  <li key={s}><code className="rounded bg-muted px-1 text-[11px]">{s}</code></li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Redirect URI</div>
                {ytDiag.config.redirectUri && <CopyButton text={ytDiag.config.redirectUri} />}
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">
                {ytDiag.config.redirectUri || "(PUBLIC_APP_URL not set)"}
              </code>
              <p className="mt-1 text-muted-foreground">
                This must be registered under Google Cloud Console → Credentials → OAuth Client → Authorized redirect URIs.
              </p>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Full OAuth authorization URL</div>
                {ytDiag.authUrlPreview && <CopyButton text={ytDiag.authUrlPreview} />}
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">
                {ytDiag.authUrlPreview || "(not built — missing config)"}
              </code>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenYouTubeAuthUrl}
                  disabled={openingYouTubeDebug}
                >
                  {openingYouTubeDebug ? "Opening…" : "Open YouTube Auth URL"}
                </Button>
              </div>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <div>
                  preview uses real signed state?{" "}
                  <Badge variant="secondary" className={ytDiag.config.authUrlUsesRealSignedState ? "border-transparent bg-green-600 text-white" : "bg-amber-500/20 text-amber-700 dark:text-amber-300"}>
                    {ytDiag.config.authUrlUsesRealSignedState ? "yes" : "no"}
                  </Badge>
                </div>
                <div>
                  preview state: <code className="rounded bg-muted px-1 break-all text-[11px]">{ytDiag.config.state || ytDiag.config.stateError || "(not generated)"}</code>
                </div>
                {lastYouTubeStart && (
                  <div>
                    last button state: <code className="rounded bg-muted px-1 break-all text-[11px]">{lastYouTubeStart.state}</code>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">Existing Google connection</div>
              {ytDiag.googleConnection ? (
                <div className="mt-1 space-y-1 text-muted-foreground">
                  <div>account: <span className="text-foreground">{ytDiag.googleConnection.accountName ?? "(unknown)"}</span></div>
                  <div>scope on file: <code className="rounded bg-muted px-1 text-[11px]">{ytDiag.googleConnection.scope ?? "(none)"}</code></div>
                  <div>
                    youtube.readonly granted?{" "}
                    <Badge
                      className={
                        ytDiag.googleConnection.hasYouTubeReadonly
                          ? "border-transparent bg-green-600 text-white"
                          : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      }
                      variant="secondary"
                    >
                      {ytDiag.googleConnection.hasYouTubeReadonly ? "yes" : "no"}
                    </Badge>
                  </div>
                  <div>
                    youtube.upload granted?{" "}
                    <Badge
                      className={
                        ytDiag.googleConnection.hasYouTubeUpload
                          ? "border-transparent bg-green-600 text-white"
                          : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      }
                      variant="secondary"
                    >
                      {ytDiag.googleConnection.hasYouTubeUpload ? "yes" : "no"}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground">No Google connection on file.</p>
              )}
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">YouTube Data API v3 probe</div>
              {!ytDiag.probe.attempted ? (
                <p className="mt-1 text-muted-foreground">Skipped — no usable access token.</p>
              ) : (
                <div className="mt-1 space-y-1 text-muted-foreground">
                  <div>token used: <code className="rounded bg-muted px-1 text-[11px]">{ytDiag.probe.usedToken}</code></div>
                  <div>HTTP status: <code className="rounded bg-muted px-1 text-[11px]">{ytDiag.probe.status}</code></div>
                  {ytDiag.probe.ok && (
                    <div>
                      channel:{" "}
                      <span className="text-foreground">
                        {ytDiag.probe.channelTitle ?? "(no title)"}{" "}
                        {ytDiag.probe.channelId && <code className="ml-1 rounded bg-muted px-1 text-[11px]">{ytDiag.probe.channelId}</code>}
                      </span>
                    </div>
                  )}
                  {ytDiag.probe.error && (
                    <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-foreground">
                      <div><span className="text-muted-foreground">error:</span> {ytDiag.probe.error}</div>
                      {ytDiag.probe.errorReason && (
                        <div><span className="text-muted-foreground">reason:</span> {ytDiag.probe.errorReason}</div>
                      )}
                      {ytDiag.probe.error === "no_channel_on_account" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          The connected Google account has no YouTube channel. Create one at studio.youtube.com, then reconnect.
                        </p>
                      )}
                      {ytDiag.probe.errorReason === "accessNotConfigured" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          YouTube Data API v3 is not enabled on this Google Cloud project. Enable it under APIs &amp; Services → Library → "YouTube Data API v3".
                        </p>
                      )}
                      {(ytDiag.probe.errorReason === "insufficientPermissions" ||
                        ytDiag.probe.errorReason === "forbidden" ||
                        ytDiag.probe.status === 401) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Token lacks YouTube scopes. Click "Connect YouTube" to grant them (incremental consent on the same Google account).
                        </p>
                      )}
                    </div>
                  )}
                  {ytDiag.probe.rawSnippet && (
                    <details>
                      <summary className="cursor-pointer text-[10px] uppercase tracking-wide">Raw response</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">{ytDiag.probe.rawSnippet}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Last callback trace from /api/oauth/youtube/callback */}
            {ytDiag.lastCallback && (
              <div className="mt-4 space-y-2 rounded border border-border/60 bg-background p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Last YouTube callback trace</div>
                  <span className="text-[10px] text-muted-foreground">{ytDiag.lastCallback.at}</span>
                </div>

                <div className="text-xs">
                  <div className="text-muted-foreground">Full callback URL</div>
                  <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">{ytDiag.lastCallback.fullCallbackUrl}</pre>
                </div>


                <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                  <div>
                    reached Google consent:{" "}
                    <span className={`rounded px-1 ${ytDiag.lastCallback.reachedConsent ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                      {ytDiag.lastCallback.reachedConsent ? "yes" : "no (Google rejected before consent)"}
                    </span>
                  </div>
                  <div>
                    authorization code received:{" "}
                    <span className={`rounded px-1 ${ytDiag.lastCallback.receivedCode ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-400"}`}>
                      {ytDiag.lastCallback.receivedCode ? "yes" : "no"}
                    </span>
                  </div>
                  <div>
                    state verified:{" "}
                    <span className="rounded bg-muted px-1">
                      {ytDiag.lastCallback.stateVerified === null ? "n/a" : ytDiag.lastCallback.stateVerified ? "yes" : `no (${ytDiag.lastCallback.stateVerifyError ?? "invalid"})`}
                    </span>
                  </div>
                  <div>
                    token exchange:{" "}
                    <span className={`rounded px-1 ${ytDiag.lastCallback.tokenExchange?.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : ytDiag.lastCallback.tokenExchange?.attempted ? "bg-rose-500/15 text-rose-700 dark:text-rose-400" : "bg-muted"}`}>
                      {!ytDiag.lastCallback.tokenExchange?.attempted
                        ? "not attempted"
                        : ytDiag.lastCallback.tokenExchange.ok
                          ? `success (HTTP ${ytDiag.lastCallback.tokenExchange.httpStatus})`
                          : `failed (HTTP ${ytDiag.lastCallback.tokenExchange.httpStatus})`}
                    </span>
                  </div>
                </div>

                {(ytDiag.lastCallback.oauthError ||
                  ytDiag.lastCallback.oauthErrorDescription ||
                  ytDiag.lastCallback.oauthErrorSubtype) && (
                  <div className="rounded border border-rose-500/40 bg-rose-500/5 p-2 text-xs">
                    <div className="font-medium text-rose-700 dark:text-rose-400">Google OAuth error params</div>
                    {ytDiag.lastCallback.oauthError && (
                      <div><span className="text-muted-foreground">error:</span> <code className="rounded bg-muted px-1">{ytDiag.lastCallback.oauthError}</code></div>
                    )}
                    {ytDiag.lastCallback.oauthErrorDescription && (
                      <div><span className="text-muted-foreground">error_description:</span> {ytDiag.lastCallback.oauthErrorDescription}</div>
                    )}
                    {ytDiag.lastCallback.oauthErrorSubtype && (
                      <div><span className="text-muted-foreground">error_subtype:</span> <code className="rounded bg-muted px-1">{ytDiag.lastCallback.oauthErrorSubtype}</code></div>
                    )}
                    {ytDiag.lastCallback.oauthErrorUri && (
                      <div className="break-all"><span className="text-muted-foreground">error_uri:</span> {ytDiag.lastCallback.oauthErrorUri}</div>
                    )}
                  </div>
                )}

                {ytDiag.lastCallback.tokenExchange && (
                  <div className="text-xs">
                    <div className="font-medium">Token exchange response</div>
                    {ytDiag.lastCallback.tokenExchange.error && (
                      <div className="rounded border border-rose-500/40 bg-rose-500/5 p-2">
                        <div><span className="text-muted-foreground">error:</span> <code className="rounded bg-muted px-1">{ytDiag.lastCallback.tokenExchange.error}</code></div>
                        {ytDiag.lastCallback.tokenExchange.errorDescription && (
                          <div><span className="text-muted-foreground">error_description:</span> {ytDiag.lastCallback.tokenExchange.errorDescription}</div>
                        )}
                        {ytDiag.lastCallback.tokenExchange.errorSubtype && (
                          <div><span className="text-muted-foreground">error_subtype:</span> <code className="rounded bg-muted px-1">{ytDiag.lastCallback.tokenExchange.errorSubtype}</code></div>
                        )}
                      </div>
                    )}
                    {ytDiag.lastCallback.tokenExchange.ok && (
                      <div className="space-y-0.5">
                        <div>access_token: {ytDiag.lastCallback.tokenExchange.hasAccessToken ? "received" : "missing"}</div>
                        <div>refresh_token: {ytDiag.lastCallback.tokenExchange.hasRefreshToken ? "received" : "missing"}</div>
                        <div>granted scope: <code className="rounded bg-muted px-1 break-all">{ytDiag.lastCallback.tokenExchange.grantedScope ?? "(none)"}</code></div>
                        <div>expires_in: {ytDiag.lastCallback.tokenExchange.expiresIn ?? "?"}s</div>
                        <div>token_type: {ytDiag.lastCallback.tokenExchange.tokenType ?? "?"}</div>
                      </div>
                    )}
                    <details className="mt-1" open>
                      <summary className="cursor-pointer text-[10px] uppercase tracking-wide">Token exchange response body (redacted)</summary>
                      <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">{ytDiag.lastCallback.tokenExchange.rawSnippet || "(empty)"}</pre>
                    </details>
                  </div>
                )}

                {ytDiag.lastCallback.channelFetch && (
                  <div className="text-xs">
                    <div className="font-medium">YouTube channel fetch</div>
                    <div>HTTP {ytDiag.lastCallback.channelFetch.httpStatus} {ytDiag.lastCallback.channelFetch.ok ? "ok" : "failed"}</div>
                    {ytDiag.lastCallback.channelFetch.channelTitle && (
                      <div>channel: {ytDiag.lastCallback.channelFetch.channelTitle} <code className="rounded bg-muted px-1">{ytDiag.lastCallback.channelFetch.channelId}</code></div>
                    )}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-wide">Raw channel response</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">{ytDiag.lastCallback.channelFetch.rawSnippet}</pre>
                    </details>
                  </div>
                )}

                {ytDiag.lastCallback.upsertError && (
                  <div className="text-xs"><span className="text-muted-foreground">DB upsert error:</span> {ytDiag.lastCallback.upsertError}</div>
                )}

                <details>
                  <summary className="cursor-pointer text-[10px] uppercase tracking-wide">Full callback query parameters</summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(ytDiag.lastCallback.query, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Facebook / Meta debug panel */}
      <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">Facebook / Meta Connect Debug</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shows the exact authorization URL, redirect URI, scope, state token,
              and any error returned by Facebook on the callback.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchMetaDiag()} disabled={metaDiagFetching}>
            {metaDiagFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {metaDiag && (
          <div className="mt-3 space-y-3 text-xs">
            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">Runtime secrets</div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>
                  META_APP_ID:{" "}
                  <Badge
                    variant="secondary"
                    className={
                      metaDiag.appId
                        ? "border-transparent bg-green-600 text-white"
                        : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    }
                  >
                    {metaDiag.appId ? "present" : "missing"}
                  </Badge>
                  {metaDiag.appId && (
                    <code className="ml-2 rounded bg-muted px-1 text-[11px]">{metaDiag.appId}</code>
                  )}
                </li>
                <li>
                  META_APP_SECRET:{" "}
                  <Badge
                    variant="secondary"
                    className={
                      metaDiag.hasSecret
                        ? "border-transparent bg-green-600 text-white"
                        : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    }
                  >
                    {metaDiag.hasSecret ? "present" : "missing"}
                  </Badge>
                </li>
                <li>
                  PUBLIC_APP_URL:{" "}
                  <Badge
                    variant="secondary"
                    className={
                      metaDiag.publicAppUrlSet
                        ? "border-transparent bg-green-600 text-white"
                        : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    }
                  >
                    {metaDiag.publicAppUrlSet ? "present" : "missing"}
                  </Badge>
                  {metaDiag.publicAppUrl && (
                    <code className="ml-2 rounded bg-muted px-1 text-[11px]">{metaDiag.publicAppUrl}</code>
                  )}
                </li>
              </ul>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">OAuth request parameters</div>
              <div className="mt-1 grid gap-1 text-muted-foreground">
                <div>
                  graph version: <code className="rounded bg-muted px-1 text-[11px]">{metaDiag.graphVersion}</code>
                </div>
                <div>
                  client_id: <code className="rounded bg-muted px-1 text-[11px]">{metaDiag.appId || "(missing)"}</code>
                </div>
                <div>
                  response_type: <code className="rounded bg-muted px-1 text-[11px]">{metaDiag.responseType}</code>
                </div>
              </div>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">Requested scopes</div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">{metaDiag.scope}</code>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {metaDiag.scopes.map((s) => (
                  <li key={s}>
                    <code className="rounded bg-muted px-1 text-[11px]">{s}</code>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Redirect URI</div>
                {metaDiag.redirectUri && <CopyButton text={metaDiag.redirectUri} />}
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">
                {metaDiag.redirectUri || "(PUBLIC_APP_URL not set)"}
              </code>
              <p className="mt-1 text-muted-foreground">
                Add this exact URI under Meta App → Facebook Login → Settings → Valid OAuth Redirect URIs.
              </p>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">State token (freshly signed)</div>
                {metaDiag.state && <CopyButton text={metaDiag.state} />}
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">
                {metaDiag.state || "(not signed — OAUTH_STATE_SECRET missing)"}
              </code>
              <p className="mt-1 text-muted-foreground">
                Payload: <code className="rounded bg-muted px-1">{`{ uid, p: "meta" }`}</code>. Verified server-side on
                callback.
              </p>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Full authorization URL</div>
                {metaDiag.authUrl && <CopyButton text={metaDiag.authUrl} />}
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-[11px]">
                {metaDiag.authUrl || "(not built — missing config)"}
              </code>
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Last callback trace</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetchMetaTrace()}
                  disabled={metaTraceFetching}
                >
                  {metaTraceFetching ? "Refreshing…" : "Refresh trace"}
                </Button>
              </div>
              {metaTrace ? (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <div>at: <code className="rounded bg-muted px-1 text-[11px]">{metaTrace.at}</code></div>
                  <div>code received: <code className="rounded bg-muted px-1 text-[11px]">{metaTrace.receivedCode ? "yes" : "no"}</code></div>
                  <div>state verified: <code className="rounded bg-muted px-1 text-[11px]">{metaTrace.stateVerified === null ? "n/a" : metaTrace.stateVerified ? "yes" : `no (${metaTrace.stateVerifyError ?? "?"})`}</code></div>
                  <div>oauth error: <code className="rounded bg-muted px-1 text-[11px]">{metaTrace.oauthError ?? "(none)"}</code></div>
                  {metaTrace.tokenExchange && (
                    <div>
                      token exchange: <code className="rounded bg-muted px-1 text-[11px]">HTTP {metaTrace.tokenExchange.httpStatus} {metaTrace.tokenExchange.ok ? "ok" : `fail (${metaTrace.tokenExchange.error ?? "?"})`}</code>
                    </div>
                  )}
                  {metaTrace.meFetch && (
                    <div>
                      /me: <code className="rounded bg-muted px-1 text-[11px]">HTTP {metaTrace.meFetch.httpStatus} {metaTrace.meFetch.ok ? `ok — ${metaTrace.meFetch.userName ?? metaTrace.meFetch.userId}` : "fail"}</code>
                    </div>
                  )}
                  {metaTrace.permissionsFetch && (
                    <div>
                      /me/permissions: <code className="rounded bg-muted px-1 text-[11px]">granted=[{metaTrace.permissionsFetch.granted.join(", ") || "none"}] declined=[{metaTrace.permissionsFetch.declined.join(", ") || "none"}]</code>
                    </div>
                  )}
                  {metaTrace.pagesFetch && (
                    <div>
                      /me/accounts: <code className="rounded bg-muted px-1 text-[11px]">HTTP {metaTrace.pagesFetch.httpStatus} {metaTrace.pagesFetch.ok ? `ok — ${metaTrace.pagesFetch.count} page(s)` : "fail"}</code>
                      {metaTrace.pagesFetch.pages.length > 0 && (
                        <ul className="mt-0.5 list-disc pl-5 text-[11px]">
                          {metaTrace.pagesFetch.pages.map((p) => (
                            <li key={p.id}>{p.name ?? p.id} <code className="text-[10px] text-muted-foreground">id={p.id} tasks=[{(p.tasks ?? []).join(",") || "none"}]</code></li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {metaTrace.pageDetails.length > 0 && (
                    <div>
                      page details:
                      <ul className="mt-0.5 list-disc pl-5 text-[11px]">
                        {metaTrace.pageDetails.map((d) => (
                          <li key={d.pageId}>
                            <code className="text-[10px]">id={d.pageId}</code> published={String(d.isPublished)} NPE={String(d.hasTransitionedToNewPageExperience)} owner_business={d.ownerBusiness ? `${d.ownerBusiness.name ?? "?"} (${d.ownerBusiness.id})` : "none"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {metaTrace.businessesFetch && (
                    <div>
                      /me/businesses: <code className="rounded bg-muted px-1 text-[11px]">HTTP {metaTrace.businessesFetch.httpStatus} {metaTrace.businessesFetch.ok ? `ok — ${metaTrace.businessesFetch.count} business(es)` : "fail"}</code>
                      {!metaTrace.businessesFetch.ok && (
                        <details className="mt-1" open>
                          <summary className="cursor-pointer text-[10px] uppercase tracking-wide">Raw /me/businesses error body</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">{metaTrace.businessesFetch.rawSnippet || "(empty)"}</pre>
                        </details>
                      )}
                      {metaTrace.businessesFetch.businesses.length > 0 && (
                        <ul className="mt-0.5 list-disc pl-5 text-[11px]">
                          {metaTrace.businessesFetch.businesses.map((b) => (
                            <li key={b.id}>{b.name ?? b.id} <code className="text-[10px] text-muted-foreground">id={b.id}</code></li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {metaTrace.ownedPagesFetch.length > 0 && (
                    <div>
                      business owned_pages:
                      <ul className="mt-0.5 list-disc pl-5 text-[11px]">
                        {metaTrace.ownedPagesFetch.map((o) => (
                          <li key={o.businessId}>
                            {o.businessName ?? o.businessId}: HTTP {o.httpStatus} {o.ok ? `${o.count} page(s) [${o.pageIds.join(", ") || "none"}]` : "fail"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {metaTrace.upsert && (
                    <div>
                      upsert: <code className="rounded bg-muted px-1 text-[11px]">provider="{metaTrace.upsert.provider}" {metaTrace.upsert.ok ? "ok" : `fail (${metaTrace.upsert.error ?? "?"})`} uid={metaTrace.upsert.userId}</code>
                    </div>
                  )}
                  {metaTrace.finalRedirect && (
                    <div>final redirect: <code className="rounded bg-muted px-1 text-[11px] break-all">{metaTrace.finalRedirect}</code></div>
                  )}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] uppercase tracking-wide">Raw trace JSON</summary>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">
{JSON.stringify(metaTrace, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  No callback trace yet. Click Connect Facebook to record one.
                </p>
              )}
            </div>

            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium">Last callback error from Facebook</div>
              {metaCallbackError ? (
                <div className="mt-1 space-y-1 text-muted-foreground">
                  <div>
                    step: <code className="rounded bg-muted px-1 text-[11px]">{metaCallbackError.step ?? "(none)"}</code>
                  </div>
                  <div>
                    reason: <code className="rounded bg-muted px-1 text-[11px]">{metaCallbackError.reason ?? "(none)"}</code>
                  </div>
                  <div>
                    error: <code className="rounded bg-muted px-1 text-[11px]">{metaCallbackError.errParam ?? "(none)"}</code>
                  </div>
                  <div>
                    error_reason:{" "}
                    <code className="rounded bg-muted px-1 text-[11px]">{metaCallbackError.errReason ?? "(none)"}</code>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-[10px] uppercase tracking-wide">
                      Raw callback query string
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted px-2 py-1 text-[10px] whitespace-pre-wrap break-all">
                      {metaCallbackError.raw}
                    </pre>
                  </details>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setMetaCallbackError(null)}
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  No callback error recorded. Errors from Facebook (e.g. <code className="rounded bg-muted px-1">error</code>,{" "}
                  <code className="rounded bg-muted px-1">error_reason</code>) will appear here after a failed connect.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">

        {SOCIAL_PROVIDERS.map((p) => {
          const conn = connByProvider.get(p.id);
          const isGoogle = p.id === "google_business";
          const facebookConn = connByProvider.get("facebook");
          const selectedPageId = facebookConn?.provider_metadata?.selected_page_id
            ? String(facebookConn.provider_metadata.selected_page_id)
            : "";
          return (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-base">{p.label}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    conn
                      ? conn.last_error
                        ? "border-transparent bg-red-600 text-white hover:bg-red-600/90 dark:bg-red-500 dark:text-white dark:hover:bg-red-500/90"
                        : "border-transparent bg-green-600 text-white hover:bg-green-600/90 dark:bg-green-500 dark:text-white dark:hover:bg-green-500/90"
                      : "border-transparent bg-gray-200 text-gray-700 hover:bg-gray-200/80 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-600/80"
                  }
                >
                  {conn ? (conn.last_error ? "Error" : "Connected") : "Not connected"}
                </Badge>

              </CardHeader>
              <CardContent className="space-y-3">
                {conn ? (
                  <>
                    <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                      <PlatformIcon id={p.id} />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">
                          {conn.account_name ?? conn.account_id ?? "Connected account"}
                        </div>
                        {conn.expires_at && (
                          <div className="mt-0.5 text-muted-foreground">
                            Token expires {new Date(conn.expires_at).toLocaleString()}
                          </div>
                        )}
                        {conn.last_error && (
                          <div className="mt-0.5 text-red-600 dark:text-red-400">
                            {conn.last_error}
                          </div>
                        )}
                        {p.id === "facebook" && selectedPageId && (
                          <div className="mt-0.5 text-muted-foreground">
                            selected_page_id: <code className="rounded bg-background px-1">{selectedPageId}</code>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="bg-red-600 text-white hover:bg-red-600/90 dark:bg-red-500 dark:hover:bg-red-500/90"
                      onClick={() => disconnectMut.mutate(p.id === "google_business" ? "google" : p.id)}
                      disabled={disconnectMut.isPending}
                    >
                      Disconnect
                    </Button>
                    {p.id === "facebook" && (
                      <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs">
                        <Label htmlFor="manual-facebook-page-id">Manual Facebook Page ID</Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            id="manual-facebook-page-id"
                            value={manualPageId}
                            onChange={(e) => setManualPageId(e.target.value)}
                            placeholder={selectedPageId || "Paste Bed Bugs and Beyond Page ID"}
                            inputMode="numeric"
                          />
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => manualPageIdMut.mutate(manualPageId.trim())}
                            disabled={manualPageIdMut.isPending || !manualPageId.trim()}
                          >
                            {manualPageIdMut.isPending ? "Checking…" : "Save Page ID"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Stores as <code className="rounded bg-muted px-1">selected_page_id</code> and calls <code className="rounded bg-muted px-1">/{`{page_id}`}?fields=id,name,instagram_business_account{`{id,username,name}`}</code>.
                        </p>
                        {igDebug && (
                          <details className="rounded border border-border bg-muted/40 p-2 text-[11px]" open>
                            <summary className="cursor-pointer font-medium">Manual Page ID / Instagram discovery raw response</summary>
                            <div className="mt-2 space-y-1">
                              {igDebug.selectedPageId && <div><b>selected_page_id:</b> {igDebug.selectedPageId}</div>}
                              {igDebug.endpoint && <div><b>Endpoint:</b> <code className="break-all">{igDebug.endpoint}</code></div>}
                              {igDebug.httpStatus && <div><b>HTTP:</b> {igDebug.httpStatus} {igDebug.ok ? "OK" : "ERR"}</div>}
                              {(igDebug.pageLookups ?? []).map((l: any, i: number) => (
                                <div key={i} className="mt-2 rounded border border-border/60 p-2">
                                  <div><b>Page:</b> {l.pageName} ({l.pageId})</div>
                                  <div><b>Endpoint:</b> <code className="break-all">{l.endpoint}</code></div>
                                  <div><b>HTTP:</b> {l.httpStatus} {l.ok ? "OK" : "ERR"}</div>
                                  <div><b>instagram_business_account.id:</b> {l.instagramBusinessAccountId ?? "(missing)"}</div>
                                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] opacity-80">{JSON.stringify(l.rawResponse, null, 2)}</pre>
                                </div>
                              ))}
                              {igDebug.rawResponse && (
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] opacity-80">{JSON.stringify(igDebug.rawResponse, null, 2)}</pre>
                              )}
                            </div>
                          </details>
                        )}
                        <div className="mt-3 space-y-2 border-t border-border pt-3">
                          <Label htmlFor="business-portfolio-id">Business Portfolio ID</Label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              id="business-portfolio-id"
                              value={businessPortfolioId}
                              onChange={(e) => setBusinessPortfolioId(e.target.value)}
                              placeholder="e.g. 663731734750534"
                              inputMode="numeric"
                            />
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => bmDiscoverMut.mutate(businessPortfolioId.trim())}
                              disabled={bmDiscoverMut.isPending || !businessPortfolioId.trim()}
                            >
                              {bmDiscoverMut.isPending ? "Looking up…" : "Discover Pages via BM"}
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Calls <code className="rounded bg-muted px-1">/{`{bm_id}`}/owned_pages</code> + <code className="rounded bg-muted px-1">/client_pages</code>. Requires the <code className="rounded bg-muted px-1">business_management</code> permission — reconnect Facebook if it isn't granted.
                          </p>
                          {bmPages.length > 0 && (
                            <div className="rounded border border-border bg-background p-2">
                              <div className="mb-1 font-medium">Pages found in Business Portfolio:</div>
                              <ul className="space-y-1">
                                {bmPages.map((p) => (
                                  <li key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
                                    <span>
                                      <b>{p.name ?? p.id}</b> — <code className="rounded bg-muted px-1">{p.id}</code>
                                      {p.instagram?.username && (
                                        <span className="ml-2 text-muted-foreground">IG: @{p.instagram.username}</span>
                                      )}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setManualPageId(p.id); manualPageIdMut.mutate(p.id); }}
                                      disabled={manualPageIdMut.isPending}
                                    >
                                      Use this Page
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {bmDebug && (
                            <details className="rounded border border-border bg-muted/40 p-2 text-[11px]" open>
                              <summary className="cursor-pointer font-medium">Business Portfolio raw responses</summary>
                              <div className="mt-2 space-y-2">
                                {(["businessInfo", "ownedPages", "clientPages"] as const).map((k) => {
                                  const d = bmDebug[k];
                                  if (!d) return null;
                                  return (
                                    <div key={k} className="rounded border border-border/60 p-2">
                                      <div><b>{k}:</b> <code className="break-all">{d.endpoint}</code></div>
                                      <div><b>HTTP:</b> {d.httpStatus} {d.ok ? "OK" : "ERR"}{d.errorMessage ? ` — ${d.errorMessage}` : ""}{d.errorCode != null ? ` (code ${d.errorCode}${d.errorSubcode ? `/${d.errorSubcode}` : ""})` : ""}</div>
                                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] opacity-80">{typeof d.rawResponse === "string" ? d.rawResponse : JSON.stringify(d.rawResponse, null, 2)}</pre>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : isGoogle ? (
                  <Button
                    size="sm"
                    onClick={handleConnectGoogle}
                    disabled={connecting === p.id}
                  >
                    {connecting === p.id ? "Redirecting…" : "Connect Google"}
                  </Button>
                ) : p.id === "facebook" ? (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      onClick={handleConnectMeta}
                      disabled={connecting === "meta" || !metaConfig?.configured}
                    >
                      {connecting === "meta" ? "Redirecting…" : "Connect Facebook"}
                    </Button>
                    {!metaConfig?.configured && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Meta OAuth not configured. Set META_APP_ID, META_APP_SECRET, and PUBLIC_APP_URL.
                      </p>
                    )}
                  </div>
                ) : p.id === "instagram" ? (
                  <div className="space-y-2">
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px]">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        App Review Required — pages_read_engagement needed
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        Meta requires the <code className="rounded bg-muted px-1">pages_read_engagement</code> permission to discover the
                        Instagram Business account linked to your Facebook Page. This permission is only granted after Meta App Review.
                        {connByProvider.get("facebook")?.provider_metadata?.selected_page_id && (
                          <> Facebook Page ID <code className="rounded bg-muted px-1">{String(connByProvider.get("facebook")?.provider_metadata?.selected_page_id)}</code> is saved and will be used automatically once App Review is approved.</>
                        )}
                      </p>
                      <p className="mt-1.5 text-muted-foreground">
                        <b>Manual mode:</b> until App Review completes, use Instagram’s native app or Meta Business Suite to publish.
                        You can still draft and copy captions from the publishing workflow.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleConnectInstagram}
                      disabled={connectIgMut.isPending || !connByProvider.get("facebook")}
                    >
                      {connectIgMut.isPending ? "Re-checking…" : "Retry discovery"}
                    </Button>
                    {!connByProvider.get("facebook") && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Connect Facebook first — Instagram Business accounts are connected through their linked Facebook Page.
                      </p>
                    )}
                    {igNotice && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">{igNotice}</p>
                    )}

                    {igDebug && (
                      <details className="rounded border border-border bg-muted/40 p-2 text-[11px]">
                        <summary className="cursor-pointer font-medium">Instagram discovery debug</summary>
                        <div className="mt-2 space-y-1">
                          <div><b>/me/accounts HTTP:</b> {String(igDebug.pagesHttpStatus)}</div>
                          <div><b>Page IDs:</b> {(igDebug.pageIds ?? []).join(", ") || "(none)"}</div>
                          <div><b>Page names:</b> {(igDebug.pageNames ?? []).join(", ") || "(none)"}</div>
                          {(igDebug.pageLookups ?? []).map((l: any, i: number) => (
                            <div key={i} className="mt-2 rounded border border-border/60 p-2">
                              <div><b>Page:</b> {l.pageName} ({l.pageId})</div>
                              <div><b>Endpoint:</b> <code className="break-all">{l.endpoint}</code></div>
                              <div><b>HTTP:</b> {l.httpStatus} {l.ok ? "OK" : "ERR"}</div>
                              <div><b>instagram_business_account.id:</b> {l.instagramBusinessAccountId ?? "(missing)"}</div>
                              {l.rawResponse?.error && (
                                <div className="text-destructive">
                                  <b>Meta error:</b> {l.rawResponse.error.message} (code {l.rawResponse.error.code}, sub {l.rawResponse.error.error_subcode ?? "—"}, type {l.rawResponse.error.type ?? "—"})
                                </div>
                              )}
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] opacity-80">{JSON.stringify(l.rawResponse, null, 2)}</pre>
                              {l.igDetailsResponse && (
                                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] opacity-80">IG details ({l.igDetailsHttpStatus}): {JSON.stringify(l.igDetailsResponse, null, 2)}</pre>
                              )}
                            </div>
                          ))}
                          {igDebug.pagesError && (
                            <pre className="mt-2 text-destructive whitespace-pre-wrap break-all">{JSON.stringify(igDebug.pagesError, null, 2)}</pre>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                ) : p.id === "youtube" ? (
                  <Button
                    size="sm"
                    onClick={handleConnectYouTube}
                    disabled={connecting === "youtube"}
                  >
                    {connecting === "youtube" ? "Redirecting…" : "Connect YouTube"}
                  </Button>
                ) : p.id === "tiktok" ? (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      onClick={handleConnectTikTok}
                      disabled={connecting === "tiktok" || !tiktokConfig?.configured}
                    >
                      {connecting === "tiktok" ? "Redirecting…" : "Connect TikTok"}
                    </Button>
                    {!tiktokConfig?.configured && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        TikTok OAuth not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled
                    className="bg-yellow-400 text-black hover:bg-yellow-400/90 disabled:opacity-100 dark:bg-yellow-500 dark:text-black"
                  >
                    Coming Soon
                  </Button>
                )}

              </CardContent>
            </Card>
          );
        })}
      </div>

      {metaPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Select a Facebook Page</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the Page to connect for publishing. If the Page has a
                  linked Instagram Business account, it will be connected too.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelMeta}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {!metaPending && (
                <p className="text-xs text-muted-foreground">Loading pages…</p>
              )}
              {metaPending && metaPending.pages.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No Pages found on your Facebook account. Make sure you're an
                  admin of at least one Page.
                </p>
              )}
              {metaPending?.pages.map((page: { id: string; name: string; hasInstagram: boolean; instagramUsername: string | null }) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => selectPageMut.mutate(page.id)}
                  disabled={selectPageMut.isPending}
                  className="block w-full rounded-md border border-border bg-background p-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <div className="font-medium">{page.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {page.hasInstagram
                      ? `Instagram Business linked: @${page.instagramUsername ?? "(unknown)"}`
                      : "No Instagram Business account linked"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
