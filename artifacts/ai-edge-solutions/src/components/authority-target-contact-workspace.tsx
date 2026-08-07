import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

type ContactMethod = "email" | "phone" | "contact_form" | "social" | "other";
type Verification = "unverified" | "human_verified" | "invalid";

interface ContactRecord {
  id: string;
  organizationName: string;
  contactName: string | null;
  roleTitle: string | null;
  contactMethod: ContactMethod;
  email: string | null;
  phone: string | null;
  contactUrl: string | null;
  sourceUrl: string | null;
  notes: string | null;
  verificationStatus: Verification;
  verifiedAt: string | null;
  verifiedBy: string | null;
  version: number;
}

interface ContactResponse {
  workflowStatus: "approved" | "pursuing";
  contacts: ContactRecord[];
  sendAvailable: false;
  automatedDiscoveryAvailable: false;
}

interface FormState {
  organizationName: string;
  contactName: string;
  roleTitle: string;
  contactMethod: ContactMethod;
  email: string;
  phone: string;
  contactUrl: string;
  sourceUrl: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  organizationName: "",
  contactName: "",
  roleTitle: "",
  contactMethod: "contact_form",
  email: "",
  phone: "",
  contactUrl: "",
  sourceUrl: "",
  notes: "",
};

function badgeColor(status: Verification): string {
  if (status === "human_verified") return "#22C55E";
  if (status === "invalid") return "#F87171";
  return "#F59E0B";
}

function toForm(contact: ContactRecord): FormState {
  return {
    organizationName: contact.organizationName,
    contactName: contact.contactName ?? "",
    roleTitle: contact.roleTitle ?? "",
    contactMethod: contact.contactMethod,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    contactUrl: contact.contactUrl ?? "",
    sourceUrl: contact.sourceUrl ?? "",
    notes: contact.notes ?? "",
  };
}

