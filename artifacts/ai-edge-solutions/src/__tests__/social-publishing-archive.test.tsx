import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authFetch = vi.fn(() => Promise.resolve({}));
const invalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "social-posts") return { data: fixtures, isLoading: false };
    if (queryKey[0] === "social_connections") return { data: [], isLoading: false };
    return { data: undefined, isLoading: false };
  },
  useMutation: (options: { mutationFn: (value: unknown) => Promise<unknown>; onSuccess?: (value: unknown) => void }) => ({
    isPending: false,
    mutate: (value: unknown) => {
      void options.mutationFn(value).then(result => options.onSuccess?.(result));
    },
  }),
}));
vi.mock("@/lib/api", () => ({ useApiFetch: () => authFetch }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/contexts/theme-context", () => ({ useTheme: () => ({ colors: { text: "#fff", text2: "#cbd5e1" } }) }));
vi.mock("wouter", () => ({ useSearch: () => "", useLocation: () => ["/admin/social-publishing", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/MediaUploader", () => ({ MediaUploader: () => null }));
vi.mock("@/components/PlatformStateChip", () => ({ PlatformStateChip: () => null, resolvePlatformUIState: vi.fn() }));

import SocialPublishingPage, {
  isPostArchivable,
  postsForPublishingView,
  publishingActivityPosts,
  type SocialPost,
} from "../pages/SocialPublishingPage";

function makePost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "active-post",
    clientName: "Bed Bugs & Beyond",
    platforms: ["facebook"],
    imageUrl: null,
    mediaFilename: null,
    mediaMimeType: null,
    mediaFileSize: null,
    videoUrl: null,
    audioUrl: null,
    youtubeTitle: null,
    youtubePrivacy: null,
    youtubeVideoId: null,
    caption: "Active furniture treatment post",
    captionFacebook: null,
    captionGoogle: null,
    ctaType: "none",
    ctaValue: null,
    scheduledAt: null,
    status: "published",
    publishedAt: "2026-07-29T12:00:00.000Z",
    errorMessage: null,
    aiCity: "Foley",
    aiTopic: "Furniture treatment",
    aiAngle: null,
    contentScore: null,
    matchedImageId: null,
    matchedImageUrl: null,
    matchedImageScore: null,
    impressions: null,
    reach: null,
    clicks: null,
    likes: null,
    comments: null,
    shares: null,
    engagementScore: null,
    archivedAt: null,
    archivedBy: null,
    createdAt: "2026-07-28T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
    ...overrides,
  };
}

const fixtures: SocialPost[] = [
  makePost(),
  makePost({
    id: "archived-post",
    caption: "Archived fumigation post",
    aiTopic: "Archived fumigation evidence",
    status: "failed",
    publishedAt: null,
    errorMessage: "Provider warning retained",
    archivedAt: "2026-07-30T12:00:00.000Z",
    archivedBy: "user-1",
    updatedAt: "2026-07-30T12:00:00.000Z",
  }),
];

describe("Publishing Center archive projection", () => {
  beforeEach(() => {
    authFetch.mockClear();
    invalidateQueries.mockClear();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("separates active and archived lists without removing archived publish history", () => {
    expect(postsForPublishingView(fixtures, "active").map(post => post.id)).toEqual(["active-post"]);
    expect(postsForPublishingView(fixtures, "archived").map(post => post.id)).toEqual(["archived-post"]);

    const activity = publishingActivityPosts(fixtures);
    expect(activity.map(post => post.id)).toEqual(["archived-post", "active-post"]);
    expect(activity[0]).toMatchObject({
      status: "failed",
      errorMessage: "Provider warning retained",
      archivedAt: "2026-07-30T12:00:00.000Z",
    });
  });

  it("allows archive only for draft and terminal statuses", () => {
    expect(["draft", "published", "partial", "failed", "cancelled"].every(isPostArchivable)).toBe(true);
    expect(["queued", "approved", "scheduled", "publishing"].some(isPostArchivable)).toBe(false);
  });

  it("renders Active by default, exposes Archived and Restore, and keeps Delete separate", async () => {
    render(<SocialPublishingPage />);

    expect(screen.getByRole("tab", { name: "Active (1)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Active furniture treatment post")).toBeTruthy();
    expect(screen.queryByText("Archived fumigation post")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Archived (1)" }));
    expect(screen.getByText("Archived fumigation post")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete post permanently" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(authFetch).toHaveBeenCalledWith(
      "/social-posts/archived-post/restore",
      { method: "POST", body: "{}" },
    ));
  });

  it("uses the archive endpoint without invoking delete and emphasizes client and platform names", async () => {
    render(<SocialPublishingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(authFetch).toHaveBeenCalledWith(
      "/social-posts/active-post/archive",
      { method: "POST", body: "{}" },
    ));
    expect(authFetch).not.toHaveBeenCalledWith("/social-posts/active-post", expect.objectContaining({ method: "DELETE" }));

    const clientName = screen.getAllByText("Bed Bugs & Beyond")[0];
    expect((clientName as HTMLElement).style.fontWeight).toBe("700");
    expect(Array.from(document.querySelectorAll("span")).some(node =>
      node.textContent?.endsWith("Facebook") && node.style.fontWeight === "800",
    )).toBe(true);
  });
});
