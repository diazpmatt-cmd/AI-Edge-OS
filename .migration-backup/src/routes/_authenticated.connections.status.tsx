import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  getGoogleOAuthPreflight,
  listConnections,
} from "@/lib/social-connections.functions";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Shield,
  Share2,
  Info,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/connections/status")({
  component: OAuthStatusPage,
  head: () => ({
    meta: [
      { title: "OAuth Status — AI Edge Solutions" },
      { name: "description", content: "Google OAuth configuration status and flow comparison." },
    ],
  }),
});

function StatusBadge({ ok }: { ok?: boolean }) {
  if (ok === true) {
    return (
      <Badge variant="default" className="bg-emerald-600 text-white hover:bg-emerald-700">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        OK
      </Badge>
    );
  }
  if (ok === false) {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <AlertTriangle className="mr-1 h-3 w-3" />
      Unknown
    </Badge>
  );
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Copy to clipboard"
    >
      Copy
    </button>
  );
}

function OAuthStatusPage() {
  const fetchPreflight = useServerFn(getGoogleOAuthPreflight);
  const fetchConnections = useServerFn(listConnections);

  const {
    data: preflight,
    refetch: refetchPreflight,
    isFetching: preflightFetching,
  } = useQuery({
    queryKey: ["google_oauth_preflight"],
    queryFn: () => fetchPreflight(),
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
  });

  const { data: connections = [] } = useQuery({
    queryKey: ["social_connections"],
    queryFn: () => fetchConnections(),
  });

  const googleConn = connections.find((c: any) => c.provider === "google_business");

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/connections"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Connections
        </Link>
        <h1 className="font-display text-2xl font-bold">OAuth Status</h1>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        This page shows the current Google OAuth configuration and explains why
        the app uses two separate Google authentication flows.
      </p>

      {/* Flow Comparison */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary" />
            Why two Google flows?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            The app intentionally uses two separate Google OAuth clients because
            signing in and publishing content require different permissions and
            tokens.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 pr-4 font-medium text-foreground">Aspect</th>
                  <th className="pb-2 pr-4 font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      Sign-in (/auth)
                    </span>
                  </th>
                  <th className="pb-2 font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Share2 className="h-3.5 w-3.5 text-primary" />
                      Publishing (/connections)
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Purpose</td>
                  <td className="py-2.5 pr-4">Authenticate the user</td>
                  <td className="py-2.5">Grant publishing permissions</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Method</td>
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      lovable.auth.signInWithOAuth("google")
                    </code>
                  </td>
                  <td className="py-2.5">
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      /api/oauth/google/*
                    </code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Client</td>
                  <td className="py-2.5 pr-4">Lovable-managed</td>
                  <td className="py-2.5">Your own Google Cloud OAuth client</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Scopes</td>
                  <td className="py-2.5 pr-4">openid, email, profile</td>
                  <td className="py-2.5">OpenID + Business Profile scopes</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Access type</td>
                  <td className="py-2.5 pr-4">online</td>
                  <td className="py-2.5">offline (with refresh_token)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Callback URL</td>
                  <td className="py-2.5 pr-4">Handled by Lovable broker</td>
                  <td className="py-2.5">
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      /api/oauth/google/callback
                    </code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium text-foreground">Session</td>
                  <td className="py-2.5 pr-4">Supabase auth session</td>
                  <td className="py-2.5">Row in social_connections table</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-foreground">Token storage</td>
                  <td className="py-2.5 pr-4">Managed by Lovable (not exposed)</td>
                  <td className="py-2.5">Stored in your database (refresh_token kept)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Preflight Result */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              Google OAuth Preflight
              <StatusBadge ok={preflight?.ok} />
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchPreflight()}
              disabled={preflightFetching}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${preflightFetching ? "animate-spin" : ""}`} />
              {preflightFetching ? "Checking…" : "Retry"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {preflight ? (
              <>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {preflight.ok ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-600">
                          Google accepts the redirect_uri
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-sm font-medium text-destructive">
                          {preflight.reason === "redirect_uri_mismatch"
                            ? "redirect_uri not authorized"
                            : preflight.reason === "invalid_client"
                              ? "client_id not recognized"
                              : "Preflight failed"}
                        </span>
                      </>
                    )}
                  </div>
                  {preflight.ok === false && preflight.detail && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{preflight.detail}</p>
                  )}
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      HTTP status from Google
                    </div>
                  </div>
                  <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-xs">
                    {preflight.status}
                  </code>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      redirect_uri
                    </div>
                    {preflight.redirectUri && <CopyButton text={preflight.redirectUri} />}
                  </div>
                  <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-xs">
                    {preflight.redirectUri || "(not configured)"}
                  </code>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      client_id
                    </div>
                    {preflight.clientId && <CopyButton text={preflight.clientId} />}
                  </div>
                  <code className="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-xs">
                    {preflight.clientId || "(not configured)"}
                  </code>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                {preflightFetching ? "Running preflight check…" : "No preflight data yet."}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publishing Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {googleConn ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-600">
                    Google Business account connected
                  </span>
                </div>

                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Account
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {googleConn.account_name ?? googleConn.account_id ?? "Unknown account"}
                  </div>
                </div>

                {googleConn.expires_at && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Access token expires
                    </div>
                    <div className="mt-1 text-sm text-foreground">
                      {new Date(googleConn.expires_at).toLocaleString()}
                    </div>
                  </div>
                )}

                {googleConn.last_verified_at && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Last verified
                    </div>
                    <div className="mt-1 text-sm text-foreground">
                      {new Date(googleConn.last_verified_at).toLocaleString()}
                    </div>
                  </div>
                )}

                {googleConn.last_error && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <div className="text-xs font-medium text-destructive">Last error</div>
                    <div className="mt-1 text-xs text-muted-foreground">{googleConn.last_error}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-5 w-5" />
                <span className="text-sm">No Google publishing account connected.</span>
              </div>
            )}

            <Separator />

            <div className="flex items-center gap-2">
              <Link
                to="/connections"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Manage connections
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
