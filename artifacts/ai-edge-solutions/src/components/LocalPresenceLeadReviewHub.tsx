import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type LeadReviewPlatform = "yelp" | "angi" | "thumbtack";

type LeadStatus = "won" | "lost" | "pending";

interface Lead {
  id: string;
  customerName: string;
  serviceType: string;
  quoteValue: number;
  status: LeadStatus;
  date: string;
  notes: string;
}

type ReviewResponseStatus = "pending" | "drafted" | "responded";

interface Review {
  id: string;
  reviewerName: string;
  stars: 1 | 2 | 3 | 4 | 5;
  text: string;
  reviewDate: string;
  responseStatus: ReviewResponseStatus;
  responseDraft: string;
}

// ── Platform config ───────────────────────────────────────────────────────────

interface PlatformConfig {
  label: string;
  accentColor: string;
  accentRgb: string;
  dashboardUrl: string;
}

const PLATFORM_CONFIG: Record<LeadReviewPlatform, PlatformConfig> = {
  yelp:      { label: "Yelp",      accentColor: "#D32323", accentRgb: "211,35,35",   dashboardUrl: "https://biz.yelp.com"         },
  angi:      { label: "Angi",      accentColor: "#E8330A", accentRgb: "232,51,10",   dashboardUrl: "https://pro.angi.com"         },
  thumbtack: { label: "Thumbtack", accentColor: "#009FD9", accentRgb: "0,159,217",   dashboardUrl: "https://www.thumbtack.com/pro" },
};

// ── Service types for BB&B ────────────────────────────────────────────────────

const SERVICE_TYPES = [
  "Bed Bug Inspection",
  "Bed Bug Heat Treatment",
  "Bed Bug Chemical Treatment",
  "Mosquito Control",
  "Wasp / Hornet Removal",
  "Cockroach Treatment",
  "Ant Treatment",
  "Rodent Control",
  "General Pest Control",
  "Other",
];

// ── AI response templates by star rating ──────────────────────────────────────

function generateResponseDraft(stars: number, reviewerName: string, platform: string): string {
  const name = reviewerName.trim() || "there";
  const templates: Record<number, string> = {
    5: `Thank you so much for your wonderful review, ${name}! We're thrilled to hear about your experience with Bed Bugs & Beyond. Our team takes real pride in providing effective, professional pest control throughout Baldwin County, and it means a lot to know we delivered for you. We appreciate your trust and look forward to serving you again whenever you need us!`,
    4: `Thank you for sharing your feedback, ${name}! We're glad your experience with Bed Bugs & Beyond was a positive one — we're always working to improve, and your comments help us do that. It was a pleasure serving you here in Baldwin County. Thank you for choosing us for your pest control needs, and don't hesitate to reach out if we can help again!`,
    3: `Thank you for your review, ${name}. We appreciate your honest feedback and are sorry your experience wasn't everything we'd hoped for. At Bed Bugs & Beyond, we hold ourselves to a high standard and we'd love the chance to make this right. Please feel free to reach out to us at (251) 324-9090 -- we're committed to your full satisfaction.`,
    2: `We're sorry to hear your experience didn't meet expectations, ${name}. This is not the standard of service Bed Bugs & Beyond strives for, and we take your feedback seriously. Please contact us at (251) 324-9090 -- we want to understand exactly what happened and work toward making it right for you. Thank you for giving us the opportunity to improve.`,
    1: `We sincerely apologize for your experience, ${name}. This falls well below the standard we hold ourselves to at Bed Bugs & Beyond, and we take this seriously. Please reach out to us directly at (251) 324-9090 so we can address your concerns personally and work toward a resolution. Thank you for bringing this to our attention.`,
  };
  return templates[stars] || templates[3];
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LEADS_KEY   = (p: LeadReviewPlatform) => `lpe_leads_${p}`;
const REVIEWS_KEY = (p: LeadReviewPlatform) => `lpe_reviews_${p}`;

function loadLeads(p: LeadReviewPlatform): Lead[] {
  try { return JSON.parse(localStorage.getItem(LEADS_KEY(p)) || "[]"); } catch { return []; }
}
function saveLeads(p: LeadReviewPlatform, data: Lead[]) {
  try { localStorage.setItem(LEADS_KEY(p), JSON.stringify(data)); } catch {}
}
function loadReviews(p: LeadReviewPlatform): Review[] {
  try { return JSON.parse(localStorage.getItem(REVIEWS_KEY(p)) || "[]"); } catch { return []; }
}
function saveReviews(p: LeadReviewPlatform, data: Review[]) {
  try { localStorage.setItem(REVIEWS_KEY(p), JSON.stringify(data)); } catch {}
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}
function isOverdue(r: Review) {
  if (r.responseStatus !== "pending") return false;
  return Date.now() - new Date(r.reviewDate).getTime() > 48 * 60 * 60 * 1000;
}

// ── Attribution Summary ───────────────────────────────────────────────────────

function AttributionSummary({ leads, accent }: { leads: Lead[]; accent: string }) {
  const won   = leads.filter(l => l.status === "won");
  const lost  = leads.filter(l => l.status === "lost");
  const total = leads.length;
  const closed = won.length + lost.length;
  const closeRate = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const revenue = won.reduce((s, l) => s + (l.quoteValue || 0), 0);
  const avgDeal = won.length > 0 ? Math.round(revenue / won.length) : 0;

  const stats = [
    { label: "Total Leads",  value: total,                            color: "#94A3B8" },
    { label: "Won",          value: won.length,                       color: "#22C55E" },
    { label: "Lost",         value: lost.length,                      color: "#EF4444" },
    { label: "Close Rate",   value: `${closeRate}%`,                  color: "#F59E0B" },
    { label: "Revenue Won",  value: `$${revenue.toLocaleString()}`,   color: "#22C55E" },
    { label: "Avg Deal",     value: avgDeal > 0 ? `$${avgDeal}` : "--", color: "#94A3B8" },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
    }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          padding: "10px 12px", borderRadius: 9, textAlign: "center",
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: 10.5, color: "#475569", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Stars display ─────────────────────────────────────────────────────────────

function Stars({ n }: { n: number }) {
  return (
    <span>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= n ? "#FBBF24" : "#334155", fontSize: 14 }}>&#9733;</span>
      ))}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const LEAD_STATUS_STYLE: Record<LeadStatus, { color: string; bg: string; border: string; label: string }> = {
  won:     { color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.28)",   label: "Won"     },
  lost:    { color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.28)",   label: "Lost"    },
  pending: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)",  label: "Pending" },
};

