import { useCallback, useEffect, useMemo, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface ReferralProgramOption {
  id: number;
  name: string;
  status: string;
}

interface InvitationTemplate {
  id: number;
  name: string;
  channel: "sms" | "email";
  subject: string | null;
  body: string;
  followUpBody: string | null;
  followUpDelayDays: number;
  status: "active" | "archived";
}

interface ReferralInvitation {
  id: string;
  programName: string;
  templateName: string | null;
  channel: "sms" | "email";
  recipientName: string;
  recipientDestination: string;
  subject: string | null;
  initialMessage: string;
  followUpMessage: string | null;
  followUpDelayDays: number;
  status: "draft" | "approved" | "cancelled" | "suppressed";
  deliveryState: "not_dispatched";
  consentSource: string;
  consentAt: string;
  createdAt: string;
  suppressionReason: string | null;
}

interface ReferralInvitationsPanelProps {
  programs: ReferralProgramOption[];
}

const panelStyle = {
  background: "rgba(11,22,41,0.85)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 12,
  padding: 18,
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(3,6,18,0.72)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#E2E8F0",
  fontSize: 12,
} as const;

const labelStyle = {
  display: "block",
  color: "#94A3B8",
  fontSize: 10,
  fontWeight: 700,
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.4px",
} as const;

function localDateTimeValue(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

function invitationIdempotencyKey(): string {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `referral-invite:${id}`;
}

function invitationStatusColor(status: ReferralInvitation["status"]): string {
  if (status === "draft") return "#F59E0B";
  if (status === "approved") return "#38BDF8";
  if (status === "suppressed") return "#F87171";
  return "#64748B";
}

export function ReferralInvitationsPanel({
  programs,
}: ReferralInvitationsPanelProps) {
  const apiFetch = useApiFetch();
  const activePrograms = useMemo(
    () => programs.filter((program) => program.status === "active"),
    [programs],
  );
  const [templates, setTemplates] = useState<InvitationTemplate[]>([]);
  const [invitations, setInvitations] = useState<ReferralInvitation[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showInvitationForm, setShowInvitationForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    channel: "sms" as "sms" | "email",
    subject: "",
    body: "Hi {{first_name}}, {{business_name}} has a referral program you can share with friends and neighbors: {{referral_link}}",
    followUpBody:
      "Hi {{first_name}}, here is your {{business_name}} referral link again: {{referral_link}}",
    followUpDelayDays: "3",
  });
  const [invitationForm, setInvitationForm] = useState({
    programId: "",
    templateId: "",
    channel: "sms" as "sms" | "email",
    recipientName: "",
    recipientPhone: "",
    recipientEmail: "",
    subject: "",
    initialMessage: "",
    followUpMessage: "",
    followUpDelayDays: "3",
    consentConfirmed: false,
    consentSource: "written_form",
    consentAt: localDateTimeValue(),
  });

  const loadInvitationData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [templateRows, invitationResponse] = await Promise.all([
        apiFetch<InvitationTemplate[]>("/referrals/invitation-templates"),
        apiFetch<{ sendingEnabled: false; invitations: ReferralInvitation[] }>(
          "/referrals/invitations",
        ),
      ]);
      setTemplates(templateRows);
      setInvitations(invitationResponse.invitations);
    } catch {
      setError("Invitation data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadInvitationData();
  }, [loadInvitationData]);

  const activeTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          template.status === "active" &&
          template.channel === invitationForm.channel,
      ),
    [templates, invitationForm.channel],
  );

  const createTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/referrals/invitation-templates", {
        method: "POST",
        body: JSON.stringify({
          ...templateForm,
          subject:
            templateForm.channel === "email" ? templateForm.subject : null,
          followUpDelayDays: Number(templateForm.followUpDelayDays),
        }),
      });
      setShowTemplateForm(false);
      setNotice("Invitation template saved.");
      await loadInvitationData();
    } catch {
      setError("The invitation template could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const createInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/referrals/invitations", {
        method: "POST",
        body: JSON.stringify({
          programId: Number(invitationForm.programId),
          templateId: invitationForm.templateId
            ? Number(invitationForm.templateId)
            : null,
          channel: invitationForm.channel,
          recipientName: invitationForm.recipientName,
          recipientPhone:
            invitationForm.channel === "sms"
              ? invitationForm.recipientPhone
              : null,
          recipientEmail:
            invitationForm.channel === "email"
              ? invitationForm.recipientEmail
              : null,
          subject: invitationForm.templateId
            ? null
            : invitationForm.subject || null,
          initialMessage: invitationForm.templateId
            ? null
            : invitationForm.initialMessage || null,
          followUpMessage: invitationForm.templateId
            ? null
            : invitationForm.followUpMessage || null,
          followUpDelayDays: Number(invitationForm.followUpDelayDays),
          consentConfirmed: invitationForm.consentConfirmed,
          consentSource: invitationForm.consentSource,
          consentAt: new Date(invitationForm.consentAt).toISOString(),
          idempotencyKey: invitationIdempotencyKey(),
        }),
      });
      setShowInvitationForm(false);
      setInvitationForm((current) => ({
        ...current,
        recipientName: "",
        recipientPhone: "",
        recipientEmail: "",
        consentConfirmed: false,
        consentAt: localDateTimeValue(),
      }));
      setNotice("Draft created. Nothing was sent.");
      await loadInvitationData();
    } catch {
      setError(
        "The draft was blocked. Check consent, contact details, duplicates, or suppression status.",
      );
    } finally {
      setSaving(false);
    }
  };

  const approveInvitation = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/referrals/invitations/${id}/approve`, {
        method: "POST",
      });
      setNotice(
        "Invitation approved for a future delivery phase. Nothing was sent.",
      );
      await loadInvitationData();
    } catch {
      setError(
        "This invitation could not be approved. It may be suppressed or no longer a draft.",
      );
    }
  };

  const cancelInvitation = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/referrals/invitations/${id}/cancel`, { method: "POST" });
      setNotice("Invitation cancelled.");
      await loadInvitationData();
    } catch {
      setError("This invitation could not be cancelled.");
    }
  };

  const suppressContact = async (invitation: ReferralInvitation) => {
    const confirmed = window.confirm(
      `Suppress ${invitation.recipientDestination} from future referral invitations? No message will be sent.`,
    );
    if (!confirmed) return;
    setError("");
    try {
      await apiFetch("/referrals/contact-preferences/opt-out", {
        method: "POST",
        body: JSON.stringify({
          channel: invitation.channel,
          destination: invitation.recipientDestination,
          reason: "Suppressed by an authenticated administrator.",
        }),
      });
      setNotice("Contact suppressed and matching pending invitations blocked.");
      await loadInvitationData();
    } catch {
      setError("The contact could not be suppressed.");
    }
  };

  return (
    <section
      aria-labelledby="referral-invitations-heading"
      style={{ display: "grid", gap: 14 }}
    >
      <div
        role="status"
        style={{
          border: "1px solid rgba(245,158,11,0.32)",
          background: "rgba(245,158,11,0.08)",
          borderRadius: 10,
          padding: "12px 14px",
          color: "#FBBF24",
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        <strong>Preparation mode:</strong> real SMS and email delivery is
        disabled. Drafting and approval never call Telnyx, an email provider, or
        a scheduler.
      </div>

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          style={{
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 11,
            color: error ? "#F87171" : "#22C55E",
            background: error
              ? "rgba(248,113,113,0.08)"
              : "rgba(34,197,94,0.08)",
            border: `1px solid ${error ? "rgba(248,113,113,0.2)" : "rgba(34,197,94,0.2)"}`,
          }}
        >
          {error || notice}
        </div>
      )}

      <div
        style={{
          ...panelStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            id="referral-invitations-heading"
            style={{ margin: 0, color: "#E2E8F0", fontSize: 15 }}
          >
            Invitation &amp; Follow-Up Queue
          </h2>
          <div style={{ color: "#64748B", fontSize: 10, marginTop: 3 }}>
            Consent-first drafts, human approval, duplicate protection, and
            opt-out suppression.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowTemplateForm((value) => !value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(56,189,248,0.25)",
              background: "rgba(56,189,248,0.08)",
              color: "#38BDF8",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            + Template
          </button>
          <button
            type="button"
            onClick={() => {
              setInvitationForm((current) => ({
                ...current,
                programId:
                  current.programId || String(activePrograms[0]?.id ?? ""),
                templateId: "",
              }));
              setShowInvitationForm((value) => !value);
            }}
            disabled={activePrograms.length === 0}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(34,197,94,0.3)",
              background: "rgba(34,197,94,0.1)",
              color: activePrograms.length ? "#22C55E" : "#475569",
              cursor: activePrograms.length ? "pointer" : "not-allowed",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            + Invitation Draft
          </button>
        </div>
      </div>

      {showTemplateForm && (
        <form
          onSubmit={createTemplate}
          style={{ ...panelStyle, display: "grid", gap: 12 }}
        >
          <h3 style={{ margin: 0, color: "#CBD5E1", fontSize: 13 }}>
            New reusable template
          </h3>
          <div
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}
          >
            <label>
              <span style={labelStyle}>Template name</span>
              <input
                required
                value={templateForm.name}
                onChange={(event) =>
                  setTemplateForm((form) => ({
                    ...form,
                    name: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Channel</span>
              <select
                value={templateForm.channel}
                onChange={(event) =>
                  setTemplateForm((form) => ({
                    ...form,
                    channel: event.target.value as "sms" | "email",
                  }))
                }
                style={inputStyle}
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </label>
          </div>
          {templateForm.channel === "email" && (
            <label>
              <span style={labelStyle}>Email subject</span>
              <input
                required
                value={templateForm.subject}
                onChange={(event) =>
                  setTemplateForm((form) => ({
                    ...form,
                    subject: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
          )}
          <label>
            <span style={labelStyle}>Initial message</span>
            <textarea
              required
              value={templateForm.body}
              onChange={(event) =>
                setTemplateForm((form) => ({
                  ...form,
                  body: event.target.value,
                }))
              }
              style={{ ...inputStyle, minHeight: 76 }}
            />
          </label>
          <div
            style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10 }}
          >
            <label>
              <span style={labelStyle}>Follow-up message</span>
              <textarea
                value={templateForm.followUpBody}
                onChange={(event) =>
                  setTemplateForm((form) => ({
                    ...form,
                    followUpBody: event.target.value,
                  }))
                }
                style={{ ...inputStyle, minHeight: 76 }}
              />
            </label>
            <label>
              <span style={labelStyle}>Delay (days)</span>
              <input
                type="number"
                min="1"
                max="30"
                required
                value={templateForm.followUpDelayDays}
                onChange={(event) =>
                  setTemplateForm((form) => ({
                    ...form,
                    followUpDelayDays: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
          </div>
          <div style={{ color: "#64748B", fontSize: 10 }}>
            Allowed tokens: <code>{"{{first_name}}"}</code>,{" "}
            <code>{"{{business_name}}"}</code>,{" "}
            <code>{"{{referral_link}}"}</code>
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              ...inputStyle,
              cursor: "pointer",
              color: "#22C55E",
              fontWeight: 700,
            }}
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </form>
      )}

      {showInvitationForm && (
        <form
          onSubmit={createInvitation}
          style={{ ...panelStyle, display: "grid", gap: 12 }}
        >
          <h3 style={{ margin: 0, color: "#CBD5E1", fontSize: 13 }}>
            Create invitation draft
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            <label>
              <span style={labelStyle}>Program</span>
              <select
                required
                value={invitationForm.programId}
                onChange={(event) =>
                  setInvitationForm((form) => ({
                    ...form,
                    programId: event.target.value,
                  }))
                }
                style={inputStyle}
              >
                <option value="">Select</option>
                {activePrograms.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Channel</span>
              <select
                value={invitationForm.channel}
                onChange={(event) =>
                  setInvitationForm((form) => ({
                    ...form,
                    channel: event.target.value as "sms" | "email",
                    templateId: "",
                  }))
                }
                style={inputStyle}
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label>
              <span style={labelStyle}>Template</span>
              <select
                value={invitationForm.templateId}
                onChange={(event) =>
                  setInvitationForm((form) => ({
                    ...form,
                    templateId: event.target.value,
                  }))
                }
                style={inputStyle}
              >
                <option value="">Custom message</option>
                {activeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <label>
              <span style={labelStyle}>Customer name</span>
              <input
                required
                value={invitationForm.recipientName}
                onChange={(event) =>
                  setInvitationForm((form) => ({
                    ...form,
                    recipientName: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>
                {invitationForm.channel === "sms" ? "Mobile phone" : "Email"}
              </span>
              <input
                required
                type={invitationForm.channel === "email" ? "email" : "tel"}
                value={
                  invitationForm.channel === "sms"
                    ? invitationForm.recipientPhone
                    : invitationForm.recipientEmail
                }
                onChange={(event) =>
                  setInvitationForm((form) =>
                    invitationForm.channel === "sms"
                      ? { ...form, recipientPhone: event.target.value }
                      : { ...form, recipientEmail: event.target.value },
                  )
                }
                style={inputStyle}
              />
            </label>
          </div>
          {!invitationForm.templateId && (
            <>
              {invitationForm.channel === "email" && (
                <label>
                  <span style={labelStyle}>Email subject</span>
                  <input
                    required
                    value={invitationForm.subject}
                    onChange={(event) =>
                      setInvitationForm((form) => ({
                        ...form,
                        subject: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </label>
              )}
              <label>
                <span style={labelStyle}>Initial message</span>
                <textarea
                  required
                  value={invitationForm.initialMessage}
                  onChange={(event) =>
                    setInvitationForm((form) => ({
                      ...form,
                      initialMessage: event.target.value,
                    }))
                  }
                  style={{ ...inputStyle, minHeight: 72 }}
                />
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "3fr 1fr",
                  gap: 10,
                }}
              >
                <label>
                  <span style={labelStyle}>Follow-up message</span>
                  <textarea
                    value={invitationForm.followUpMessage}
                    onChange={(event) =>
                      setInvitationForm((form) => ({
                        ...form,
                        followUpMessage: event.target.value,
                      }))
                    }
                    style={{ ...inputStyle, minHeight: 72 }}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Delay (days)</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={invitationForm.followUpDelayDays}
                    onChange={(event) =>
                      setInvitationForm((form) => ({
                        ...form,
                        followUpDelayDays: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </label>
              </div>
            </>
          )}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <label>
              <span style={labelStyle}>Consent source</span>
              <select
                value={invitationForm.consentSource}
                onChange={(event) =>
                  setInvitationForm((form) => ({
                    ...form,
                    consentSource: event.target.value,
                  }))
                }
                style={inputStyle}
              >
                <option value="written_form">Written form</option>
                <option value="web_form">Web form</option>
                <option value="customer_request">Customer request</option>
                <option value="service_agreement">Service agreement</option>
                <option value="other_documented">
                  Other documented consent
                </option>
              </select>
            </label>
            <label>
              <span style={labelStyle}>Consent recorded at</span>
              <input
                type="datetime-local"
                required
                value={invitationForm.consentAt}
                onChange={(event) =>
                  setInvitationForm((form) => ({
                    ...form,
                    consentAt: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </label>
          </div>
          <label
            style={{
              color: "#CBD5E1",
              fontSize: 11,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <input
              type="checkbox"
              checked={invitationForm.consentConfirmed}
              onChange={(event) =>
                setInvitationForm((form) => ({
                  ...form,
                  consentConfirmed: event.target.checked,
                }))
              }
              required
            />
            I confirm this customer explicitly consented to receive
            referral-program invitations through this channel.
          </label>
          <button
            type="submit"
            disabled={saving}
            style={{
              ...inputStyle,
              cursor: "pointer",
              color: "#22C55E",
              fontWeight: 700,
            }}
          >
            {saving ? "Creating…" : "Create draft — do not send"}
          </button>
        </form>
      )}

      <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 14px",
            color: "#94A3B8",
            fontSize: 10,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {loading
            ? "Loading…"
            : `${invitations.length} invitation record${invitations.length === 1 ? "" : "s"}`}
        </div>
        {!loading && invitations.length === 0 && (
          <div
            style={{
              padding: 24,
              color: "#475569",
              textAlign: "center",
              fontSize: 11,
            }}
          >
            No invitation drafts yet. Create a template, then prepare the first
            consent-backed draft.
          </div>
        )}
        {invitations.map((invitation) => {
          const color = invitationStatusColor(invitation.status);
          return (
            <article
              key={invitation.id}
              style={{
                padding: "13px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700 }}
                  >
                    {invitation.channel === "sms" ? "💬" : "✉️"}{" "}
                    {invitation.recipientName}
                  </div>
                  <div style={{ color: "#64748B", fontSize: 9, marginTop: 2 }}>
                    {invitation.recipientDestination} · {invitation.programName}{" "}
                    · consent: {invitation.consentSource.replaceAll("_", " ")}
                  </div>
                </div>
                <span
                  style={{
                    color,
                    border: `1px solid ${color}40`,
                    background: `${color}12`,
                    borderRadius: 20,
                    padding: "3px 8px",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {invitation.status.toUpperCase()} · NOT DISPATCHED
                </span>
              </div>
              <div style={{ color: "#94A3B8", fontSize: 10, lineHeight: 1.5 }}>
                {invitation.initialMessage}
              </div>
              {invitation.followUpMessage && (
                <div style={{ color: "#64748B", fontSize: 9 }}>
                  Follow-up prepared for {invitation.followUpDelayDays} days
                  after a future initial delivery.
                </div>
              )}
              {(invitation.status === "draft" ||
                invitation.status === "approved") && (
                <div
                  style={{
                    display: "flex",
                    gap: 7,
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {invitation.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => void approveInvitation(invitation.id)}
                      style={{
                        ...inputStyle,
                        width: "auto",
                        color: "#38BDF8",
                        cursor: "pointer",
                      }}
                    >
                      Approve — no send
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void suppressContact(invitation)}
                    style={{
                      ...inputStyle,
                      width: "auto",
                      color: "#F87171",
                      cursor: "pointer",
                    }}
                  >
                    Suppress contact
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancelInvitation(invitation.id)}
                    style={{
                      ...inputStyle,
                      width: "auto",
                      color: "#94A3B8",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
