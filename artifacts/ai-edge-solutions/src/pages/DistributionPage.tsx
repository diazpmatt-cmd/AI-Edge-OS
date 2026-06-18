import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";
import { fetchAllArticleAssets } from "@/lib/article-assets-store";
import { ARTICLE_CHANNELS } from "@/lib/article-channels";

export default function DistributionPage() {
  const { data: allAssets = [] } = useQuery({ queryKey: ["article_assets_all"], queryFn: fetchAllArticleAssets });

  const totals = ARTICLE_CHANNELS.map((c) => {
    const items = allAssets.filter((a) => a.channel === c.id);
    return {
      ...c,
      total: items.length,
      draft: items.filter((a) => a.status === "draft").length,
      ready: items.filter((a) => a.status === "ready").length,
      published: items.filter((a) => a.status === "published").length,
      failed: items.filter((a) => a.status === "failed").length,
    };
  });

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Publishing</div>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">Distribution Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every channel and publication status across all articles.</p>
      </div>

      {allAssets.length === 0
        ? <Card>
            <CardContent className="grid place-items-center gap-2 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10"><Radio className="h-6 w-6 text-primary" /></div>
              <p className="font-display text-sm font-semibold">No assets yet</p>
              <p className="text-xs text-muted-foreground">Generate social assets from article pages to see them here.</p>
            </CardContent>
          </Card>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {totals.map((c) => (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="text-base">{c.label}</CardTitle>
                  <CardDescription>{c.hint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-foreground mb-3">{c.total} assets</div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.draft > 0 && <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">{c.draft} draft</Badge>}
                    {c.ready > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{c.ready} ready</Badge>}
                    {c.published > 0 && <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/20">{c.published} published</Badge>}
                    {c.failed > 0 && <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/20">{c.failed} failed</Badge>}
                    {c.total === 0 && <span className="text-xs text-muted-foreground">No assets yet</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
      }
    </AppShell>
  );
}
