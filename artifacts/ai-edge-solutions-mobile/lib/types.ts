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
  generatedAt?: string | null;
};

export type ArticleAsset = {
  id: string;
  articleId: string;
  channel: string;
  body: string;
  status: string;
  publishedUrl?: string | null;
  publishedAt?: string | null;
  errorMessage?: string | null;
  updatedAt: string;
};

export type SocialConnection = {
  id: string;
  provider: string;
  accountName?: string | null;
  accountId?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};
