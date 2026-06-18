import { supabase } from "@/integrations/supabase/client";
import type { ArticleAssetStatus, ArticleChannelId } from "./article-channels";

export type ArticleAsset = {
  id: string;
  articleId: string;
  channel: ArticleChannelId;
  body: string;
  status: ArticleAssetStatus;
  publishedUrl: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

function fromRow(r: any): ArticleAsset {
  return {
    id: r.id,
    articleId: r.article_id,
    channel: r.channel,
    body: r.body,
    status: r.status,
    publishedUrl: r.published_url,
    publishedAt: r.published_at,
    errorMessage: r.error_message,
    updatedAt: r.updated_at,
  };
}

export async function fetchArticleAssets(articleId: string): Promise<ArticleAsset[]> {
  const { data, error } = await supabase
    .from("article_assets")
    .select("*")
    .eq("article_id", articleId);
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function fetchAllArticleAssets(): Promise<ArticleAsset[]> {
  const { data, error } = await supabase
    .from("article_assets")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function upsertArticleAssets(
  articleId: string,
  assets: { channel: ArticleChannelId; body: string; status?: ArticleAssetStatus; errorMessage?: string | null }[],
): Promise<void> {
  const rows = assets.map((a) => ({
    article_id: articleId,
    channel: a.channel,
    body: a.body,
    status: a.status ?? "draft",
    error_message: a.errorMessage ?? null,
  }));
  const { error } = await supabase
    .from("article_assets")
    .upsert(rows, { onConflict: "article_id,channel" });
  if (error) throw error;
}

export async function updateArticleAsset(
  id: string,
  patch: Partial<Pick<ArticleAsset, "body" | "status" | "publishedUrl" | "errorMessage">>,
): Promise<void> {
  const row: any = {};
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.status !== undefined) {
    row.status = patch.status;
    if (patch.status === "published") row.published_at = new Date().toISOString();
  }
  if (patch.publishedUrl !== undefined) row.published_url = patch.publishedUrl;
  if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage;
  const { error } = await supabase.from("article_assets").update(row).eq("id", id);
  if (error) throw error;
}
