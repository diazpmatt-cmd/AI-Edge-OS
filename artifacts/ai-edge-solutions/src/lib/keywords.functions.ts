import { apiFetch } from "./api";
import type { Keyword } from "./business-data";

export async function generateKeywordIdeas(input: {
  businessName: string; industry: string; city: string; state: string;
  mainServices: string; targetCustomers?: string;
}): Promise<{ keywords: Keyword[] }> {
  return apiFetch<{ keywords: Keyword[] }>("/ai/keywords", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
