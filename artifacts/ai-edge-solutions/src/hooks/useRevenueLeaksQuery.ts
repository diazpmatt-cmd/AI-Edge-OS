import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RevenueLeaksResponse } from "@/lib/shared-api-types";

export function useRevenueLeaksQuery(
  options?: Omit<UseQueryOptions<RevenueLeaksResponse>, "queryKey" | "queryFn">,
) {
  const authFetch = useApiFetch();
  return useQuery<RevenueLeaksResponse>({
    queryKey: queryKeys.revenueLeaks.all,
    queryFn: () => authFetch<RevenueLeaksResponse>("/revenue-leaks"),
    staleTime: 30_000,
    ...options,
  });
}
