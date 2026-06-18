import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, Target, MapPin, Wrench, FileText, Settings2, Send,
  Copy, Check, ExternalLink, CheckCircle2, Loader2, Globe, Wand2,
  ShieldCheck, RefreshCw, AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  loadProfile,
  slugify,
  domainMatches,
  rewriteUrlDomain,
  extractDomain,
  type ArticleDraft,
} from "@/lib/business-data";
import { fetchArticleDraft, upsertArticleDraft } from "@/lib/articles-store";
import { generateArticleContent } from "@/lib/articles.functions";
import { checkPublishedUrl } from "@/lib/url-check.functions";
import {
  buildMetaDescription,
  buildMetaTitle,
  buildSlug,
  ensureValidMetaDescription,
  optimizeMetaDescription,
  trimMetaDescription,
  validateMetaDescription,
  type MetaInput,
} from "@/lib/meta-description";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export const Route = createFileRoute("/article/$id")({
  head: () => ({
    meta: [
      { title: "Article Editor · AI Edge Solutions" },
      { name: "description", content: "Generate, optimize, and publish SEO articles." },
    ],
  }),
  component: ArticleEditor,
});

type Step = 1 | 2 | 3;

function ArticleEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const profile = useMemo(() => loadProfile(), []);

  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const generateFn = useServerFn(generateArticleContent);
  const checkUrlFn = useServerFn(checkPublishedUrl);
  const [verifying, setVerifying] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const existing = await fetchArticleDraft(id);
        if (cancelled) return;
        if (existing) {
          setDraft(existing);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load draft";
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => {
      upsertArticleDraft(draft).catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to save";
        toast.error(msg);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [draft]);

  if (notFound) {
    return (
      <AppShell>
        <NotFound />
      </AppShell>
    );
  }

  if (loading || !draft) {
    return (
      <AppShell>
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  const update = <K extends keyof ArticleDraft>(k: K, v: ArticleDraft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { body } = await generateFn({
        data: {
          title: draft.title,
          keyword: draft.keyword,
          service: draft.service,
          businessName: profile.businessName,
          industry: profile.industry,
          city: profile.city,
          state: profile.state,
          mainServices: profile.mainServices,
          targetCustomers: profile.targetCustomers,
        },
      });
      const metaInput: MetaInput = {
        keyword: draft.keyword,
        city: profile.city,
        state: profile.state,
        service: draft.service,
        businessName: profile.businessName,
        title: draft.title,
      };
      const metaTitle = buildMetaTitle(metaInput);
      const metaDescription = optimizeMetaDescription(metaInput);
      const slug = buildSlug({
        title: draft.title,
        keyword: draft.keyword,
        city: profile.city,
      });
      setDraft((d) =>
        d
          ? {
              ...d,
              body,
              metaTitle,
              metaDescription,
              slug,
              generatedAt: new Date().toISOString(),
            }
          : d,
      );
      toast.success("Article + SEO metadata generated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const isPublished = draft.status === "published";
  const isReady = draft.status === "ready_for_website";


  // Normalize meta description for both Mark-Ready and Verify paths.
  const enforceMetaDescription = (): string => {
    const metaInput: MetaInput = {
      keyword: draft.keyword,
      city: profile.city,
      state: profile.state,
      service: draft.service,
      businessName: profile.businessName,
      title: draft.title,
    };
    let finalDesc = draft.metaDescription;
    if (finalDesc.length > 160) finalDesc = trimMetaDescription(finalDesc);
    const v = validateMetaDescription(finalDesc, {
      keyword: draft.keyword,
      city: profile.city,
      service: draft.service,
    });
    if (!v.valid || finalDesc.length < 120) {
      finalDesc = ensureValidMetaDescription(finalDesc, metaInput);
      toast.message("Meta description auto-fixed");
    }
    return finalDesc;
  };

  // Step 1 publish action: hand the article off for manual posting on the website.
  // Does NOT fabricate a URL, does NOT mark as published.
  const handleMarkReady = () => {
    const finalDesc = enforceMetaDescription();
    setDraft((d) =>
      d
        ? {
            ...d,
            metaDescription: finalDesc,
            status: "ready_for_website",
            // Keep publishedUrl empty until the user pastes the real live URL.
            publishedUrl: d.publishedUrl ?? null,
            publishedAt: null,
            verifiedLiveAt: null,
          }
        : d,
    );
    toast.success("Marked ready for website — paste the live URL once posted.");
  };

  // Step 2 publish action: user pasted the real live URL → check it.
  // Only HTTP 200 promotes to "published" + verifiedLiveAt.
  const handleVerifyUrl = async () => {
    const url = (draft.publishedUrl ?? "").trim();
    if (!url) {
      toast.error("Paste the live URL from your website first.");
      return;
    }
    setVerifying(true);
    setPublishing(true);
    try {
      const result = await checkUrlFn({ data: { url } });
      const isLive = result.status === "live" && result.statusCode === 200;
      setDraft((d) =>
        d
          ? {
              ...d,
              publishedUrl: url,
              status: isLive ? "published" : "published_error",
              publishedAt: isLive ? (d.publishedAt ?? new Date().toISOString()) : d.publishedAt ?? null,
              lastStatusCode: result.statusCode,
              lastCheckedAt: result.checkedAt,
              verifiedLiveAt: isLive ? result.checkedAt : null,
            }
          : d,
      );
      if (isLive) toast.success(`Published & verified live (${result.statusCode})`);
      else if (result.status === "redirect") toast.info(`Redirects (${result.statusCode}) — use the final URL`);
      else if (result.status === "not_found") toast.error(`Not found (${result.statusCode})`);
      else toast.error(`Check failed${result.statusCode ? ` (${result.statusCode})` : ""}`);
    } catch (err) {
      setDraft((d) =>
        d
          ? {
              ...d,
              publishedUrl: url,
              status: "published_error",
              lastStatusCode: null,
              lastCheckedAt: new Date().toISOString(),
              verifiedLiveAt: null,
            }
          : d,
      );
      toast.error(err instanceof Error ? err.message : "Check failed");
    } finally {
      setVerifying(false);
      setPublishing(false);
    }
  };




  return (
    <AppShell>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 px-2 text-muted-foreground">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Dashboard
            </Link>
          </Button>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">Article Editor</div>
          <h1 className="mt-1 truncate font-display text-xl font-bold text-foreground sm:text-2xl">
            {draft.title}
          </h1>
        </div>
        {isPublished && (
          <Badge variant="outline" className="self-start bg-success/15 text-success border-success/20">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Published
          </Badge>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        <StepPill n={1} active={step === 1} done={!!draft.body} label="Generate" onClick={() => setStep(1)} />
        <StepPill n={2} active={step === 2} done={!!draft.metaTitle && !!draft.body} label="SEO Settings" onClick={() => setStep(2)} />
        <StepPill n={3} active={step === 3} done={isPublished} label="Publish" onClick={() => setStep(3)} />
      </div>

      <div className="mt-6">
        {step === 1 && (
          <StepGenerate
            draft={draft}
            update={update}
            profile={profile}
            generating={generating}
            onGenerate={handleGenerate}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepSeo
            draft={draft}
            update={update}
            liveUrl={`${profile.websiteUrl.replace(/\/$/, "")}/blog/${draft.slug}`}
            profile={profile}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepPublish
            draft={draft}
            projectWebsite={profile.websiteUrl}
            update={update}
            isPublished={isPublished}
            isReady={isReady}
            publishing={publishing}
            onBack={() => setStep(2)}
            onMarkReady={handleMarkReady}
            onDone={() => navigate({ to: "/dashboard" })}
            onVerifyUrl={handleVerifyUrl}
            verifying={verifying}
          />
        )}
      </div>
    </AppShell>
  );
}

function StepGenerate({
  draft, update, profile, generating, onGenerate, onNext,
}: {
  draft: ArticleDraft;
  update: <K extends keyof ArticleDraft>(k: K, v: ArticleDraft[K]) => void;
  profile: ReturnType<typeof loadProfile>;
  generating: boolean;
  onGenerate: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" /> Generate Article
        </CardTitle>
        <CardDescription>Confirm the brief, then generate your draft</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon={<FileText className="h-3.5 w-3.5" />} label="Article Title">
            <Input value={draft.title} onChange={(e) => update("title", e.target.value)} />
          </Field>
          <Field icon={<Target className="h-3.5 w-3.5" />} label="Target Keyword">
            <Input value={draft.keyword} onChange={(e) => update("keyword", e.target.value)} />
          </Field>
          <Field icon={<Wrench className="h-3.5 w-3.5" />} label="Service">
            <Input value={draft.service} onChange={(e) => update("service", e.target.value)} />
          </Field>
          <Field icon={<MapPin className="h-3.5 w-3.5" />} label="City / Location">
            <Input value={`${profile.city}, ${profile.state}`} readOnly className="bg-muted/40" />
          </Field>
        </div>

        <Button onClick={onGenerate} disabled={generating} className="w-full sm:w-auto">
          {generating ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> {draft.body ? "Regenerate Article" : "Generate Article"}</>
          )}
        </Button>

        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Article Body {draft.body && <span className="ml-2 text-foreground/60 normal-case">· {wordCount(draft.body)} words</span>}
          </Label>
          <Textarea
            value={draft.body}
            onChange={(e) => update("body", e.target.value)}
            placeholder="Click Generate Article to draft the content, then edit freely."
            className="mt-1.5 min-h-[360px] font-mono text-sm leading-relaxed"
          />
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={onNext} disabled={!draft.body}>
            Next: SEO Settings →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepSeo({
  draft, update, liveUrl, profile, onBack, onNext,
}: {
  draft: ArticleDraft;
  update: <K extends keyof ArticleDraft>(k: K, v: ArticleDraft[K]) => void;
  liveUrl: string;
  profile: ReturnType<typeof loadProfile>;
  onBack: () => void;
  onNext: () => void;
}) {
  const density = useMemo(() => keywordDensity(draft.body, draft.keyword), [draft.body, draft.keyword]);
  const score = useMemo(() => readinessScore(draft, density), [draft, density]);
  const metaDescStatus = useMemo(() => {
    const len = draft.metaDescription.length;
    if (len >= 120 && len <= 160) return { text: "Optimal", state: "success" as const };
    if (len >= 100) return { text: "Almost there", state: "warning" as const };
    return { text: "Too short", state: "danger" as const };
  }, [draft.metaDescription]);
  const densityStatus = useMemo(() => {
    if (density >= 0.5 && density <= 2.5) return { text: "Optimal", state: "success" as const };
    if (density <= 4) return { text: "High", state: "warning" as const };
    return { text: "Too high", state: "danger" as const };
  }, [density]);

  const handleOptimizeMeta = () => {
    const optimized = optimizeMetaDescription({
      keyword: draft.keyword,
      city: profile.city,
      state: profile.state,
      service: draft.service,
      businessName: profile.businessName,
      title: draft.title,
    });
    update("metaDescription", optimized);
    toast.success(`Meta description optimized (${optimized.length} chars)`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5 text-primary" /> SEO Settings
          </CardTitle>
          <CardDescription>Optimize how your article appears in search</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Meta Title" hint={`${draft.metaTitle.length}/60`}>
            <Input value={draft.metaTitle} onChange={(e) => update("metaTitle", e.target.value)} maxLength={70} />
          </Field>
          <Field label="Meta Description" hint={`${draft.metaDescription.length}/160`}>
            <Textarea
              value={draft.metaDescription}
              onChange={(e) => update("metaDescription", e.target.value)}
              maxLength={180}
              className="min-h-[80px]"
            />
            <div className="mt-2 flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={handleOptimizeMeta}>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Optimize Meta Description
              </Button>
              <span className={`text-xs font-medium ${
                metaDescStatus.state === "success" ? "text-success" :
                metaDescStatus.state === "warning" ? "text-warning" : "text-destructive"
              }`}>
                {metaDescStatus.text}
              </span>
            </div>
          </Field>
          <Field label="URL Slug">
            <div className="flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
              <span className="truncate text-muted-foreground">/blog/</span>
              <input
                value={draft.slug}
                onChange={(e) => update("slug", slugify(e.target.value))}
                className="flex-1 bg-transparent outline-none"
              />
            </div>
          </Field>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Google Preview
            </Label>
            <div className="mt-2 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="grid h-6 w-6 place-items-center rounded-full bg-muted">
                  <Globe className="h-3 w-3" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-foreground">{liveUrl.replace(/^https?:\/\//, "")}</div>
                </div>
              </div>
              <div className="mt-1 truncate text-lg text-[#1a0dab] hover:underline">
                {draft.metaTitle || draft.title}
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {draft.metaDescription || "Meta description preview will appear here."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Readiness</CardTitle>
          <CardDescription>How publish-ready this article is</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publish Score</div>
              <div className="font-display text-3xl font-bold text-foreground">{score}<span className="text-base text-muted-foreground">/100</span></div>
            </div>
            <Progress value={score} className="mt-2 h-2" />
          </div>
          <Metric label="Keyword Density" value={`${density.toFixed(2)}%`} hint={densityStatus.text} state={densityStatus.state} />
          <Metric label="Word Count" value={wordCount(draft.body).toString()} hint={wordCount(draft.body) >= 800 ? "Good" : "Add more"} state={wordCount(draft.body) >= 800 ? "success" : "warning"} />
          <Metric label="Meta Title" value={`${draft.metaTitle.length} chars`} hint={draft.metaTitle.length >= 40 && draft.metaTitle.length <= 60 ? "Optimal" : "Adjust"} state={draft.metaTitle.length >= 40 && draft.metaTitle.length <= 60 ? "success" : "warning"} />
          <Metric label="Meta Description" value={`${draft.metaDescription.length} chars`} hint={metaDescStatus.text} state={metaDescStatus.state} onFix={handleOptimizeMeta} />
          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button onClick={onNext}>Next: Publish →</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepPublish({
  draft, projectWebsite, update, isPublished, isReady, publishing,
  onBack, onMarkReady, onDone, onVerifyUrl, verifying,
}: {
  draft: ArticleDraft;
  projectWebsite: string;
  update: <K extends keyof ArticleDraft>(k: K, v: ArticleDraft[K]) => void;
  isPublished: boolean;
  isReady: boolean;
  publishing: boolean;
  onBack: () => void;
  onMarkReady: () => void;
  onDone: () => void;
  onVerifyUrl: () => void;
  verifying: boolean;
}) {
  const html = useMemo(() => markdownToHtml(draft.body), [draft.body]);
  const plain = useMemo(() => draft.body.replace(/[#*_>`-]/g, "").replace(/\n{2,}/g, "\n\n").trim(), [draft.body]);
  const currentUrl = (draft.publishedUrl ?? "").trim();
  const hasUrl = currentUrl.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" /> Post to Your Website
          </CardTitle>
          <CardDescription>
            Copy the article, paste it into your website CMS, then paste the live URL back here and verify.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              1. Copy the article
            </Label>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <CopyButton label="Copy Article HTML" content={html} />
              <CopyButton label="Copy Markdown" content={draft.body} />
              <CopyButton label="Copy Plain Text" content={plain} />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              2. Paste the live URL after posting
            </Label>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              This app does not create pages on bedbugsandbeyond.net. It prepares the article for Gapstow.
              The article becomes <strong>Published</strong> only after the real live website URL is pasted and returns HTTP 200.
            </p>
            <div className="mt-2">
              <Field label="Live URL on your website">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={draft.publishedUrl ?? ""}
                    onChange={(e) => update("publishedUrl", e.target.value || null)}
                    placeholder="Paste the real live URL here after publishing in Gapstow"
                  />
                  <div className="flex flex-wrap gap-2">
                    <CopyButton label="Copy URL" content={currentUrl} compact disabled={!isPublished} />
                    <Button asChild variant="outline" size="icon" disabled={!hasUrl}>
                      <a
                        href={hasUrl ? currentUrl : undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!hasUrl}
                        onClick={(e) => { if (!hasUrl) e.preventDefault(); }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={onVerifyUrl}
                      disabled={verifying || !hasUrl}
                    >
                      {verifying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      Verify Pasted Live URL
                    </Button>
                  </div>
                </div>
                {!hasUrl && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Leave empty until the article is actually posted. The app won't generate a URL for you.
                  </p>
                )}
                {hasUrl && !domainMatches(currentUrl, projectWebsite) && (
                  <div className="mt-2 flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Domain <strong>{extractDomain(currentUrl)}</strong> doesn't match project website <strong>{extractDomain(projectWebsite)}</strong>.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const fixed = rewriteUrlDomain(currentUrl, projectWebsite);
                        update("publishedUrl", fixed);
                        toast.success("Domain fixed");
                      }}
                    >
                      <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Fix Domain
                    </Button>
                  </div>
                )}
                {(() => {
                  const code = draft.lastStatusCode;
                  const verified = !!draft.verifiedLiveAt && code === 200;
                  if (verified) {
                    return (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-2.5 text-xs text-success">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Verified live (200) on {new Date(draft.verifiedLiveAt!).toLocaleString()}</span>
                      </div>
                    );
                  }
                  if (code != null && (code === 404 || code === 410 || code >= 400)) {
                    return (
                      <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <div className="font-semibold">Published URL does not appear live (HTTP {code}).</div>
                          <div className="mt-0.5 opacity-90">
                            Open the live page on your site, copy the actual URL, and paste it above. Then click Verify URL.
                          </div>
                        </div>
                      </div>
                    );
                  }
                  if (code != null && code >= 300 && code < 400) {
                    return (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4" />
                        <span>URL redirects (HTTP {code}). Consider using the final destination URL.</span>
                      </div>
                    );
                  }
                  if (draft.lastCheckedAt && code == null) {
                    return (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Last check failed to reach the URL.</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HTML Preview</Label>
            <div
              className="prose prose-sm mt-2 max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-a:text-primary"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Status</div>
            <div className="mt-1 flex items-center gap-2">
              {isPublished ? (
                <Badge variant="outline" className="bg-success/15 text-success border-success/20">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Published · Verified Live
                </Badge>
              ) : draft.status === "published_error" ? (
                <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/20">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Needs URL Fix
                </Badge>
              ) : isReady ? (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-300">
                  <Send className="mr-1 h-3 w-3" /> Ready for Website
                </Badge>
              ) : (
                <Badge variant="outline" className="capitalize">{draft.status}</Badge>
              )}
            </div>
            {draft.publishedAt && (
              <div className="mt-2 text-xs text-muted-foreground">
                Published {new Date(draft.publishedAt).toLocaleString()}
              </div>
            )}
          </div>

          <Button
            onClick={onMarkReady}
            disabled={isPublished}
            variant={isReady || isPublished ? "outline" : "default"}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            {isReady ? "Marked Ready" : "Mark Ready for Website"}
          </Button>

          <Button
            onClick={onVerifyUrl}
            disabled={!hasUrl || publishing}
            variant={isPublished ? "outline" : "default"}
            className="w-full"
          >
            {publishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            {isPublished ? "Re-verify Live URL" : "Verify Live URL → Publish"}
          </Button>

          <p className="text-xs text-muted-foreground">
            An article only becomes <strong>Published</strong> after the pasted URL returns HTTP 200.
          </p>

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button variant="ghost" onClick={onDone}>Done</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


function StepPill({ n, label, active, done, onClick }: { n: number; label: string; active: boolean; done: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition sm:px-4 sm:text-sm ${
        active
          ? "border-primary bg-primary/10 text-foreground"
          : done
          ? "border-success/40 bg-success/5 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent/40"
      }`}
    >
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
          active ? "bg-primary text-primary-foreground" : done ? "bg-success text-white" : "bg-muted text-muted-foreground"
        }`}
      >
        {done && !active ? <Check className="h-3 w-3" /> : n}
      </span>
      <span className="truncate font-medium">{label}</span>
    </button>
  );
}

function Field({ label, icon, hint, children }: { label: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {icon} {label}
        </Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, hint, state, onFix }: { label: string; value: string; hint: string; state?: "success" | "warning" | "danger"; onFix?: () => void }) {
  const status = state ?? (/optimal|good/i.test(hint) ? "success" : "warning");
  const styles = {
    success: "bg-success/15 text-success border-success/20",
    warning: "bg-warning/15 text-warning border-warning/20",
    danger: "bg-destructive/15 text-destructive border-destructive/20",
  };
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold text-foreground">{value}</div>
      </div>
      {onFix && status !== "success" ? (
        <Button size="sm" variant="outline" onClick={onFix} className="h-7 gap-1 border-warning/30 bg-warning/10 text-xs text-warning hover:bg-warning/20 hover:text-warning">
          <Wand2 className="h-3 w-3" /> Fix Automatically
        </Button>
      ) : (
        <Badge variant="outline" className={styles[status]}>
          {hint}
        </Badge>
      )}
    </div>
  );
}

function CopyButton({ label, content, compact, disabled }: { label: string; content: string; compact?: boolean; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };
  return (
    <Button variant={copied ? "outline" : "default"} onClick={onCopy} disabled={disabled} className={compact ? "" : "w-full"} size={compact ? "default" : "default"}>
      {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <FileText className="h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 font-display text-xl font-bold">Article not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">This article isn't in your content plan.</p>
      <Button asChild className="mt-6">
        <Link to="/dashboard"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Dashboard</Link>
      </Button>
    </div>
  );
}

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function keywordDensity(body: string, keyword: string) {
  const wc = wordCount(body);
  if (!wc || !keyword.trim()) return 0;
  const matches = (body.toLowerCase().match(new RegExp(escapeRegex(keyword.toLowerCase()), "g")) ?? []).length;
  const kwWords = keyword.trim().split(/\s+/).length;
  return (matches * kwWords / wc) * 100;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readinessScore(d: ArticleDraft, density: number) {
  let score = 0;
  if (d.body && wordCount(d.body) >= 800) score += 35;
  else if (d.body) score += 18;
  if (d.metaTitle.length >= 40 && d.metaTitle.length <= 60) score += 15;
  else if (d.metaTitle.length > 0) score += 7;
  if (d.metaDescription.length >= 120 && d.metaDescription.length <= 160) score += 15;
  else if (d.metaDescription.length >= 100) score += 7;
  if (d.slug.length >= 3) score += 10;
  if (density >= 0.5 && density <= 2.5) score += 25;
  else if (density > 0 && density <= 4) score += 10;
  return Math.min(100, score);
}

function markdownToHtml(md: string): string {
  if (!md) return "<p></p>";
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let inOl = false;
  const flush = () => {
    if (inList) { out.push("</ul>"); inList = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (/^### /.test(line)) { flush(); out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (/^## /.test(line)) { flush(); out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (/^# /.test(line)) { flush(); out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) { flush(); out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { flush(); out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    flush();
    out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("\n");
}

function inline(s: string) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
