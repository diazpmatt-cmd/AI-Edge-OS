import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import {
  fetchPackage,
  fetchAssets,
  updateAsset,
  type ContentAsset,
} from "@/lib/content-packages";
import { CHANNELS, channelLabel, type AssetStatus } from "@/lib/content-channels";
import { toast } from "sonner";

export const Route = createFileRoute("/repurpose/$id")({
  head: () => ({
    meta: [{ title: "Content Package · AI Edge Solutions" }],
  }),
  component: PackageDetailPage,
});

function PackageDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: pkg } = useQuery({ queryKey: ["content_package", id], queryFn: () => fetchPackage(id) });
  const { data: assets = [] } = useQuery({
    queryKey: ["content_assets", id],
    queryFn: () => fetchAssets(id),
  });

  const sorted = [...assets].sort(
    (a, b) =>
      CHANNELS.findIndex((c) => c.id === a.channel) - CHANNELS.findIndex((c) => c.id === b.channel),
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["content_assets", id] });

  if (!pkg) {
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link to="/repurpose" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to packages
        </Link>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{pkg.title || pkg.keyword}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pkg.businessName} · {pkg.service} · {pkg.city}{pkg.state ? `, ${pkg.state}` : ""}
          </p>
        </div>

        <div className="grid gap-4">
          {sorted.map((a) => (
            <AssetCard key={a.id} asset={a} onChange={invalidate} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function AssetCard({ asset, onChange }: { asset: ContentAsset; onChange: () => void }) {
  const [body, setBody] = useState(asset.body);
  const [url, setUrl] = useState(asset.publishedUrl ?? "");

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateAsset>[1]) => updateAsset(asset.id, patch),
    onSuccess: () => onChange(),
  });

  const setStatus = (status: AssetStatus) => {
    if (status === "published" && !url.trim()) {
      toast.error("Paste the live URL before marking Published");
      return;
    }
    save.mutate({ status, ...(status === "published" ? { publishedUrl: url } : {}) });
    toast.success(`Marked ${status}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{channelLabel(asset.channel)}</CardTitle>
        <StatusBadge status={asset.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => body !== asset.body && save.mutate({ body })}
          rows={Math.min(12, Math.max(4, body.split("\n").length))}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(body);
              toast.success("Copied");
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStatus("draft")} disabled={asset.status === "draft"}>
            Draft
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStatus("ready")} disabled={asset.status === "ready"}>
            Mark Ready
          </Button>
          <Button size="sm" onClick={() => setStatus("published")} disabled={asset.status === "published"}>
            Mark Published
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Live URL (required to mark Published)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => url !== (asset.publishedUrl ?? "") && save.mutate({ publishedUrl: url })}
          />
          {asset.publishedUrl ? (
            <Button asChild variant="outline" size="icon">
              <a href={asset.publishedUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const map = {
    draft: "bg-muted text-muted-foreground",
    ready: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
    published: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  } as const;
  return <Badge className={map[status]}>{status}</Badge>;
}
