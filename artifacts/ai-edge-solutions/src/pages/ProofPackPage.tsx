import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

type Metric = { availability: "available" | "partial" | "unavailable"; value: number | null; unit: "count" | "currency" | "rating" | "percent"; verification: string; source: string; observedAt: string | null; explanation: string | null };
type Pack = { generatedAt: string; period: { from: string; toExclusive: string }; privacy: { aggregateOnly: boolean; containsPii: boolean }; leadSources: Array<{ source: string; count: number }>; metrics: Record<string, Metric>; revenueLeaks: { total: number; revenueRisks: number; proofGaps: number } };

const labels: Record<string, string> = { leadsCaptured: "Leads captured", missedCalls: "Missed calls", successfulRecovery: "Successful recovery", customerResponses: "Customer responses", bookings: "Bookings", completedJobs: "Completed jobs", verifiedRevenue: "Verified revenue", attributableRevenue: "Verified attributable revenue", observedAttributableRevenue: "Observed attribution (unverified)", reviewsObserved: "Reviews observed", averageRating: "Average rating", referralsCreated: "Referrals created", referralRevenue: "Referral revenue", contentCreated: "Content created", contentPublished: "Content published", unresolvedRevenueLeaks: "Unresolved revenue leaks" };
function value(metric: Metric) { if (metric.value == null) return "Unavailable"; if (metric.unit === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(metric.value); return metric.unit === "rating" ? metric.value.toFixed(2) : String(metric.value); }

export default function ProofPackPage() {
  const apiFetch = useApiFetch();
  const { data, isLoading, error } = useQuery({ queryKey: ["proof-pack"], queryFn: () => apiFetch<Pack>("/proof-pack") });
  return <AppShell><section style={{ color: "#E2E8F0" }}>
    <p style={{ color: "#34D399", fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>Revenue Proof</p>
    <h1 style={{ margin: "4px 0 8px", fontSize: 30 }}>Proof Pack</h1>
    <p style={{ color: "#94A3B8", maxWidth: 760 }}>Aggregate-only, tenant-scoped evidence. Unsupported outcomes remain explicitly unavailable.</p>
    {isLoading && <div role="status" style={{ padding: 28 }}>Loading evidence…</div>}
    {error && <div role="alert" style={{ padding: 20, border: "1px solid #7F1D1D", borderRadius: 12, color: "#FCA5A5" }}>Proof Pack is unavailable. No values were inferred.</div>}
    {data && <>
      <div style={{ margin: "20px 0", padding: 14, border: "1px solid #1E3A5F", borderRadius: 12, background: "#071426", color: "#94A3B8", fontSize: 12 }}>Period: {new Date(data.period.from).toLocaleDateString()}–{new Date(new Date(data.period.toExclusive).getTime() - 1).toLocaleDateString()} · Generated {new Date(data.generatedAt).toLocaleString()} · No PII included</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {Object.entries(data.metrics).map(([key, metric]) => <article key={key} style={{ padding: 16, borderRadius: 12, border: `1px solid ${metric.availability === "unavailable" ? "#4B5563" : "#164E63"}`, background: "#081221" }}>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>{labels[key] ?? key}</div><div style={{ fontSize: 24, fontWeight: 800, margin: "8px 0" }}>{value(metric)}</div>
          <div style={{ fontSize: 11, color: metric.verification === "verified" ? "#34D399" : "#64748B" }}>{metric.verification.replaceAll("_", " ")} · {metric.source}</div>
          {metric.explanation && <p style={{ color: "#94A3B8", fontSize: 11, lineHeight: 1.5 }}>{metric.explanation}</p>}
        </article>)}
      </div>
      <h2 style={{ marginTop: 28 }}>Leads by source</h2>
      {data.leadSources.length ? <ul>{data.leadSources.map(row => <li key={row.source}>{row.source}: {row.count}</li>)}</ul> : <p style={{ color: "#94A3B8" }}>No tenant-scoped leads were observed in this period.</p>}
    </>}
  </section></AppShell>;
}