export function AuthorityTargetContactWorkspace({ opportunityId }: { opportunityId: string }) {
  const apiFetch = useApiFetch();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<ContactResponse>(
        `/backlinks/opportunities/${opportunityId}/target-contacts`,
      );
      setContacts(response.contacts ?? []);
    } catch (cause: unknown) {
      setContacts([]);
      setError(cause instanceof Error ? cause.message : "Failed to load target contacts");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        ...(editing ? { expectedVersion: editing.version } : {}),
      };
      await apiFetch(
        editing
          ? `/backlinks/opportunities/${opportunityId}/target-contacts/${editing.id}`
          : `/backlinks/opportunities/${opportunityId}/target-contacts`,
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      resetForm();
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to save target contact");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, editing, form, load, opportunityId]);

  const act = useCallback(async (contact: ContactRecord, action: "verify" | "invalidate" | "reopen") => {
    if (busy) return;
    if (action === "invalidate" && !window.confirm("Mark this contact path invalid? The record will be retained for audit history.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `/backlinks/opportunities/${opportunityId}/target-contacts/${contact.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({ action, expectedVersion: contact.version }),
        },
      );
      if (editing?.id === contact.id) resetForm();
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to update contact verification");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, editing?.id, load, opportunityId]);

  const field = (key: keyof FormState, placeholder: string, type = "text") => (
    <input
      type={type}
      value={form[key]}
      disabled={busy}
      placeholder={placeholder}
      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
      style={{
        width: "100%", boxSizing: "border-box", borderRadius: 7, padding: "7px 8px",
        color: "#E2E8F0", background: "rgba(3,6,18,0.82)", border: "1px solid rgba(255,255,255,0.08)",
        fontSize: 10, outline: "none",
      }}
    />
  );

  return (
    <section style={{
      background: "rgba(56,189,248,0.035)", border: "1px solid rgba(56,189,248,0.16)",
      borderRadius: 12, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#E2E8F0" }}>Target Contact Workspace</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
            Record and human-verify the best contact path. No automated discovery, enrichment, or delivery runs here.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 8.5, fontWeight: 900, color: "#F59E0B", border: "1px solid rgba(245,158,11,0.22)", background: "rgba(245,158,11,0.07)", borderRadius: 20, padding: "3px 8px" }}>
            MANUAL RESEARCH ONLY
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 900, color: "#F87171", border: "1px solid rgba(248,113,113,0.22)", background: "rgba(248,113,113,0.06)", borderRadius: 20, padding: "3px 8px" }}>
            NO SEND
          </span>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 10, padding: "8px 10px", fontSize: 10, color: "#FCA5A5", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 7 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7 }}>
        {field("organizationName", "Organization name")}
        {field("contactName", "Contact name (optional)")}
        {field("roleTitle", "Role/title (optional)")}
        <select
          value={form.contactMethod}
          disabled={busy}
          onChange={(event) => setForm((current) => ({ ...current, contactMethod: event.target.value as ContactMethod }))}
          style={{ width: "100%", borderRadius: 7, padding: "7px 8px", color: "#E2E8F0", background: "#071020", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10 }}
        >
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="contact_form">Contact Form</option>
          <option value="social">Social</option>
          <option value="other">Other</option>
        </select>
        {field("email", "Email (optional)", "email")}
        {field("phone", "Phone (optional)")}
        {field("contactUrl", "Contact/form/profile URL (optional)", "url")}
        {field("sourceUrl", "Source URL for verification", "url")}
      </div>
      <textarea
        value={form.notes}
        disabled={busy}
        placeholder="Research notes (optional)"
        maxLength={4000}
        rows={2}
        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        style={{ width: "100%", boxSizing: "border-box", marginTop: 7, borderRadius: 7, padding: 8, color: "#E2E8F0", background: "rgba(3,6,18,0.82)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10, fontFamily: "inherit", resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          disabled={busy}
          onClick={() => void save()}
          style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(56,189,248,0.28)", background: "rgba(56,189,248,0.09)", color: "#7DD3FC", fontSize: 9, fontWeight: 900, cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "Saving…" : editing ? "Save Contact Changes" : "Add Contact Path"}
        </button>
        {editing && (
          <button onClick={resetForm} disabled={busy} style={{ padding: "6px 9px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#94A3B8", fontSize: 9, cursor: "pointer" }}>
            Cancel Edit
          </button>
        )}
      </div>

      <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
        {loading ? (
          <div style={{ fontSize: 10, color: "#64748B" }}>⟳ Loading target contacts…</div>
        ) : contacts.length === 0 ? (
          <div style={{ fontSize: 10, color: "#64748B" }}>No contact path recorded yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {contacts.map((contact) => {
              const color = badgeColor(contact.verificationStatus);
              return (
                <div key={contact.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "9px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#CBD5E1" }}>
                        {contact.organizationName}{contact.contactName ? ` · ${contact.contactName}` : ""}
                      </div>
                      <div style={{ fontSize: 9, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
                        {contact.roleTitle ? `${contact.roleTitle} · ` : ""}{contact.contactMethod}
                        {contact.email ? ` · ${contact.email}` : ""}
                        {contact.phone ? ` · ${contact.phone}` : ""}
                        {contact.contactUrl ? ` · ${contact.contactUrl}` : ""}
                      </div>
                      {contact.sourceUrl && <div style={{ fontSize: 8.5, color: "#475569", marginTop: 2 }}>Source: {contact.sourceUrl}</div>}
                    </div>
                    <span style={{ height: "fit-content", fontSize: 8.5, fontWeight: 900, color, border: `1px solid ${color}33`, background: `${color}10`, borderRadius: 20, padding: "2px 7px" }}>
                      {contact.verificationStatus.replace("_", " ")} · v{contact.version}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                    {contact.verificationStatus !== "invalid" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditing(contact);
                          setForm(toForm(contact));
                        }}
                        style={{ padding: "4px 7px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(148,163,184,0.05)", color: "#94A3B8", fontSize: 8.5, cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    )}
                    {contact.verificationStatus === "unverified" && (
                      <button disabled={busy} onClick={() => void act(contact, "verify")} style={{ padding: "4px 7px", borderRadius: 6, border: "1px solid rgba(34,197,94,0.22)", background: "rgba(34,197,94,0.07)", color: "#86EFAC", fontSize: 8.5, fontWeight: 800, cursor: "pointer" }}>
                        Human Verify
                      </button>
                    )}
                    {contact.verificationStatus !== "invalid" && (
                      <button disabled={busy} onClick={() => void act(contact, "invalidate")} style={{ padding: "4px 7px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.18)", background: "rgba(239,68,68,0.05)", color: "#FCA5A5", fontSize: 8.5, cursor: "pointer" }}>
                        Mark Invalid
                      </button>
                    )}
                    {contact.verificationStatus === "invalid" && (
                      <button disabled={busy} onClick={() => void act(contact, "reopen")} style={{ padding: "4px 7px", borderRadius: 6, border: "1px solid rgba(167,139,250,0.22)", background: "rgba(167,139,250,0.07)", color: "#C4B5FD", fontSize: 8.5, cursor: "pointer" }}>
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
