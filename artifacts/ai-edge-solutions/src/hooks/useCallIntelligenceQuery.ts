import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CIResponse, CIPeriod } from "@/lib/shared-api-types";

export function useCallIntelligenceQuery(
  period: CIPeriod,
  options?: Omit<UseQueryOptions<CIResponse>, "queryKey" | "queryFn">,
) {
  const authFetch = useApiFetch();
  return useQuery<CIResponse>({
    queryKey: queryKeys.callIntelligence.period(period),
    queryFn: () => authFetch<CIResponse>(`/call-intelligence?period=${period}`),
    staleTime: 30_000,
    ...options,
  });
}
