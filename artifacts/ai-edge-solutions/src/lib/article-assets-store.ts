import { apiFetch } from "./api";

export type ArticleAsset = {
  id: string;
  articleId: string;
  channel: string;
  body: string;
  status: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

export async function fetchAllArticleAssets(): Promise<ArticleAsset[]> {
  return apiFetch<ArticleAsset[]>("/article-assets");
}

export async function fetchArticleAssets(articleId: string): Promise<ArticleAsset[]> {
  return apiFetch<ArticleAsset[]>(`/article-assets/${articleId}`);
}

export async function upsertArticleAssets(
  articleId: string,
  assets: Array<{ channel: string; body: string; status?: string; errorMessage?: string | null }>,
): Promise<ArticleAsset[]> {
  return apiFetch<ArticleAsset[]>(`/article-assets/${articleId}`, {
    method: "POST",
    body: JSON.stringify({ assets }),
  });
}

export async function updateArticleAsset(
  id: string,
  update: Partial<Pick<ArticleAsset, "body" | "status" | "publishedUrl" | "errorMessage">>,
): Promise<ArticleAsset> {
  return apiFetch<ArticleAsset>(`/article-assets/item/${id}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}
