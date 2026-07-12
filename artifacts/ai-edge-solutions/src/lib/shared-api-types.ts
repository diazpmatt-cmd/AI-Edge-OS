export type { CIPeriod } from "./query-keys";

// ── Leads ─────────────────────────────────────────────────────────────────────
// Shape returned by rowToDto() in api-server/src/routes/leads.ts

export interface Lead {
  id: string;
  phone: string;
  clientName: string;
  source: string;
  customerName: string | null;
  message: string | null;
  eventType: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsStats {
  total: number;
  active: number;
  thisMonth: number;
  withMessages: number;
}

export interface LeadsResponse {
  leads: Lead[];
  stats: LeadsStats;
}

// ── Social Posts ──────────────────────────────────────────────────────────────
// Shape returned by rowToDto() in api-server/src/routes/social-posts.ts
// platforms is a parsed JSON string[] — not a raw string.

export interface SocialPost {
  id: string;
  platforms: string[];
  caption: string;
  captionFacebook: string | null;
  captionGoogle: string | null;
  scheduledAt: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

// ── Call Intelligence ─────────────────────────────────────────────────────────
// Shape returned by api-server/src/routes/call-intelligence.ts

export interface CIMetrics {
  total_calls: number;
  missed_calls: number;
  transferred_calls: number;
  sms_conversations: number;
  leads_captured: number;
  recovery_rate: number | null;
}

export interface CIActivity {
  id: string;
  timestamp: string;
  caller_number: string;
  call_type: string;
  outcome: string;
  duration_secs: number | null;
}

export interface CIResponse {
  metrics: CIMetrics;
  recent_activity: CIActivity[];
}
