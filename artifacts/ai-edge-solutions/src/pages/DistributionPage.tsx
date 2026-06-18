import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Copy, ExternalLink, Loader2, Radio, RefreshCw, AlertTriangle, Sparkles } from "lucide-react";
import { fetchAllArticleAssets, fetchArticleAssets, updateArticleAsset, upsertArticleAssets, type ArticleAsset } from "@/lib/article-assets-store";
import { ARTICLE_CHANNELS, articleChannelLabel, type ArticleAssetStatus } from "@/lib/article-channels";
import { apiFetch } from "@/lib/api";
import { loadProfile } from "@/lib/business-data";
import { toast } from "sonner";
import { fetchArticles } from "@/lib/articles-store";


export default function DistributionPage() {
  const { data: articles = [] } = useQuery({ queryKey: ["articles"], queryFn: fetchArticles });
  const { data: allAssets = [] } = useQuery({ queryKey: ["article_assets_all"], queryFn: fetchAllArticleAssets });
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = ARTICLE_CHANNELS.map((c) => {
    const items = allAssets.filter((a) => a.channel === c.id);
    return {
      id: c.id, label: c.label, hint: c.hint, futureApi: c.futureApi,
      total: items.length,
      draft: items.filter((a) => a.status === "draft").length,
      ready: items.filter((a) => a.status === "ready").length,
      published: items.filter((a) => a.status === "published").length,
      failed: items.filter((a) => a.status === "failed").length,
    };
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Radio className="h-3.5 w-3.5" /> Distribution Center
          </div>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Multi-channel content for every article</h1>
          <p className="mt-2 text-muted-foreground">
            Each published article becomes a Google Business post, Facebook post, Instagram caption, LinkedIn post, and YouTube Short script.
            Copy and paste them manually — direct API publishing is on the roadmap.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {totals.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
                <div className="mt-1 text-2xl font-bold">
                  {c.published}
                  <span className="text-sm text-muted-foreground">/{c.total}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                  <span className="rounded bg-muted px-1.5 py-0.5">D {c.draft}</span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">R {c.ready}</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">P {c.published}</span>
                  {c.failed > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-900">F {c.failed}</span>}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">{c.futureApi} (coming soon)</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Articles</h2>
          {articles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No articles yet. Create one from the Dashboard.</p>
          ) : (
            <div className="grid gap-3">
              {articles.map((art) => {
                const count = allAssets.filter((a) => a.articleId === art.id).length;
                return (
                  <Card key={art.id}>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                      <div>
                        <CardTitle className="text-base">{art.title || art.keyword}</CardTitle>
                        <CardDescription>
                          {art.keyword} · {art.service} · {count}/{ARTICLE_CHANNELS.length} channels
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpanded(expanded === art.id ? null : art.id)}
                      >
                        {expanded === art.id ? "Hide" : "Open"}
                      </Button>
                    </CardHeader>
                    {expanded === art.id && (
                      <CardContent>
                        <ArticleAssetsPanel article={art} />
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ArticleAssetsPanel({ article }: { article: any }) {
  const qc = useQueryClient();
  const profile = loadProfile();
  const [busy, setBusy] = useState(false);

  const { data: assets = [] } = useQuery({
    queryKey: ["article_assets", article.id],
    queryFn: () => fetchArticleAssets(article.id),
  });

  const sorted = ARTICLE_CHANNELS.map((c) => assets.find((a) => a.channel === c.id));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["article_assets", article.id] });
    qc.invalidateQueries({ queryKey: ["article_assets_all"] });
  };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const result = await apiFetch<{ assets: any[] }>("/ai/article-assets", {
        method: "POST",
        body: JSON.stringify({
          title: article.title,
          keyword: article.keyword,
          service: article.service,
          businessName: profile.businessName,
          city: profile.city,
          state: profile.state,
          body: article.body,
        }),
      });
      await upsertArticleAssets(article.id, result.assets.map((a: any) => ({
        channel: a.channel, body: a.body, status: a.status, errorMessage: a.errorMessage,
      })));
      invalidate();
      toast.success("Distribution assets generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {assets.length === 0 ? "No assets yet." : `${assets.length} of ${ARTICLE_CHANNELS.length} channels.`}
        </p>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={busy || !article.body}>
          {busy
            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…</>
            : assets.length === 0
              ? <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Generate all assets</>
              : <><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate</>}
        </Button>
      </div>
      {!article.body && (
        <p className="text-xs text-amber-700">Write the article body first, then generate distribution assets.</p>
      )}
      {sorted.map((a, i) => {
        const channel = ARTICLE_CHANNELS[i];
        if (!a) {
          return (
            <div key={channel.id} className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              {channel.label} — not generated yet
            </div>
          );
        }
        return <AssetEditor key={a.id} asset={a} onChange={invalidate} />;
      })}
    </div>
  );
}

function AssetEditor({ asset, onChange }: { asset: ArticleAsset; onChange: () => void }) {
  const [body, setBody] = useState(asset.body);
  const [url, setUrl] = useState(asset.publishedUrl ?? "");

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateArticleAsset>[1]) => updateArticleAsset(asset.id, patch),
    onSuccess: () => onChange(),
  });

  const setStatus = (status: ArticleAssetStatus) => {
    if (status === "published" && !url.trim()) {
      toast.error("Paste the live URL before marking Published");
      return;
    }
    save.mutate({ status, ...(status === "published" ? { publishedUrl: url } : {}) });
    toast.success(`Marked ${status}`);
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{articleChannelLabel(asset.channel)}</div>
        <StatusBadge status={asset.status as ArticleAssetStatus} />
      </div>
      {asset.status === "failed" && asset.errorMessage && (
        <div className="flex items-start gap-1.5 rounded bg-red-50 p-2 text-xs text-red-900">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {asset.errorMessage}
        </div>
      )}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => body !== asset.body && save.mutate({ body })}
        rows={Math.min(10, Math.max(4, body.split("\n").length))}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => { navigator.clipboard.writeText(body); toast.success("Copied"); }}
          disabled={!body}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStatus("draft")} disabled={asset.status === "draft"}>Draft</Button>
        <Button size="sm" variant="outline" onClick={() => setStatus("ready")} disabled={asset.status === "ready"}>Mark Ready</Button>
        <Button size="sm" onClick={() => setStatus("published")} disabled={asset.status === "published"}>Mark Published</Button>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Live URL (required to mark Published)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url !== (asset.publishedUrl ?? "") && save.mutate({ publishedUrl: url })}
        />
        {asset.publishedUrl && (
          <Button asChild variant="outline" size="icon">
            <a href={asset.publishedUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ArticleAssetStatus }) {
  const map: Record<ArticleAssetStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    ready: "bg-amber-100 text-amber-900",
    published: "bg-emerald-100 text-emerald-900",
    failed: "bg-red-100 text-red-900",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}
