import { useState, useEffect, useCallback } from "react";
import { useApiFetch } from "./api";

export type RevenueAnalytics = {
  monthly_revenue: number;
  collected_revenue: number;
  outstanding_revenue: number;
  avg_ticket: number;
  monthly_revenue_fmt: string;
  collected_revenue_fmt: string;
  outstanding_revenue_fmt: string;
  avg_ticket_fmt: string;
  period: string;
};

export type JobsAnalytics = {
  total: number;
  completed: number;
  incomplete: number;
  completion_rate: number;
  by_status: Record<string, number>;
};

export type CustomersAnalytics = {
  new_customers: number;
  returning_customers: number;
  active_services: number;
  recurring_services: number;
  period: string;
};

export type LeadSource = {
  name: string;
  job_count: number;
  revenue: number;
  revenue_fmt: string;
};

export type MarketingAnalytics = {
  lead_sources: LeadSource[];
  period: string;
};

export type PaymentBreakdown = {
  method: string;
  count: number;
  amount: number;
  amount_fmt: string;
};

export type PaymentsAnalytics = {
  breakdown: PaymentBreakdown[];
  total: number;
  total_fmt: string;
};

export type GorilladeskAnalytics = {
  revenue: RevenueAnalytics | null;
  jobs: JobsAnalytics | null;
  customers: CustomersAnalytics | null;
  marketing: MarketingAnalytics | null;
  payments: PaymentsAnalytics | null;
};

type FetchState = {
  data: GorilladeskAnalytics;
  loading: boolean;
  error: string | null;
};

const EMPTY: GorilladeskAnalytics = {
  revenue: null,
  jobs: null,
  customers: null,
  marketing: null,
  payments: null,
};

export function useGorilladeskAnalytics() {
  const apiFetch = useApiFetch();
  const [state, setState] = useState<FetchState>({ data: EMPTY, loading: true, error: null });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [revenue, jobs, customers, marketing, payments] = await Promise.all([
        apiFetch<RevenueAnalytics>("/analytics/gorilladesk/revenue"),
        apiFetch<JobsAnalytics>("/analytics/gorilladesk/jobs"),
        apiFetch<CustomersAnalytics>("/analytics/gorilladesk/customers"),
        apiFetch<MarketingAnalytics>("/analytics/gorilladesk/marketing"),
        apiFetch<PaymentsAnalytics>("/analytics/gorilladesk/payments"),
      ]);
      setState({ data: { revenue, jobs, customers, marketing, payments }, loading: false, error: null });
    } catch (err) {
      setState({ data: EMPTY, loading: false, error: err instanceof Error ? err.message : "Failed to load analytics" });
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
