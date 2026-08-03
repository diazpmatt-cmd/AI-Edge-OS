import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";
import MissionBoardPage from "./MissionBoardPage";

export default function MissionBoardWithApprovalLinkPage() {
  return <div style={{ position: "relative" }}>
    <MissionBoardPage />
    <Link href="/admin/approval-inbox" style={{
      position: "fixed", right: 24, bottom: 24, zIndex: 50,
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "#0A1930", color: "#FBBF24",
      border: "1px solid rgba(251,191,36,.55)", borderRadius: 999,
      padding: "11px 16px", fontSize: 12, fontWeight: 900,
      textDecoration: "none", boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    }}><ShieldCheck size={16}/> Open Approval Inbox</Link>
  </div>;
}
