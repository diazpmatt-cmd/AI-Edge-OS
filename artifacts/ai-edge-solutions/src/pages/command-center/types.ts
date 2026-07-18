export type HealthStatus = "healthy" | "warning" | "critical" | "pending" | "setup-required";

export interface KpiCardDef {
  id: string;
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
  status: HealthStatus;
  link?: string;
  loading?: boolean;
  error?: boolean;
  setupRequired?: boolean;
  color: string;
}

export interface ActionItem {
  id: string;
  title: string;
  reason: string;
  impact: "high" | "medium" | "low";
  urgency: "urgent" | "today" | "this-week";
  module: string;
  link: string;
  type: "content" | "lead" | "review" | "fix" | "opportunity";
}

export interface HealthRow {
  id: string;
  label: string;
  status: HealthStatus;
  score?: number;
  explanation: string;
  action?: string;
  link?: string;
}

export interface ActivityEntry {
  id: string;
  ts: string;
  description: string;
  status: "success" | "pending" | "failed";
  module: string;
  link?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  source: string;
  impact: string;
  effort: "low" | "medium" | "high";
  confidence: "high" | "medium" | "low";
  action: string;
  link: string;
  color: string;
}
