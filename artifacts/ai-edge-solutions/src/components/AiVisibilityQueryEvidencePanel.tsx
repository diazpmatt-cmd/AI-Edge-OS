import React, { useState } from "react";

// ── Local types (mirror API response shape) ───────────────────────────────────

export interface QEScan {
  id: string;
  clientId: string;
  status: string;
  provider: string;
  model: string;
  queryCount: number;
  completedCount: number;
  mentionCount: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface QECompetitorMention {
  name: string;
  domain: string | null;
  mentionType: string;
  position: number | null;
}

export interface QECitation {
  url: string;
  domain: string;
  title: string | null;
  position: number | null;
}

export interface QEResult {
  id: string;
  scanId: string;
  clientId: string;
  query: string;
  provider: string;
  model: string;
  responseText: string | null;
  latencyMs: number | null;
  generatedAt: string | null;
  success: boolean;
  failureReason: string | null;
  businessMentioned: boolean;
  mentionType: string | null;
  mentionPosition: number | null;
  competitorMentions: readonly QECompetitorMention[];
  citations: readonly QECitation[];
  createdAt: string;
}

// ── Pure helper functions (exported for testing) ──────────────────────────────

export function getMentionBadgeConfig(mentioned: boolean, mentionType: string | null): {
  label: string; color: string; bg: string;
} {
  if (!mentioned) return { label: "Not mentioned", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
  switch (mentionType) {
    case "exact":      return { label: "Exact match",      color: "#22C55E", bg: "rgba(34,197,94,0.12)" };
    case "normalized": return { label: "Fuzzy match",      color: "#84CC16", bg: "rgba(132,204,22,0.12)" };
    case "domain":     return { label: "Domain match",     color: "#3B82F6", bg: "rgba(59,130,246,0.12)" };
    case "phone":      return { label: "Phone match",      color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" };
    default:           return { label: "Not mentioned",    color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
  }
}

export function getFailureLabel(reason: string | null): string {
  switch (reason) {
    case "timeout":            return "Timed out";
    case "auth_failure":       return "Auth failure";
    case "rate_limit":         return "Rate limited";
    case "malformed_response": return "Malformed response";
    case "not_configured":     return "Provider not configured";
    case "provider_error":     return "Provider error";
    default:                   return reason ?? "Unknown error";
  }
}

export function formatScanTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function getScanStatusConfig(status: string): { label: string; color: string } {
  switch (status) {
    case "completed": return { label: "Completed", color: "#22C55E" };
    case "running":   return { label: "Running",   color: "#F59E0B" };
    case "failed":    return { label: "Failed",    color: "#EF4444" };
    default:          return { label: status,      color: "#9CA3AF" };
  }
}

export function computeScanMentionRate(scan: QEScan): string {
  if (!scan.completedCount) return "0%";
  return `${Math.round((scan.mentionCount / scan.completedCount) * 100)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface QueryResultCardProps {
  result: QEResult;
  isDark: boolean;
  index: number;
}

function QueryResultCard({ result, isDark, index }: QueryResultCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const badge = getMentionBadgeConfig(result.businessMentioned, result.mentionType);
  const cardBg = isDark ? "#0F1629" : "#F9FAFB";
  const borderColor = result.businessMentioned
    ? "rgba(34,197,94,0.3)"
    : isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      background: cardBg,
      overflow: "hidden",
      marginBottom: 8,
    }}>
      {/* Card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Index */}
        <span style={{
          minWidth: 24, height: 24, borderRadius: "50%",
          background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 600, color: isDark ? "#9CA3AF" : "#6B7280",
          flexShrink: 0,
        }}>
          {index + 1}
        </span>

        {/* Query text */}
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: isDark ? "#E2E8F0" : "#1F2937" }}>
          "{result.query}"
        </span>

        {/* Status */}
        {!result.success ? (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
            color: "#F59E0B", background: "rgba(245,158,11,0.12)", flexShrink: 0,
          }}>
            {getFailureLabel(result.failureReason)}
          </span>
        ) : (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
            color: badge.color, background: badge.bg, flexShrink: 0,
          }}>
            {badge.label}
          </span>
        )}

        {/* Chevron */}
        <span style={{ color: isDark ? "#475569" : "#9CA3AF", fontSize: 12, flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, padding: "12px 16px" }}>
          {/* Meta row */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: isDark ? "#64748B" : "#9CA3AF" }}>
              Provider: <strong style={{ color: isDark ? "#94A3B8" : "#374151" }}>{result.provider}/{result.model}</strong>
            </span>
            {result.latencyMs !== null && (
              <span style={{ fontSize: 12, color: isDark ? "#64748B" : "#9CA3AF" }}>
                Latency: <strong style={{ color: isDark ? "#94A3B8" : "#374151" }}>{result.latencyMs}ms</strong>
              </span>
            )}
            {result.generatedAt && (
              <span style={{ fontSize: 12, color: isDark ? "#64748B" : "#9CA3AF" }}>
                At: <strong style={{ color: isDark ? "#94A3B8" : "#374151" }}>{formatScanTimestamp(result.generatedAt)}</strong>
              </span>
            )}
          </div>

          {/* Competitor mentions */}
          {result.competitorMentions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#94A3B8" : "#374151", marginBottom: 4 }}>
                Competitors mentioned ({result.competitorMentions.length}):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.competitorMentions.map((c, i) => (
                  <span key={i} style={{
                    fontSize: 12, padding: "2px 8px", borderRadius: 4,
                    color: "#F87171", background: "rgba(248,113,113,0.12)",
                  }}>
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Citations */}
          {result.citations.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#94A3B8" : "#374151", marginBottom: 4 }}>
                Citations ({result.citations.length}):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.citations.map((c, i) => (
                  <span key={i} style={{
                    fontSize: 12, padding: "2px 8px", borderRadius: 4,
                    color: "#60A5FA", background: "rgba(96,165,250,0.12)",
                  }}>
                    {c.domain}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Response text */}
          {result.responseText && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#94A3B8" : "#374151", marginBottom: 4 }}>
                AI Response:
              </div>
              <div style={{
                fontSize: 12, color: isDark ? "#64748B" : "#6B7280",
                background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)",
                borderRadius: 6, padding: "8px 12px",
                maxHeight: 160, overflowY: "auto",
                lineHeight: 1.6, fontFamily: "monospace",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {result.responseText}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel component ───────────────────────────────────────────────────────

interface AiVisibilityQueryEvidencePanelProps {
  scan: QEScan | null;
  results: readonly QEResult[];
  isLoading: boolean;
  error: string | null;
  clientId: string;
  onRunScan: () => void;
  isDark: boolean;
}

export default function AiVisibilityQueryEvidencePanel({
  scan,
  results,
  isLoading,
  error,
  clientId,
  onRunScan,
  isDark,
}: AiVisibilityQueryEvidencePanelProps): React.ReactElement {
  const panelBg    = isDark ? "#0B1120" : "#FFFFFF";
  const cardBg     = isDark ? "#0F1629" : "#F9FAFB";
  const textPrim   = isDark ? "#E2E8F0" : "#1F2937";
  const textMuted  = isDark ? "#64748B" : "#9CA3AF";
  const borderCol  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const blue       = "#00AEEF";

  const statusCfg = scan ? getScanStatusConfig(scan.status) : null;
  const mentionRate = scan ? computeScanMentionRate(scan) : null;

  return (
    <div style={{ padding: "0 0 32px 0" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: textPrim }}>
            AI Query Evidence
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: textMuted }}>
            Live queries sent to AI providers — detects whether your business is cited.
          </p>
        </div>
        <button
          onClick={onRunScan}
          disabled={isLoading}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: isLoading ? (isDark ? "#1E293B" : "#E5E7EB") : blue,
            color: isLoading ? textMuted : "#FFFFFF",
            fontWeight: 600, fontSize: 14, cursor: isLoading ? "not-allowed" : "pointer",
            transition: "opacity 0.2s",
          }}
        >
          {isLoading ? "Running scan…" : "Run AI Query Scan"}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 8, padding: "12px 16px", marginBottom: 16,
          color: "#EF4444", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {isLoading && !scan && (
        <div style={{
          background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 10,
          padding: "32px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 14, color: textMuted }}>
            Querying AI providers — this may take 15–60 seconds…
          </div>
        </div>
      )}

      {/* ── No scan yet ── */}
      {!isLoading && !scan && !error && (
        <div style={{
          background: cardBg, border: `1px dashed ${borderCol}`, borderRadius: 10,
          padding: "40px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: textPrim, marginBottom: 6 }}>
            No AI query scan yet
          </div>
          <div style={{ fontSize: 13, color: textMuted, maxWidth: 420, margin: "0 auto 20px" }}>
            Run a scan to find out whether AI search engines (ChatGPT, Gemini, Claude)
            mention your business when users search for your services locally.
          </div>
          <button
            onClick={onRunScan}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: blue, color: "#FFFFFF", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}
          >
            Run First Scan
          </button>
        </div>
      )}

      {/* ── Scan summary card ── */}
      {scan && (
        <div style={{
          background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 10,
          padding: "16px 20px", marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: textPrim }}>
              Latest Scan
            </span>
            {statusCfg && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                color: statusCfg.color, background: `${statusCfg.color}20`,
              }}>
                {statusCfg.label}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
            {[
              { label: "Provider", value: `${scan.provider}` },
              { label: "Model", value: scan.model },
              { label: "Queries run", value: `${scan.completedCount} / ${scan.queryCount}` },
              { label: "Business cited", value: `${scan.mentionCount} (${mentionRate})` },
              { label: "Scan date", value: formatScanTimestamp(scan.completedAt ?? scan.startedAt) },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: 2 }}>{stat.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: textPrim }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {scan.error && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#F87171" }}>
              Error: {scan.error}
            </div>
          )}
        </div>
      )}

      {/* ── Individual results ── */}
      {results.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: textMuted, marginBottom: 10 }}>
            Query results ({results.length})
          </div>
          {results.map((result, i) => (
            <QueryResultCard key={result.id} result={result} isDark={isDark} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
