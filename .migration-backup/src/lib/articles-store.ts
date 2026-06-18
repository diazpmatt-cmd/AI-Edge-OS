import { supabase } from "@/integrations/supabase/client";
import {
  PROJECT_ID,
  slugify,
  type ArticleDraft,
  type ArticleStatus,
  type Keyword,
  type BusinessProfile,
} from "./business-data";

type Row = {
  id: string;
  title: string;
  keyword: string;
  keyword_id: string | null;
  service: string;
  project: string;
  body: string;
  meta_title: string;
  meta_description: string;
  slug: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  published_url: string | null;
  published: boolean;
  generated_at: string | null;
  verified_live_at: string | null;
  last_status_code: number | null;
  last_checked_at: string | null;
};

function rowToDraft(r: Row): ArticleDraft {
  return {
    id: r.id,
    title: r.title,
    keyword: r.keyword,
    keywordId: r.keyword_id,
    service: r.service,
    project: r.project ?? PROJECT_ID,
    body: r.body,
    metaTitle: r.meta_title,
    metaDescription: r.meta_description,
    slug: r.slug,
    status: ((r.status as ArticleStatus) ?? (r.published ? "published" : "draft")),
    scheduledFor: r.scheduled_for,
    publishedAt: r.published_at,
    publishedUrl: r.published_url,
    generatedAt: r.generated_at ?? undefined,
    verifiedLiveAt: r.verified_live_at,
    lastStatusCode: r.last_status_code,
    lastCheckedAt: r.last_checked_at,
  };
}

function draftToRow(d: ArticleDraft) {
  return {
    id: d.id,
    title: d.title,
    keyword: d.keyword,
    keyword_id: d.keywordId ?? null,
    service: d.service,
    project: d.project ?? PROJECT_ID,
    body: d.body,
    meta_title: d.metaTitle,
    meta_description: d.metaDescription,
    slug: d.slug,
    status: d.status,
    scheduled_for: d.scheduledFor ?? null,
    published_at: d.publishedAt ?? null,
    published_url: d.publishedUrl ?? null,
    published: d.status === "published",
    generated_at: d.generatedAt ?? null,
    verified_live_at: d.verifiedLiveAt ?? null,
    last_status_code: d.lastStatusCode ?? null,
    last_checked_at: d.lastCheckedAt ?? null,
  };
}

export async function fetchArticleDraft(id: string): Promise<ArticleDraft | null> {
  const { data, error } = await supabase
    .from("article_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDraft(data as Row) : null;
}

export async function fetchArticles(): Promise<ArticleDraft[]> {
  const { data, error } = await supabase
    .from("article_drafts")
    .select("*")
    .eq("project", PROJECT_ID)
    .order("scheduled_for", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDraft(r as Row));
}

export async function upsertArticleDraft(draft: ArticleDraft): Promise<void> {
  const { error } = await supabase
    .from("article_drafts")
    .upsert(draftToRow(draft), { onConflict: "id" });
  if (error) throw error;
}

export async function clearArticles(): Promise<void> {
  const { error } = await supabase
    .from("article_drafts")
    .delete()
    .eq("project", PROJECT_ID);
  if (error) throw error;
}

/** Build 12 scheduled article seeds from generated keywords. */
export function buildContentPlan(
  keywords: Keyword[],
  profile: BusinessProfile,
): ArticleDraft[] {
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
  const cap = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase());
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

export async function insertArticles(drafts: ArticleDraft[]): Promise<void> {
  if (!drafts.length) return;
  const { error } = await supabase
    .from("article_drafts")
    .insert(drafts.map(draftToRow));
  if (error) throw error;
}
