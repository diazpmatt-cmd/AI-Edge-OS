import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Building2, Globe, MapPin, Users, Wrench, TrendingUp, Calendar, FileText,
  Target, PenSquare, Sparkles, BarChart3, CheckCircle2, Loader2, RefreshCw, Send,
} from "lucide-react";
import { loadProfile, type Keyword, type ArticleDraft } from "@/lib/business-data";
import { fetchKeywords, insertKeywords, clearKeywords } from "@/lib/keywords-store";
import { fetchArticles, insertArticles, clearArticles, buildContentPlan } from "@/lib/articles-store";
import { generateKeywordIdeas } from "@/lib/keywords.functions";
import { toast } from "sonner";

export default function DashboardPage() {
  const profile = useMemo(() => loadProfile(), []);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [articles, setArticles] = useState<ArticleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "keywords" | "plan">(null);

  const reload = async () => {
    const [kw, ar] = await Promise.all([fetchKeywords(), fetchArticles()]);
    setKeywords(kw); setArticles(ar);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [kw, ar] = await Promise.all([fetchKeywords(), fetchArticles()]);
        if (cancelled) return;
        setKeywords(kw); setArticles(ar);
      } catch { } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGenerateKeywords = async () => {
    setBusy("keywords");
    try {
      const { keywords: generated } = await generateKeywordIdeas({
        businessName: profile.businessName, industry: profile.industry,
        city: profile.city, state: profile.state,
        mainServices: profile.mainServices, targetCustomers: profile.targetCustomers,
      });
      await clearKeywords(); await clearArticles();
      const inserted = await insertKeywords(generated.map((k) => ({ ...k, city: profile.city, state: profile.state })));
      setKeywords(inserted); setArticles([]);
      toast.success(`Generated ${inserted.length} keywords`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate keywords");
    } finally { setBusy(null); }
  };

  const handleGenerateContentPlan = async () => {
    setBusy("plan");
    try {
      const plan = buildContentPlan(keywords, profile);
      await clearArticles();
      await insertArticles(plan);
      await reload();
      toast.success(`Created ${plan.length} scheduled articles`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create plan");
    } finally { setBusy(null); }
  };

  const counts = useMemo(() => {
    const c = { draft: 0, scheduled: 0, ready_for_website: 0, published: 0, published_error: 0 } as Record<string, number>;
    for (const a of articles) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [articles]);

  const total = articles.length;
  const progress = total ? Math.round(((counts.published ?? 0) / total) * 100) : 0;

  if (loading) return <AppShell><div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div></AppShell>;

  return (
    <AppShell>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">SEO Autopilot</div>
          <h1 className="mt-1 truncate text-2xl font-bold text-foreground sm:text-3xl">Welcome back, {profile.businessName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{profile.industry} · {profile.city}, {profile.state}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/admin/publishing"><Send className="mr-1.5 h-4 w-4" /> Publishing Center</Link></Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Keywords" value={keywords.length.toString()} trend={keywords.length ? "AI generated" : "None yet"} />
        <Stat icon={<Calendar className="h-4 w-4" />} label="Articles Planned" value={total.toString()} trend={`${counts.scheduled ?? 0} scheduled`} />
        <Stat icon={<FileText className="h-4 w-4" />} label="Drafts" value={(counts.draft ?? 0).toString()} trend="In progress" />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Published" value={(counts.published ?? 0).toString()} trend={total ? `${progress}% of plan` : "—"} />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-primary" /> Business Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info icon={<Globe className="h-4 w-4" />} label="Website"><a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{profile.websiteUrl.replace(/^https?:\/\//, "")}</a></Info>
          <Info icon={<Wrench className="h-4 w-4" />} label="Industry">{profile.industry}</Info>
          <Info icon={<MapPin className="h-4 w-4" />} label="Location">{profile.city}, {profile.state}</Info>
          <Info icon={<Wrench className="h-4 w-4" />} label="Main Services" className="lg:col-span-2">{profile.mainServices}</Info>
          <Info icon={<Users className="h-4 w-4" />} label="Target Customers">{profile.targetCustomers}</Info>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><Target className="h-5 w-5 text-primary" /> SEO Keyword Ideas</CardTitle>
              <CardDescription>Generated from your services for {profile.city}, {profile.state}</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={handleGenerateKeywords} disabled={busy === "keywords"}>
              {busy === "keywords" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…</> : <><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {keywords.length ? "Regenerate" : "Generate Keywords"}</>}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {keywords.length === 0
              ? <EmptyHint icon={<Sparkles className="h-6 w-6 text-primary" />} title="No keywords yet" body='Click "Generate Keywords" to create SEO targets.' />
              : <div className="divide-y divide-border">
                  {keywords.map((k) => (
                    <div key={k.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-3 sm:grid-cols-[minmax(0,1fr)_120px_90px_110px_90px]">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{k.keyword}</div>
                        <div className="truncate text-xs text-muted-foreground sm:hidden">{k.service} · Vol {k.volume.toLocaleString()} · {k.difficulty}</div>
                        <div className="hidden truncate text-xs text-muted-foreground sm:block">{k.service}</div>
                      </div>
                      <div className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{k.volume.toLocaleString()}</div>
                      <div className="hidden sm:block"><DifficultyBadge level={k.difficulty} /></div>
                      <div className="hidden text-right sm:block"><Badge variant="outline" className="text-[10px]">{k.intent}</Badge></div>
                      <div />
                    </div>
                  ))}
                </div>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" /> Progress</CardTitle>
            <CardDescription>Live content status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ProgressRow label="Published" value={progress} sub={`${counts.published ?? 0}/${total || 0}`} />
            <ProgressRow label="Scheduled" value={total ? Math.round(((counts.scheduled ?? 0) / total) * 100) : 0} sub={`${counts.scheduled ?? 0}/${total || 0}`} />
            <ProgressRow label="Drafts" value={total ? Math.round(((counts.draft ?? 0) / total) * 100) : 0} sub={`${counts.draft ?? 0}/${total || 0}`} />
            <ProgressRow label="Keywords Targeted" value={keywords.length ? 100 : 0} sub={`${keywords.length} keywords`} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5 text-primary" /> 30-Day Article Calendar</CardTitle>
            <CardDescription>Scheduled content for your top keywords</CardDescription>
          </div>
          {keywords.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleGenerateContentPlan} disabled={busy === "plan"}>
              {busy === "plan" ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Building…</> : <><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {articles.length ? "Rebuild Plan" : "Build Content Plan"}</>}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {articles.length === 0
            ? <EmptyHint icon={<Calendar className="h-6 w-6 text-primary" />} title={keywords.length ? "No articles scheduled" : "Generate keywords first"} body={keywords.length ? `Click "Build Content Plan" to create 12 scheduled articles.` : "Once you have keywords, you can build a 30-day content plan."} />
            : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {articles.map((a) => (
                  <div key={a.id} className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md">
                    <div className="flex items-center justify-between text-xs">
                      <StatusBadge status={a.status} />
                      <span className="text-muted-foreground">{a.scheduledFor ? new Date(a.scheduledFor).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</span>
                    </div>
                    <h3 className="mt-3 font-display text-base font-semibold leading-snug text-foreground line-clamp-2">{a.title}</h3>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="h-3 w-3" /><span className="truncate">{a.keyword}</span></div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Wrench className="h-3 w-3" /><span className="truncate">{a.service}</span></div>
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5" />{a.body ? `${a.body.split(/\s+/).length} words` : "Not written"}</span>
                      <Button asChild size="sm" variant={a.status === "published" ? "outline" : "default"}>
                        <Link to={`/admin/article/${a.id}`}><PenSquare className="mr-1.5 h-3.5 w-3.5" />{a.body ? "Edit" : "Write Article"}</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Stat({ icon, label, value, trend }: { icon: React.ReactNode; label: string; value: string; trend: string }) {
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{trend}</div>
    </CardContent></Card>
  );
}
function Info({ icon, label, children, className = "" }: { icon: React.ReactNode; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon} {label}</div>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}
function ProgressRow({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{sub}</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}
function DifficultyBadge({ level }: { level: string }) {
  const cls = level === "Low" ? "bg-success/15 text-success border-success/20" : level === "Medium" ? "bg-warning/15 text-warning border-warning/20" : "bg-destructive/15 text-destructive border-destructive/20";
  return <Badge variant="outline" className={`text-[10px] ${cls}`}>{level}</Badge>;
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
function EmptyHint({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10">{icon}</div>
      <div className="font-display text-sm font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
