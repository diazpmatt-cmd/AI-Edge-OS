import { useState, useEffect, useRef, useCallback } from "react";
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

export type SyncResult = {
  ok: boolean;
  synced_at: string;
  customers_total: number;
  customers_active: number;
  new_this_month: number;
  lead_sources: number;
  period: string;
};

type FetchState = {
  data: GorilladeskAnalytics;
  loading: boolean;
  error: string | null;
  syncing: boolean;
  lastSyncedAt: string | null;
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
  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  const [state, setState] = useState<FetchState>({
    data: EMPTY,
    loading: true,
    error: null,
    syncing: false,
    lastSyncedAt: null,
  });
  const loadedRef = useRef(false);

  const fetchAll = useCallback(() => {
    const fn = apiFetchRef.current;
    return Promise.all([
      fn<RevenueAnalytics>("/analytics/gorilladesk/revenue"),
      fn<JobsAnalytics>("/analytics/gorilladesk/jobs"),
      fn<CustomersAnalytics>("/analytics/gorilladesk/customers"),
      fn<MarketingAnalytics>("/analytics/gorilladesk/marketing"),
      fn<PaymentsAnalytics>("/analytics/gorilladesk/payments"),
    ]).then(([revenue, jobs, customers, marketing, payments]) => ({
      revenue, jobs, customers, marketing, payments,
    }));
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    setState(s => ({ ...s, loading: true, error: null }));

    fetchAll()
      .then(data => setState(s => ({ ...s, data, loading: false, error: null })))
      .catch(err => setState(s => ({
        ...s,
        data: EMPTY,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load analytics",
      })));
  }, [fetchAll]);

  const reload = useCallback(() => {
    loadedRef.current = false;
    setState(s => ({ ...s, data: EMPTY, loading: true, error: null }));

    fetchAll()
      .then(data => {
        loadedRef.current = true;
        setState(s => ({ ...s, data, loading: false, error: null }));
      })
      .catch(err => {
        loadedRef.current = true;
        setState(s => ({
          ...s,
          data: EMPTY,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load analytics",
        }));
      });
  }, [fetchAll]);

  const syncFromGorillaDesk = useCallback(async (): Promise<SyncResult | null> => {
    setState(s => ({ ...s, syncing: true }));
    try {
      const fn = apiFetchRef.current;
      const result = await fn<SyncResult>("/analytics/gorilladesk/sync", {
        method: "POST",
      });
      // Reload analytics data after sync
      const data = await fetchAll();
      setState(s => ({
        ...s,
        data,
        syncing: false,
        lastSyncedAt: result.synced_at,
        loading: false,
        error: null,
      }));
      loadedRef.current = true;
      return result;
    } catch (err) {
      setState(s => ({ ...s, syncing: false }));
      throw err;
    }
  }, [fetchAll]);

  return { ...state, reload, syncFromGorillaDesk };
}
