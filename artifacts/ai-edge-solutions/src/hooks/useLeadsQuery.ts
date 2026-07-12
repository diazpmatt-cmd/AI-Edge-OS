import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { LeadsResponse } from "@/lib/shared-api-types";

export function useLeadsQuery(
  options?: Omit<UseQueryOptions<LeadsResponse>, "queryKey" | "queryFn">,
) {
  const authFetch = useApiFetch();
  return useQuery<LeadsResponse>({
    queryKey: queryKeys.leads.all,
    queryFn: () => authFetch<LeadsResponse>("/leads"),
    staleTime: 30_000,
    ...options,
  });
}
