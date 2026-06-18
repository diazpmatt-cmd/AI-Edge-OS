import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Send, FileText, Calendar, CheckCircle2, ExternalLink,
  PenSquare, Loader2, Target, Wrench, Wand2, AlertTriangle, ShieldCheck,
  ShieldAlert, RefreshCw,
} from "lucide-react";
import { fetchArticles, upsertArticleDraft } from "@/lib/articles-store";
import { loadProfile, domainMatches, rewriteUrlDomain, extractDomain } from "@/lib/business-data";
import type { ArticleDraft } from "@/lib/business-data";
import { checkPublishedUrl } from "@/lib/url-check.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/publishing")({
  head: () => ({
    meta: [
      { title: "Publishing Center · AI Edge Solutions" },
      { name: "description", content: "Manage drafts, scheduled, and published articles." },
    ],
  }),
  component: PublishingCenter,
});

type TabId = "draft" | "scheduled" | "ready" | "published" | "needs_fix" | "verified";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "draft", label: "Drafts", icon: <FileText className="h-4 w-4" /> },
  { id: "scheduled", label: "Scheduled", icon: <Calendar className="h-4 w-4" /> },
  { id: "ready", label: "Ready for Website", icon: <Send className="h-4 w-4" /> },
  { id: "needs_fix", label: "Needs URL Fix", icon: <ShieldAlert className="h-4 w-4" /> },
  { id: "verified", label: "Verified Live", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "published", label: "All Published", icon: <CheckCircle2 className="h-4 w-4" /> },
];

function isPublishedish(a: ArticleDraft): boolean {
  return a.status === "published" || a.status === "published_error";
}

function needsUrlFix(a: ArticleDraft): boolean {
  if (!isPublishedish(a)) return false;
  if (a.status === "published_error") return true;
  if (!a.publishedUrl) return true;
  if (a.lastStatusCode != null && (a.lastStatusCode === 404 || a.lastStatusCode === 410)) return true;
  if (a.lastStatusCode != null && a.lastStatusCode >= 400) return true;
  return false;
}

function isVerified(a: ArticleDraft): boolean {
  return isPublishedish(a) && !!a.verifiedLiveAt && a.lastStatusCode === 200;
}

