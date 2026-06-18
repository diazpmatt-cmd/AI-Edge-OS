import { apiFetch } from "./api";
import type { Keyword } from "./business-data";

export async function fetchKeywords(): Promise<Keyword[]> {
  return apiFetch<Keyword[]>("/keywords");
}

export async function insertKeywords(items: Array<Omit<Keyword, "id">>): Promise<Keyword[]> {
  if (!items.length) return [];
  return apiFetch<Keyword[]>("/keywords", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function clearKeywords(): Promise<void> {
  await apiFetch<void>("/keywords", { method: "DELETE" });
}
