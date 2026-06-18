import { apiFetch } from "./api";

export async function generateArticleAssets(input: {
  title: string; keyword: string; service?: string;
  businessName?: string; city?: string; state?: string; body?: string;
}): Promise<{ assets: Array<{ channel: string; body: string; status: string; errorMessage: string | null }> }> {
  return apiFetch("/ai/article-assets", { method: "POST", body: JSON.stringify(input) });
}
