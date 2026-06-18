import { apiFetch } from "./api";
import { PROJECT_ID, slugify, type ArticleDraft, type Keyword, type BusinessProfile } from "./business-data";

export async function fetchArticles(): Promise<ArticleDraft[]> {
  return apiFetch<ArticleDraft[]>("/articles");
}

export async function fetchArticleDraft(id: string): Promise<ArticleDraft | null> {
  try {
    return await apiFetch<ArticleDraft>(`/articles/${id}`);
  } catch (e: any) {
    if (String(e?.message).includes("404")) return null;
    throw e;
  }
}

export async function upsertArticleDraft(draft: ArticleDraft): Promise<void> {
  await apiFetch<ArticleDraft>(`/articles/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify(draft),
  });
}

export async function insertArticles(drafts: ArticleDraft[]): Promise<void> {
  if (!drafts.length) return;
  await apiFetch<ArticleDraft[]>("/articles", {
    method: "POST",
    body: JSON.stringify({ items: drafts }),
  });
}

export async function clearArticles(): Promise<void> {
  await apiFetch<void>("/articles", { method: "DELETE" });
}

export function buildContentPlan(keywords: Keyword[], profile: BusinessProfile): ArticleDraft[] {
  if (!keywords.length) return [];
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const drafts: ArticleDraft[] = [];
  for (let i = 0; i < 12; i++) {
    const k = keywords[i % keywords.length];
    const date = new Date(start);
    date.setDate(start.getDate() + Math.round((i * 30) / 12));
    const title = titleForKeyword(k, profile, i);
    drafts.push({
      id: crypto.randomUUID(),
      title,
      keyword: k.keyword,
      keywordId: k.id,
      service: k.service,
      project: PROJECT_ID,
      body: "",
      metaTitle: `${title} | ${profile.businessName}`.slice(0, 60),
      metaDescription: `Learn about ${k.keyword} from ${profile.businessName}, serving ${profile.city}, ${profile.state}.`.slice(0, 160),
      slug: slugify(title),
      status: "scheduled",
      scheduledFor: date.toISOString(),
      publishedAt: null,
      publishedUrl: null,
    });
  }
  return drafts;
}

function titleForKeyword(k: Keyword, profile: BusinessProfile, i: number): string {
  const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const kw = cap(k.keyword);
  const loc = `${profile.city}, ${profile.state}`;
  const templates = [
    `${kw}: A Complete Guide for ${profile.city} Homeowners`,
    `${kw} — What ${loc} Residents Need to Know`,
    `5 Signs You Need ${k.service} in ${profile.city}`,
    `${kw}: Costs, Process, and What to Expect`,
    `How ${profile.businessName} Handles ${k.service} in ${loc}`,
    `${kw} vs DIY: Which Actually Works?`,
  ];
  return templates[i % templates.length];
}