function PublishingCenter() {
  const profile = useMemo(() => loadProfile(), []);
  const [articles, setArticles] = useState<ArticleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("draft");
  const [fixing, setFixing] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const checkUrl = useServerFn(checkPublishedUrl);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchArticles();
        if (!cancelled) setArticles(list);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load articles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const g: Record<TabId, ArticleDraft[]> = {
      draft: [], scheduled: [], ready: [], published: [], needs_fix: [], verified: [],
    };
    for (const a of articles) {
      if (a.status === "draft") g.draft.push(a);
      else if (a.status === "scheduled") g.scheduled.push(a);
      else if (a.status === "ready_for_website") g.ready.push(a);
      else if (isPublishedish(a)) {
        g.published.push(a);
        if (isVerified(a)) g.verified.push(a);
        else if (needsUrlFix(a)) g.needs_fix.push(a);
      }
    }
    return g;
  }, [articles]);

  const mismatched = useMemo(
    () =>
      articles.filter(
        (a) => a.publishedUrl && profile.websiteUrl && !domainMatches(a.publishedUrl, profile.websiteUrl),
      ),
    [articles, profile.websiteUrl],
  );

  const fixAllDomains = async () => {
    if (!mismatched.length) return;
    setFixing(true);
    try {
      const updated = await Promise.all(
        mismatched.map(async (a) => {
          const next = { ...a, publishedUrl: rewriteUrlDomain(a.publishedUrl!, profile.websiteUrl) };
          await upsertArticleDraft(next);
          return next;
        }),
      );
      const byId = new Map(updated.map((u) => [u.id, u]));
      setArticles((prev) => prev.map((a) => byId.get(a.id) ?? a));
      toast.success(`Fixed ${updated.length} URL${updated.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fix domains");
    } finally {
      setFixing(false);
    }
  };

  const verifyOne = async (a: ArticleDraft, opts?: { silent?: boolean }) => {
    if (!a.publishedUrl) {
      if (!opts?.silent) toast.error("No published URL to check");
      return;
    }
    setVerifyingId(a.id);
    try {
      const result = await checkUrl({ data: { url: a.publishedUrl } });
      const next: ArticleDraft = {
        ...a,
        lastStatusCode: result.statusCode,
        lastCheckedAt: result.checkedAt,
        verifiedLiveAt: result.status === "live" ? result.checkedAt : a.verifiedLiveAt ?? null,
      };
      // If a previous verification existed but URL now fails, clear it
      if (result.status !== "live") next.verifiedLiveAt = null;
      await upsertArticleDraft(next);
      setArticles((prev) => prev.map((x) => (x.id === a.id ? next : x)));
      if (!opts?.silent) {
        if (result.status === "live") toast.success(`Live (${result.statusCode})`);
        else if (result.status === "redirect") toast.info(`Redirects (${result.statusCode})`);
        else if (result.status === "not_found") toast.error(`Not found (${result.statusCode})`);
        else toast.error(`Check failed${result.statusCode ? ` (${result.statusCode})` : ""}`);
      }
    } catch (err) {
      if (!opts?.silent) toast.error(err instanceof Error ? err.message : "Check failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const verifyAll = async () => {
    const list = grouped.published.filter((a) => a.publishedUrl);
    if (!list.length) return;
    setVerifyingAll(true);
    try {
      for (const a of list) {
        // sequential to avoid hammering the host
        // eslint-disable-next-line no-await-in-loop
        await verifyOne(a, { silent: true });
      }
      toast.success(`Checked ${list.length} URL${list.length === 1 ? "" : "s"}`);
    } finally {
      setVerifyingAll(false);
    }
  };

  const current = grouped[tab];

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 px-2 text-muted-foreground">
        <Link to="/dashboard"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Dashboard</Link>
      </Button>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">Publishing</div>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">Publishing Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage every article from draft to live.</p>
        </div>
        <Send className="hidden h-8 w-8 text-primary sm:block" />
      </div>

      {mismatched.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">
                {mismatched.length} published URL{mismatched.length === 1 ? "" : "s"} use the wrong domain
              </div>
              <div className="mt-0.5 text-xs opacity-90">
                Will rewrite to <strong>{extractDomain(profile.websiteUrl)}</strong>. Slugs are preserved.
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={fixAllDomains} disabled={fixing}>
            {fixing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
            Fix Domain
          </Button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        {TABS.map((t) => {
          const count = grouped[t.id].length;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition sm:px-4 sm:text-sm ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent/40"
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <span className={active ? "text-primary" : ""}>{t.icon}</span>
                <span className="truncate font-medium">{t.label}</span>
              </span>
              <Badge variant="outline" className="text-[10px]">{count}</Badge>
            </button>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg capitalize">
              {TABS.find((t) => t.id === tab)?.label ?? tab}
            </CardTitle>
            <CardDescription>
              {tab === "draft" && "Articles still being written or refined."}
              {tab === "scheduled" && "Articles queued in the 30-day content plan."}
              {tab === "ready" && "Articles you've copied for your website. Paste the live URL and verify to publish."}
              {tab === "published" && "All articles that have been verified live at least once."}
              {tab === "needs_fix" && "Pasted URLs returning 404 or other errors. Edit the URL to match the live page."}
              {tab === "verified" && "URLs confirmed live (HTTP 200) at the timestamp shown."}
            </CardDescription>
          </div>
          {(tab === "published" || tab === "needs_fix" || tab === "verified") && grouped.published.length > 0 && (
            <Button size="sm" variant="outline" onClick={verifyAll} disabled={verifyingAll}>
              {verifyingAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Check All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : current.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
              <div className="font-display text-sm font-semibold text-foreground">Nothing here yet</div>
              <p className="max-w-sm text-xs text-muted-foreground">
                {tab === "draft" && "Start writing articles to see drafts here."}
                {tab === "scheduled" && "Build a content plan from the dashboard."}
                {tab === "ready" && "Open an article and click 'Mark Ready for Website' once you've copied the content."}
                {tab === "published" && "No articles have been verified live yet."}
                {tab === "needs_fix" && "No broken pasted URLs. 🎉"}
                {tab === "verified" && "Paste a live URL and click Verify to confirm HTTP 200."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {current.map((a) => (
                <ArticleRow
                  key={a.id}
                  a={a}
                  verifying={verifyingId === a.id}
                  onVerify={() => verifyOne(a)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function UrlStatusBadge({ a }: { a: ArticleDraft }) {
  if (!isPublishedish(a)) return null;
  if (!a.publishedUrl) return <Badge variant="outline" className="text-[10px]">No URL</Badge>;
  if (isVerified(a)) {
    return (
      <Badge variant="outline" className="border-success/40 bg-success/15 text-success text-[10px]">
        <ShieldCheck className="mr-1 h-3 w-3" /> Live · 200
      </Badge>
    );
  }
  const code = a.lastStatusCode;
  if (code == null) return <Badge variant="outline" className="text-[10px]">Unverified</Badge>;
  if (code === 404 || code === 410) {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/15 text-destructive text-[10px]">
        Not Found · {code}
      </Badge>
    );
  }
  if (code >= 300 && code < 400) {
    return <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 text-amber-600 text-[10px]">Redirect · {code}</Badge>;
  }
  if (code >= 400) {
    return <Badge variant="outline" className="border-destructive/40 bg-destructive/15 text-destructive text-[10px]">Error · {code}</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">HTTP {code}</Badge>;
}

function ArticleRow({
  a,
  verifying,
  onVerify,
}: {
  a: ArticleDraft;
  verifying: boolean;
  onVerify: () => void;
}) {
  const date =
    isPublishedish(a) && a.publishedAt
      ? `Published ${new Date(a.publishedAt).toLocaleDateString()}`
      : a.scheduledFor
        ? `Scheduled ${new Date(a.scheduledFor).toLocaleDateString()}`
        : "No date";
  const broken = needsUrlFix(a);
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate font-display text-sm font-semibold text-foreground">{a.title}</div>
          <UrlStatusBadge a={a} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Target className="h-3 w-3" /> {a.keyword}</span>
          <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> {a.service}</span>
          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {date}</span>
          {a.verifiedLiveAt && (
            <span className="inline-flex items-center gap-1 text-success">
              <ShieldCheck className="h-3 w-3" /> Verified {new Date(a.verifiedLiveAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {isPublishedish(a) && a.publishedUrl && (
          <a
            href={a.publishedUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> {a.publishedUrl.replace(/^https?:\/\//, "")}
          </a>
        )}
        {broken && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            Published URL does not appear live. Open the editor to paste the correct URL from the live page.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
        {isPublishedish(a) && a.publishedUrl && (
          <Button size="sm" variant="outline" onClick={onVerify} disabled={verifying}>
            {verifying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Verify URL
          </Button>
        )}
        <Button asChild size="sm" variant={isPublishedish(a) ? "outline" : "default"}>
          <Link to="/article/$id" params={{ id: a.id }}>
            <PenSquare className="mr-1.5 h-3.5 w-3.5" />
            {isPublishedish(a) ? "View" : "Open Editor"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
