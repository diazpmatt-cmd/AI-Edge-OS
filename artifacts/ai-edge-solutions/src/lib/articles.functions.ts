import { apiFetch } from "./api";

export async function generateArticleContent(input: {
  title: string; keyword: string; service: string;
  businessName: string; industry: string; city: string; state: string;
  mainServices?: string; targetCustomers?: string;
}): Promise<{ body: string }> {
  return apiFetch<{ body: string }>("/ai/article", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
