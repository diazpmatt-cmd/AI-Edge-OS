import { useState, useEffect } from "react";
import { useApiFetch } from "./api";

export type InsightSeverity = "critical" | "warning" | "opportunity" | "info";

export type Insight = {
  id:                 string;
  title:              string;
  severity:           InsightSeverity;
  explanation:        string;
  recommended_action: string;
  source_data:        Record<string, unknown>;
  is_estimate:        boolean;
  data_available:     boolean;
};

export type InsightsResult = {
  insights:        Insight[];
  generated_at:    string;
  data_sources:    string[];
  missing_sources: string[];
};

export function useInsights() {
  const apiFetch = useApiFetch();

  const [insights,     setInsights]     = useState<Insight[]>([]);
  const [generatedAt,  setGeneratedAt]  = useState<string | null>(null);
  const [dataSources,  setDataSources]  = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<InsightsResult>("/analytics/insights")
      .then(result => {
        if (cancelled) return;
        setInsights(result.insights ?? []);
        setGeneratedAt(result.generated_at ?? null);
        setDataSources(result.data_sources ?? []);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load insights");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [apiFetch]);

  return { insights, generatedAt, dataSources, loading, error };
}
