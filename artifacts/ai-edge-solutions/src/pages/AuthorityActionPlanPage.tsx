import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthorityActionPlanPanel } from "@/components/authority-action-plan-panel";
import { AuthorityOutreachDraftReview } from "@/components/authority-outreach-draft-review";
import { AuthorityOutreachReadinessCard } from "@/components/authority-outreach-readiness-card";
import { AuthorityTargetContactWorkspace } from "@/components/authority-target-contact-workspace";
import { AuthorityWorkflowQueue } from "@/components/authority-workflow-queue";

export default function AuthorityActionPlanPage() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [draftOpportunityId, setDraftOpportunityId] = useState<string | null>(null);
  const refresh = () => {
    setDraftOpportunityId(null);
    setRefreshVersion((version) => version + 1);
  };

  return (
    <AppShell>
      <div style={{ minHeight: "100vh", background: "#030612", padding: "28px 24px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{
              display: "inline-block", fontSize: 9, fontWeight: 800, letterSpacing: "0.8px",
              color: "#38BDF8", background: "rgba(56,189,248,0.1)",
              border: "1px solid rgba(56,189,248,0.25)", borderRadius: 5, padding: "2px 8px",
              marginBottom: 6,
            }}>
              AUTHORITY ENGINE
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "#F1F5F9", margin: 0 }}>
              Live Action Plan
            </h1>
            <p style={{ fontSize: 12, color: "#64748B", margin: "6px 0 0", lineHeight: 1.6 }}>
              Tenant-scoped authority opportunities ranked from persisted discovery evidence, value, and attainability.
            </p>
          </div>

          <AuthorityWorkflowQueue
            key={`workflow-${refreshVersion}`}
            onChanged={refresh}
            onDraft={setDraftOpportunityId}
          />
          {draftOpportunityId && (
            <>
              <AuthorityOutreachReadinessCard opportunityId={draftOpportunityId} />
              <AuthorityOutreachDraftReview
                opportunityId={draftOpportunityId}
                onClose={() => setDraftOpportunityId(null)}
              />
              <AuthorityTargetContactWorkspace opportunityId={draftOpportunityId} />
            </>
          )}
          <AuthorityActionPlanPanel
            key={`plan-${refreshVersion}`}
            onViewBacklinks={() => {
              window.location.href = "/admin/authority-engine";
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