const REVIEW_STATUS_STYLE: Record<ReviewResponseStatus, { color: string; bg: string; border: string; label: string }> = {
  pending:   { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)",  label: "Needs Response" },
  drafted:   { color: "#60A5FA", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.25)",  label: "Draft Ready"    },
  responded: { color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.28)",   label: "Responded"      },
};

function SmallBadge({ color, bg, border, label }: { color: string; bg: string; border: string; label: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color, padding: "2px 8px",
      borderRadius: 5, background: bg, border: `1px solid ${border}`, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// ── Lead form ─────────────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "7px 10px", borderRadius: 7,
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#CBD5E1", fontSize: 12.5,
  outline: "none",
};
const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10.5, color: "#475569", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.05em", marginBottom: 4, display: "block",
};

interface LeadFormProps { onSave: (lead: Lead) => void; accent: string; accentRgb: string; }

function LeadForm({ onSave, accent, accentRgb }: LeadFormProps) {
  const [name,    setName]    = useState("");
  const [service, setService] = useState(SERVICE_TYPES[0]);
  const [quote,   setQuote]   = useState("");
  const [status,  setStatus]  = useState<LeadStatus>("pending");
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [notes,   setNotes]   = useState("");
  const [open,    setOpen]    = useState(false);

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      id: uid(), customerName: name.trim(), serviceType: service,
      quoteValue: parseFloat(quote) || 0, status, date, notes: notes.trim(),
    });
    setName(""); setQuote(""); setNotes(""); setStatus("pending");
    setDate(new Date().toISOString().slice(0, 10));
    setOpen(false);
  }

  const accentA = (a: number) => `rgba(${accentRgb},${a})`;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: "100%", padding: "9px 16px", borderRadius: 8,
        background: accentA(0.1), border: `1px dashed ${accentA(0.35)}`,
        color: accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
      }}>
        + Log New Lead
      </button>
    );
  }

  return (
    <div style={{
      borderRadius: 10, padding: 14,
      background: accentA(0.04), border: `1px solid ${accentA(0.2)}`,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1", marginBottom: 12 }}>New Lead</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={LABEL_STYLE}>Customer Name *</label>
          <input style={INPUT_STYLE} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div>
          <label style={LABEL_STYLE}>Service Type</label>
          <select style={{ ...INPUT_STYLE, cursor: "pointer" }} value={service} onChange={e => setService(e.target.value)}>
            {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>Quote Value ($)</label>
          <input style={INPUT_STYLE} type="number" value={quote} onChange={e => setQuote(e.target.value)} placeholder="0" min="0" />
        </div>
        <div>
          <label style={LABEL_STYLE}>Status</label>
          <select style={{ ...INPUT_STYLE, cursor: "pointer" }} value={status} onChange={e => setStatus(e.target.value as LeadStatus)}>
            <option value="pending">Pending</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>Date</label>
          <input style={INPUT_STYLE} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Notes</label>
          <input style={INPUT_STYLE} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={handleSave} style={{
          flex: 1, padding: "8px 14px", borderRadius: 7,
          background: accentA(0.15), border: `1px solid ${accentA(0.4)}`,
          color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>Save Lead</button>
        <button onClick={() => setOpen(false)} style={{
          padding: "8px 14px", borderRadius: 7,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Review form ───────────────────────────────────────────────────────────────

interface ReviewFormProps { onSave: (r: Review) => void; platform: LeadReviewPlatform; accent: string; accentRgb: string; }

function ReviewForm({ onSave, platform, accent, accentRgb }: ReviewFormProps) {
  const [open,        setOpen]        = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [stars,       setStars]       = useState<1|2|3|4|5>(5);
  const [text,        setText]        = useState("");
  const [reviewDate,  setReviewDate]  = useState(new Date().toISOString().slice(0, 10));

  const accentA = (a: number) => `rgba(${accentRgb},${a})`;

  function handleSave() {
    const draft = generateResponseDraft(stars, reviewerName, platform);
    onSave({
      id: uid(), reviewerName: reviewerName.trim() || "Anonymous",
      stars, text: text.trim(), reviewDate,
      responseStatus: "pending", responseDraft: draft,
    });
    setReviewerName(""); setText(""); setStars(5);
    setReviewDate(new Date().toISOString().slice(0, 10));
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: "100%", padding: "9px 16px", borderRadius: 8,
        background: accentA(0.1), border: `1px dashed ${accentA(0.35)}`,
        color: accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
      }}>
        + Log New Review
      </button>
    );
  }

  return (
    <div style={{
      borderRadius: 10, padding: 14,
      background: accentA(0.04), border: `1px solid ${accentA(0.2)}`,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1", marginBottom: 12 }}>New Review</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={LABEL_STYLE}>Reviewer Name</label>
          <input style={INPUT_STYLE} value={reviewerName} onChange={e => setReviewerName(e.target.value)} placeholder="Jane S." />
        </div>
        <div>
          <label style={LABEL_STYLE}>Review Date</label>
          <input style={INPUT_STYLE} type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Star Rating</label>
          <div style={{ display: "flex", gap: 6, paddingTop: 6 }}>
            {([1,2,3,4,5] as const).map(n => (
              <button key={n} onClick={() => setStars(n)} style={{
                fontSize: 20, cursor: "pointer", background: "none", border: "none", padding: 0,
                color: n <= stars ? "#FBBF24" : "#334155",
              }}>&#9733;</button>
            ))}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LABEL_STYLE}>Review Text</label>
          <textarea
            style={{ ...INPUT_STYLE, resize: "vertical", minHeight: 60 }}
            value={text} onChange={e => setText(e.target.value)}
            placeholder="Paste the review text here..."
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={handleSave} style={{
          flex: 1, padding: "8px 14px", borderRadius: 7,
          background: accentA(0.15), border: `1px solid ${accentA(0.4)}`,
          color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>Save Review</button>
        <button onClick={() => setOpen(false)} style={{
          padding: "8px 14px", borderRadius: 7,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({
  review, onStatusChange, onDelete, platform,
}: {
  review: Review;
  onStatusChange: (id: string, status: ReviewResponseStatus) => void;
  onDelete: (id: string) => void;
  platform: LeadReviewPlatform;
}) {
  const [showDraft,  setShowDraft]  = useState(false);
  const [draftText,  setDraftText]  = useState(review.responseDraft);
  const [copied,     setCopied]     = useState(false);
  const rs = REVIEW_STATUS_STYLE[review.responseStatus];
  const over = isOverdue(review);

  function handleCopy() {
    navigator.clipboard.writeText(draftText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  return (
    <div style={{
      borderRadius: 10, padding: "12px 14px",
      background: over && review.responseStatus === "pending"
        ? "rgba(245,158,11,0.04)"
        : "rgba(255,255,255,0.02)",
      border: over && review.responseStatus === "pending"
        ? "1px solid rgba(245,158,11,0.2)"
        : "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <Stars n={review.stars} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#CBD5E1" }}>{review.reviewerName}</span>
            <span style={{ fontSize: 11, color: "#475569" }}>{fmtDate(review.reviewDate)}</span>
            {over && review.responseStatus === "pending" && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", padding: "1px 6px", borderRadius: 4 }}>OVERDUE</span>
            )}
          </div>
          {review.text && (
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.55, marginBottom: 8 }}>
              {review.text.length > 200 ? review.text.slice(0, 200) + "..." : review.text}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <SmallBadge {...rs} />
          <button onClick={() => onDelete(review.id)} style={{
            fontSize: 11, color: "#475569", background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
          }}>&#x2715;</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {review.responseStatus !== "responded" && (
          <button onClick={() => setShowDraft(p => !p)} style={{
            fontSize: 11.5, fontWeight: 600, color: "#60A5FA", padding: "5px 10px",
            borderRadius: 6, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)",
            cursor: "pointer",
          }}>
            {showDraft ? "Hide Draft" : "View AI Draft"}
          </button>
        )}
        {review.responseStatus === "pending" && (
          <button onClick={() => onStatusChange(review.id, "drafted")} style={{
            fontSize: 11.5, fontWeight: 600, color: "#60A5FA", padding: "5px 10px",
            borderRadius: 6, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)",
            cursor: "pointer",
          }}>Mark Drafted</button>
        )}
        {review.responseStatus === "drafted" && (
          <button onClick={() => onStatusChange(review.id, "responded")} style={{
            fontSize: 11.5, fontWeight: 600, color: "#22C55E", padding: "5px 10px",
            borderRadius: 6, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
            cursor: "pointer",
          }}>Mark Responded</button>
        )}
        {review.responseStatus === "responded" && (
          <span style={{ fontSize: 11, color: "#22C55E" }}>Response posted</span>
        )}
      </div>

      {showDraft && (
        <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(96,165,250,0.15)" }}>
          <div style={{ padding: "7px 12px", background: "rgba(96,165,250,0.05)", borderBottom: "1px solid rgba(96,165,250,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#60A5FA" }}>AI-Drafted Response</span>
            <button onClick={handleCopy} style={{
              fontSize: 11, fontWeight: 600, color: copied ? "#22C55E" : "#60A5FA",
              background: "none", border: "none", cursor: "pointer",
            }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px", background: "rgba(0,0,0,0.15)",
              border: "none", color: "#CBD5E1", fontSize: 12, lineHeight: 1.6,
              resize: "vertical", minHeight: 100, outline: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type HubView = "leads" | "reviews" | "reminders";

interface LeadReviewHubTabProps {
  platform: LeadReviewPlatform;
}

export function LeadReviewHubTab({ platform }: LeadReviewHubTabProps) {
  const cfg = PLATFORM_CONFIG[platform];
  const [view,    setView]    = useState<HubView>("leads");
  const [leads,   setLeads]   = useState<Lead[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    setLeads(loadLeads(platform));
    setReviews(loadReviews(platform));
  }, [platform]);

  const accent    = cfg.accentColor;
  const accentRgb = cfg.accentRgb;
  const accentA   = (a: number) => `rgba(${accentRgb},${a})`;

  // ── Leads handlers ──
  const handleAddLead = useCallback((lead: Lead) => {
    setLeads(prev => { const next = [lead, ...prev]; saveLeads(platform, next); return next; });
  }, [platform]);

  const handleDeleteLead = useCallback((id: string) => {
    setLeads(prev => { const next = prev.filter(l => l.id !== id); saveLeads(platform, next); return next; });
  }, [platform]);

  const handleUpdateLeadStatus = useCallback((id: string, status: LeadStatus) => {
    setLeads(prev => {
      const next = prev.map(l => l.id === id ? { ...l, status } : l);
      saveLeads(platform, next);
      return next;
    });
  }, [platform]);

  // ── Reviews handlers ──
  const handleAddReview = useCallback((review: Review) => {
    setReviews(prev => { const next = [review, ...prev]; saveReviews(platform, next); return next; });
  }, [platform]);

  const handleReviewStatusChange = useCallback((id: string, status: ReviewResponseStatus) => {
    setReviews(prev => {
      const next = prev.map(r => r.id === id ? { ...r, responseStatus: status } : r);
      saveReviews(platform, next);
      return next;
    });
  }, [platform]);

  const handleDeleteReview = useCallback((id: string) => {
    setReviews(prev => { const next = prev.filter(r => r.id !== id); saveReviews(platform, next); return next; });
  }, [platform]);

  const overdueReviews = reviews.filter(isOverdue);

  const VIEWS: { key: HubView; label: string; badge?: number }[] = [
    { key: "leads",     label: "Lead Log",    badge: leads.length > 0 ? leads.length : undefined },
    { key: "reviews",   label: "Reviews",     badge: reviews.length > 0 ? reviews.length : undefined },
    { key: "reminders", label: "Reminders",   badge: overdueReviews.length > 0 ? overdueReviews.length : undefined },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Attribution summary */}
      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          padding: "9px 14px",
          background: accentA(0.06), borderBottom: "1px solid rgba(255,255,255,0.05)",
          fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          Attribution Summary
        </div>
        <div style={{ padding: 12 }}>
          <AttributionSummary leads={leads} accent={accent} />
        </div>
      </div>

      {/* Sub-navigation */}
      <div style={{ display: "flex", gap: 4, borderRadius: 9, background: "rgba(255,255,255,0.03)", padding: 4 }}>
        {VIEWS.map(v => {
          const isActive = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                flex: 1, padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                background: isActive ? accentA(0.15) : "transparent",
                color: isActive ? accent : "#64748B",
                border: isActive ? `1px solid ${accentA(0.3)}` : "1px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.15s",
              }}
            >
              {v.label}
              {v.badge !== undefined && (
                <span style={{
                  fontSize: 9.5, fontWeight: 800,
                  padding: "1px 5px", borderRadius: 4,
                  background: isActive ? accentA(0.2) : "rgba(255,255,255,0.06)",
                  color: isActive ? accent : "#475569",
                }}>{v.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Lead Log ── */}
      {view === "leads" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <LeadForm onSave={handleAddLead} accent={accent} accentRgb={accentRgb} />

          {leads.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#475569", fontSize: 12.5 }}>
              No leads logged yet. Add your first lead above.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {leads.map(lead => {
                const ls = LEAD_STATUS_STYLE[lead.status];
                return (
                  <div key={lead.id} style={{
                    borderRadius: 9, padding: "11px 13px",
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{lead.customerName}</span>
                          <SmallBadge {...ls} />
                        </div>
                        <div style={{ fontSize: 11.5, color: "#64748B" }}>
                          {lead.serviceType}
                          {lead.quoteValue > 0 && <span style={{ marginLeft: 10, color: "#94A3B8", fontWeight: 600 }}>${lead.quoteValue.toLocaleString()}</span>}
                          <span style={{ marginLeft: 10 }}>{fmtDate(lead.date)}</span>
                        </div>
                        {lead.notes && <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{lead.notes}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                        {lead.status === "pending" && (
                          <>
                            <button onClick={() => handleUpdateLeadStatus(lead.id, "won")} style={{
                              fontSize: 10.5, fontWeight: 700, color: "#22C55E", padding: "3px 8px",
                              borderRadius: 5, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
                              cursor: "pointer",
                            }}>Won</button>
                            <button onClick={() => handleUpdateLeadStatus(lead.id, "lost")} style={{
                              fontSize: 10.5, fontWeight: 700, color: "#EF4444", padding: "3px 8px",
                              borderRadius: 5, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                              cursor: "pointer",
                            }}>Lost</button>
                          </>
                        )}
                        <button onClick={() => handleDeleteLead(lead.id)} style={{
                          fontSize: 11, color: "#475569", background: "none", border: "none", cursor: "pointer",
                        }}>&#x2715;</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Reviews ── */}
      {view === "reviews" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ReviewForm onSave={handleAddReview} platform={platform} accent={accent} accentRgb={accentRgb} />

          {reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#475569", fontSize: 12.5 }}>
              No reviews logged yet. Add your first review above.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reviews.map(r => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  onStatusChange={handleReviewStatusChange}
                  onDelete={handleDeleteReview}
                  platform={platform}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reminders ── */}
      {view === "reminders" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {overdueReviews.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "28px 0",
              borderRadius: 10, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)",
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>&#x2705;</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#22C55E" }}>All caught up!</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>No overdue review responses.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "#F59E0B", fontWeight: 600, padding: "7px 12px", borderRadius: 7, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
                {overdueReviews.length} review{overdueReviews.length > 1 ? "s" : ""} need a response (logged more than 48 hours ago)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {overdueReviews.map(r => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    onStatusChange={handleReviewStatusChange}
                    onDelete={handleDeleteReview}
                    platform={platform}
                  />
                ))}
              </div>
            </>
          )}

          <a
            href={cfg.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", textAlign: "center",
              fontSize: 12.5, fontWeight: 700, color: accent,
              padding: "9px 0", borderRadius: 8,
              background: accentA(0.08), border: `1px solid ${accentA(0.25)}`,
              textDecoration: "none",
            }}
          >
            Open {cfg.label} Dashboard &#x2197;
          </a>
        </div>
      )}

    </div>
  );
}
