import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { SocialPost } from "@/lib/shared-api-types";

export function useSocialPostsQuery(
  options?: Omit<UseQueryOptions<SocialPost[]>, "queryKey" | "queryFn">,
) {
  const authFetch = useApiFetch();
  return useQuery<SocialPost[]>({
    queryKey: queryKeys.socialPosts.all,
    queryFn: () => authFetch<SocialPost[]>("/social-posts"),
    staleTime: 30_000,
    ...options,
  });
}
