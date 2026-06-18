import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ExternalLink, Info, Loader2, LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type SocialConnection = {
  id: string;
  provider: string;
  accountName: string | null;
  accountId: string | null;
  expiresAt: string | null;
  createdAt: string;
};

const PROVIDERS: {
  id: string;
  label: string;
  description: string;
  color: string;
  abbrev: string;
  oauthEnvKey: string;
}[] = [
  {
    id: "google_business",
    label: "Google Business Profile",
    description: "Publish posts and updates to your Google Business listing.",
    color: "bg-blue-500",
    abbrev: "G",
    oauthEnvKey: "GOOGLE_OAUTH_CLIENT_ID",
  },
  {
    id: "facebook",
    label: "Facebook Pages",
    description: "Publish posts directly to your connected Facebook Page.",
    color: "bg-blue-600",
    abbrev: "F",
    oauthEnvKey: "META_APP_ID",
  },
  {
    id: "instagram",
    label: "Instagram Business",
    description: "Publish captions and media to your Instagram Business account.",
    color: "bg-pink-500",
    abbrev: "I",
    oauthEnvKey: "META_APP_ID",
  },
  {
    id: "youtube",
    label: "YouTube",
    description: "Upload Shorts and videos to your YouTube channel.",
    color: "bg-red-600",
    abbrev: "Y",
    oauthEnvKey: "GOOGLE_OAUTH_CLIENT_ID",
  },
  {
    id: "tiktok",
    label: "TikTok Business",
    description: "Publish videos to your TikTok Business account.",
    color: "bg-black",
    abbrev: "T",
    oauthEnvKey: "TIKTOK_CLIENT_KEY",
  },
  {
    id: "linkedin",
    label: "LinkedIn Company Pages",
    description: "Publish updates to your LinkedIn company page.",
    color: "bg-blue-700",
    abbrev: "L",
    oauthEnvKey: "LINKEDIN_CLIENT_ID",
  },
];

export default function ConnectionsPage() {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [oauthResult, setOauthResult] = useState<{ provider: string; status: "success" | "error"; message?: string } | null>(null);

  const { data: connections = [], isLoading } = useQuery<SocialConnection[]>({
    queryKey: ["social_connections"],
    queryFn: () => apiFetch<SocialConnection[]>("/social-connections"),
  });

  const connByProvider = new Map(connections.map((c) => [c.provider, c]));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    const connected = params.get("connected");
    if (!oauth && !connected) return;
    if (oauth === "success" || connected) {
      const provider = params.get("provider") ?? connected ?? "account";
      toast.success(`Connected ${provider}`);
      setOauthResult({ provider, status: "success" });
      qc.invalidateQueries({ queryKey: ["social_connections"] });
    } else if (oauth === "error") {
      const reason = params.get("reason") ?? "unknown";
      const step = params.get("step");
      const msg = step ? `${step}: ${reason}` : reason;
      toast.error(`Connection failed: ${msg}`);
      setOauthResult({ provider: "", status: "error", message: msg });
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [qc]);

  const disconnectMut = useMutation({
    mutationFn: (provider: string) => apiFetch(`/social-connections/${provider}`, { method: "DELETE" }),
    onSuccess: (_, provider) => {
      toast.success(`Disconnected ${provider}`);
      qc.invalidateQueries({ queryKey: ["social_connections"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to disconnect"),
  });

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      const result = await apiFetch<{ url: string; configured: boolean }>(`/social-connections/oauth-start/${provider}`, { method: "POST" });
      if (!result.configured) {
        toast.error(`OAuth not configured. Add the required API credentials to Replit Secrets to enable ${provider} connections.`);
        return;
      }
      const opened = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!opened) toast.error("Popup blocked. Allow popups for this site and try again.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start OAuth");
    } finally {
      setConnecting(null);
    }
  };

  const connectedCount = connections.length;

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">Integrations</div>
          <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Connected Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your social and business profiles to publish content directly.
          </p>
        </div>
        {connectedCount > 0 && (
          <Badge variant="outline" className="mt-1 text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
            {connectedCount} connected
          </Badge>
        )}
      </div>

      {oauthResult?.status === "error" && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-destructive">Connection failed</div>
              <p className="mt-1 text-muted-foreground">
                Callback reported: <code className="rounded bg-muted px-1">{oauthResult.message}</code>
              </p>
            </div>
            <button type="button" onClick={() => setOauthResult(null)} className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          To enable OAuth connections, add your platform API credentials to{" "}
          <strong>Replit Secrets</strong> (lock icon in the sidebar).
          Required keys: <code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>META_APP_ID</code>, <code>TIKTOK_CLIENT_KEY</code>, <code>LINKEDIN_CLIENT_ID</code>.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PROVIDERS.map((p) => {
          const conn = connByProvider.get(p.id);
          const isConnected = !!conn;
          const isThisConnecting = connecting === p.id;
          const isDisconnecting = disconnectMut.isPending && disconnectMut.variables === p.id;

          return (
            <Card key={p.id} className={isConnected ? "border-emerald-200 bg-emerald-50/30" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${p.color}`}>
                    {p.abbrev}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{p.label}</span>
                      {isConnected
                        ? <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">Connected</Badge>
                        : <Badge variant="outline" className="text-[10px] text-muted-foreground">Not connected</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                    {isConnected && conn.accountName && (
                      <p className="mt-1 text-xs text-foreground/80">
                        <span className="font-medium">{conn.accountName}</span>
                        {conn.accountId && <span className="ml-1 text-muted-foreground">({conn.accountId})</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {isConnected ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/30 h-7 px-2 text-xs"
                        onClick={() => disconnectMut.mutate(p.id)}
                        disabled={isDisconnecting}
                      >
                        {isDisconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                        <span className="ml-1">Disconnect</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleConnect(p.id)}
                        disabled={isThisConnecting}
                      >
                        {isThisConnecting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Circle className="mr-1 h-3 w-3" />}
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
