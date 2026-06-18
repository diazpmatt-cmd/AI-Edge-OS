export type BusinessProfile = {
  businessName: string;
  websiteUrl: string;
  industry: string;
  city: string;
  state: string;
  mainServices: string;
  targetCustomers: string;
};

export const PROJECT_ID = "bed-bugs-and-beyond";

export const DEMO_PROFILE: BusinessProfile = {
  businessName: "Bed Bugs and Beyond",
  websiteUrl: "https://bedbugsandbeyond.net",
  industry: "Pest Control",
  city: "Foley",
  state: "Alabama",
  mainServices:
    "Bed bug extermination, mosquito treatment, rodent removal, roach control, residential & commercial pest control",
  targetCustomers:
    "Homeowners, landlords, hotels, restaurants, and property managers across Baldwin County",
};

const KEY = "aies.profile";

export function loadProfile(): BusinessProfile {
  if (typeof window === "undefined") return DEMO_PROFILE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEMO_PROFILE;
    return { ...DEMO_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEMO_PROFILE;
  }
}

export function saveProfile(p: BusinessProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export type Keyword = {
  id: string;
  keyword: string;
  volume: number;
  difficulty: "Low" | "Medium" | "High";
  intent: "Local" | "Commercial" | "Informational" | "Transactional";
  service: string;
  city: string;
  state: string;
};

export type ArticleStatus =
  | "draft"
  | "scheduled"
  | "ready_for_website"
  | "published"
  | "published_error";

export type ArticleDraft = {
  id: string;
  title: string;
  keyword: string;
  keywordId?: string | null;
  service: string;
  project: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  status: ArticleStatus;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  publishedUrl?: string | null;
  generatedAt?: string;
  verifiedLiveAt?: string | null;
  lastStatusCode?: number | null;
  lastCheckedAt?: string | null;
};

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Extract hostname from a URL string, normalized (lowercase, no `www.`). */
export function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Returns true if the URL's host matches the project website's host. */
export function domainMatches(url: string, projectWebsiteUrl: string): boolean {
  const a = extractDomain(url);
  const b = extractDomain(projectWebsiteUrl);
  return !!a && !!b && a === b;
}

/**
 * Rewrite a URL so its origin matches the project website, preserving the
 * existing path, query, and hash. Slugs are NOT modified.
 */
export function rewriteUrlDomain(url: string, projectWebsiteUrl: string): string {
  try {
    const target = new URL(
      projectWebsiteUrl.includes("://") ? projectWebsiteUrl : `https://${projectWebsiteUrl}`,
    );
    const existing = new URL(url.includes("://") ? url : `https://${url}`);
    return `${target.origin}${existing.pathname}${existing.search}${existing.hash}`;
  } catch {
    return url;
  }
}
