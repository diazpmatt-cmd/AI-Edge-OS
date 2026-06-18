import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Send, FileText, Calendar, CheckCircle2, PenSquare,
  Loader2, Target, Wrench,
} from "lucide-react";
import { fetchArticles } from "@/lib/articles-store";
import type { ArticleDraft } from "@/lib/business-data";

type TabId = "draft" | "scheduled" | "ready" | "published";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "draft", label: "Drafts", icon: <FileText className="h-4 w-4" /> },
  { id: "scheduled", label: "Scheduled", icon: <Calendar className="h-4 w-4" /> },
  { id: "ready", label: "Ready for Website", icon: <Send className="h-4 w-4" /> },
  { id: "published", label: "Published", icon: <CheckCircle2 className="h-4 w-4" /> },
];

function tabFilter(tab: TabId, a: ArticleDraft): boolean {
  if (tab === "ready") return a.status === "ready_for_website";
  if (tab === "published") return a.status === "published" || a.status === "published_error";
  return a.status === tab;
}

export default function PublishingPage() {
  const [articles, setArticles] = useState<ArticleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("scheduled");

  useEffect(() => {
    fetchArticles().then(setArticles).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<TabId, number> = { draft: 0, scheduled: 0, ready: 0, published: 0 };
    for (const a of articles) {
      if (a.status === "draft") c.draft++;
      else if (a.status === "scheduled") c.scheduled++;
      else if (a.status === "ready_for_website") c.ready++;
      else if (a.status === "published" || a.status === "published_error") c.published++;
    }
    return c;
  }, [articles]);

  const filtered = useMemo(() => articles.filter((a) => tabFilter(tab, a)), [articles, tab]);

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft className="mr-1.5 h-4 w-4" /> Dashboard</Link></Button>
      </div>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Content</div>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Publishing Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage drafts, scheduled, and published articles.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "default" : "outline"} size="sm" onClick={() => setTab(t.id)} className="gap-1.5">
            {t.icon} {t.label} <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{counts[t.id]}</span>
          </Button>
        ))}
      </div>

      {loading
        ? <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        : filtered.length === 0
          ? <Card><CardContent className="grid place-items-center gap-2 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10"><Send className="h-6 w-6 text-primary" /></div>
              <p className="font-display text-sm font-semibold">No {tab} articles</p>
              <p className="text-xs text-muted-foreground">Articles in this status will appear here.</p>
            </CardContent></Card>
          : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((a) => (
                <Card key={a.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={a.status} />
                      {a.scheduledFor && <span className="text-xs text-muted-foreground">{new Date(a.scheduledFor).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                    </div>
                    <CardTitle className="text-sm leading-snug line-clamp-2">{a.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-2 pt-0">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Target className="h-3 w-3" /><span className="truncate">{a.keyword}</span></div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Wrench className="h-3 w-3" /><span className="truncate">{a.service}</span></div>
                    {a.publishedUrl && <a href={a.publishedUrl} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline truncate">{a.publishedUrl}</a>}
                  </CardContent>
                  <div className="p-4 pt-0">
                    <Button asChild size="sm" className="w-full" variant="outline">
                      <Link to={`/article/${a.id}`}><PenSquare className="mr-1.5 h-3.5 w-3.5" />{a.body ? "Edit Article" : "Write Article"}</Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
      }
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
  const label = status === "published_error" ? "Error" : status === "ready_for_website" ? "Ready" : status;
  return <Badge variant="outline" className={`text-[10px] capitalize ${map[status] ?? ""}`}>{label}</Badge>;
}
