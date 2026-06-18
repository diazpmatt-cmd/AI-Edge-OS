import { Link, useParams, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, Target, Wrench, FileText, Copy, Check, Loader2, Wand2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { loadProfile, type ArticleDraft } from "@/lib/business-data";
import { fetchArticleDraft, upsertArticleDraft } from "@/lib/articles-store";
import { generateArticleContent } from "@/lib/articles.functions";
import { generateArticleAssets } from "@/lib/article-assets.functions";
import { upsertArticleAssets, fetchArticleAssets, type ArticleAsset } from "@/lib/article-assets-store";
import { ARTICLE_CHANNELS } from "@/lib/article-channels";
import { toast } from "sonner";

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const profile = useMemo(() => loadProfile(), []);
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [assets, setAssets] = useState<ArticleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingAssets, setGeneratingAssets] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [existing, existingAssets] = await Promise.all([fetchArticleDraft(id), fetchArticleAssets(id).catch(() => [])]);
        if (cancelled) return;
        if (existing) { setDraft(existing); setAssets(existingAssets); }
        else setNotFound(true);
      } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to load"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => {
      upsertArticleDraft(draft).catch((err) => toast.error(err instanceof Error ? err.message : "Failed to save"));
    }, 800);
    return () => clearTimeout(t);
  }, [draft]);

  const handleGenerate = async () => {
    if (!draft) return;
    setGenerating(true);
    try {
      const { body } = await generateArticleContent({
        title: draft.title, keyword: draft.keyword, service: draft.service,
        businessName: profile.businessName, industry: profile.industry,
        city: profile.city, state: profile.state,
        mainServices: profile.mainServices, targetCustomers: profile.targetCustomers,
      });
      const updated: ArticleDraft = { ...draft, body, status: "draft", generatedAt: new Date().toISOString() };
      await upsertArticleDraft(updated);
      setDraft(updated);
      toast.success("Article generated!");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to generate"); }
    finally { setGenerating(false); }
  };

  const handleGenerateAssets = async () => {
    if (!draft || !id) return;
    setGeneratingAssets(true);
    try {
      const { assets: generated } = await generateArticleAssets({
        title: draft.title, keyword: draft.keyword, service: draft.service,
        businessName: profile.businessName, city: profile.city, state: profile.state,
        body: draft.body,
      });
      const saved = await upsertArticleAssets(id, generated);
      setAssets(saved);
      toast.success(`Generated ${saved.length} social assets`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to generate assets"); }
    finally { setGeneratingAssets(false); }
  };

  const copyBody = () => {
    if (draft?.body) { navigator.clipboard.writeText(draft.body); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (loading) return <AppShell><div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;
  if (notFound || !draft) return <AppShell><div className="text-center py-20"><p className="text-muted-foreground">Article not found.</p><Button asChild className="mt-4" variant="outline"><Link to="/dashboard">← Back</Link></Button></div></AppShell>;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft className="mr-1.5 h-4 w-4" /> Dashboard</Link></Button>
        <Button asChild variant="ghost" size="sm"><Link to="/publishing"><FileText className="mr-1.5 h-4 w-4" /> Publishing Center</Link></Button>
      </div>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">{draft.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Target className="h-3 w-3" />{draft.keyword}</span>
          <span className="flex items-center gap-1"><Wrench className="h-3 w-3" />{draft.service}</span>
          <StatusBadge status={draft.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Article Content</CardTitle>
              <div className="flex gap-2">
                {draft.body && <Button size="sm" variant="outline" onClick={copyBody}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>}
                <Button size="sm" onClick={handleGenerate} disabled={generating}>
                  {generating ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Wand2 className="mr-1.5 h-3.5 w-3.5" />{draft.body ? "Regenerate" : "Generate Article"}</>}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {draft.body
                ? <Textarea value={draft.body} onChange={(e) => setDraft((d) => d ? { ...d, body: e.target.value } : d)} rows={30} className="font-mono text-xs" />
                : <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
                    <Sparkles className="h-8 w-8 text-primary" />
                    <p className="text-sm font-semibold text-foreground">No content yet</p>
                    <p className="text-xs text-muted-foreground">Click "Generate Article" to create AI-written content for this keyword.</p>
                  </div>
              }
            </CardContent>
          </Card>

          {draft.body && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Social Assets</CardTitle>
                  <CardDescription>Channel-ready posts for each platform</CardDescription>
                </div>
                <Button size="sm" onClick={handleGenerateAssets} disabled={generatingAssets}>
                  {generatingAssets ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />{assets.length ? "Regenerate" : "Generate Assets"}</>}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {assets.length === 0
                  ? <p className="text-sm text-muted-foreground">No social assets yet. Click "Generate Assets" to create them.</p>
                  : assets.map((a) => {
                      const ch = ARTICLE_CHANNELS.find((c) => c.id === a.channel);
                      return (
                        <div key={a.id} className="rounded-lg border border-border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">{ch?.label ?? a.channel}</span>
                            <span className="text-xs text-muted-foreground">{ch?.hint}</span>
                          </div>
                          <pre className="whitespace-pre-wrap text-xs text-foreground">{a.body}</pre>
                        </div>
                      );
                    })
                }
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">SEO Meta</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Meta Title</div>
                <p className="text-foreground">{draft.metaTitle || "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{(draft.metaTitle ?? "").length}/60</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Meta Description</div>
                <p className="text-foreground">{draft.metaDescription || "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{(draft.metaDescription ?? "").length}/160</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Slug</div>
                <p className="font-mono text-xs text-foreground">{draft.slug}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Publishing</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={draft.status} /></div>
              {draft.scheduledFor && <div className="flex justify-between"><span className="text-muted-foreground">Scheduled</span><span className="text-foreground">{new Date(draft.scheduledFor).toLocaleDateString()}</span></div>}
              {draft.publishedAt && <div className="flex justify-between"><span className="text-muted-foreground">Published</span><span className="text-foreground">{new Date(draft.publishedAt).toLocaleDateString()}</span></div>}
              {draft.generatedAt && <div className="flex justify-between"><span className="text-muted-foreground">Generated</span><span className="text-foreground">{new Date(draft.generatedAt).toLocaleDateString()}</span></div>}
              {draft.body && draft.status === "draft" && (
                <Button size="sm" className="w-full mt-2" variant="outline" onClick={() => { setDraft((d) => d ? { ...d, status: "ready_for_website" } : d); }}>Mark Ready for Website</Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: "bg-success/15 text-success border-success/20",
    published_error: "bg-destructive/15 text-destructive border-destructive/20",
    ready_for_website: "bg-amber-500/15 text-amber-600 border-amber-500/20",
    scheduled: "bg-primary/15 text-primary border-primary/20",
    draft: "bg-muted text-muted-foreground border-border",
  };
  const label = status === "published_error" ? "Publish error" : status === "ready_for_website" ? "Ready" : status;
  return <Badge variant="outline" className={`text-[10px] capitalize ${map[status] ?? ""}`}>{label}</Badge>;
}
