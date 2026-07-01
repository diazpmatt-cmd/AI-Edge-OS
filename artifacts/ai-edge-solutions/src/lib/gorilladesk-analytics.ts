import { useState, useEffect, useRef } from "react";
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
  data_source?: string;
};

export type JobsAnalytics = {
  total: number;
  completed: number;
  incomplete: number;
  completion_rate: number;
  by_status: Record<string, number>;
  data_source?: string;
};

export type CustomersAnalytics = {
  new_customers: number | null;
  returning_customers: number | null;
  active_services: number;
  recurring_services: number;
  period: string;
  data_source?: string;
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
  data_source?: string;
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
  data_source?: string;
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
  // Store latest apiFetch in a ref so the effect dependency is stable
  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  const [state, setState] = useState<FetchState>({ data: EMPTY, loading: true, error: null });
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    setState(s => ({ ...s, loading: true, error: null }));

    const fn = apiFetchRef.current;
    Promise.all([
      fn<RevenueAnalytics>("/analytics/gorilladesk/revenue"),
      fn<JobsAnalytics>("/analytics/gorilladesk/jobs"),
      fn<CustomersAnalytics>("/analytics/gorilladesk/customers"),
      fn<MarketingAnalytics>("/analytics/gorilladesk/marketing"),
      fn<PaymentsAnalytics>("/analytics/gorilladesk/payments"),
    ])
      .then(([revenue, jobs, customers, marketing, payments]) => {
        setState({ data: { revenue, jobs, customers, marketing, payments }, loading: false, error: null });
      })
      .catch(err => {
        setState({ data: EMPTY, loading: false, error: err instanceof Error ? err.message : "Failed to load analytics" });
      });
  }, []); // runs once on mount

  const reload = () => {
    loadedRef.current = false;
    setState({ data: EMPTY, loading: true, error: null });
    const fn = apiFetchRef.current;
    Promise.all([
      fn<RevenueAnalytics>("/analytics/gorilladesk/revenue"),
      fn<JobsAnalytics>("/analytics/gorilladesk/jobs"),
      fn<CustomersAnalytics>("/analytics/gorilladesk/customers"),
      fn<MarketingAnalytics>("/analytics/gorilladesk/marketing"),
      fn<PaymentsAnalytics>("/analytics/gorilladesk/payments"),
    ])
      .then(([revenue, jobs, customers, marketing, payments]) => {
        setState({ data: { revenue, jobs, customers, marketing, payments }, loading: false, error: null });
        loadedRef.current = true;
      })
      .catch(err => {
        setState({ data: EMPTY, loading: false, error: err instanceof Error ? err.message : "Failed to load analytics" });
        loadedRef.current = true;
      });
  };

  return { ...state, reload };
}
