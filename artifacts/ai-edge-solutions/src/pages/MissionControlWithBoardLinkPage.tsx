import { Link } from "wouter";
import { BrainCircuit } from "lucide-react";
import MissionControlPage from "./MissionControlPage";

export default function MissionControlWithBoardLinkPage() {
  return (
    <div style={{ position: "relative" }}>
      <Link
        href="/admin/mission-board"
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 100,
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          padding: "12px 16px",
          borderRadius: 999,
          background: "#00AEEF",
          color: "#030612",
          fontWeight: 900,
          fontSize: 13,
          textDecoration: "none",
          boxShadow: "0 10px 30px rgba(0,174,239,.3)",
        }}
      >
        <BrainCircuit size={17} />
        Open Mission Board
      </Link>
      <MissionControlPage />
    </div>
  );
}
