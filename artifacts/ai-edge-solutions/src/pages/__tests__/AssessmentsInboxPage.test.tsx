import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AssessmentsInboxPage from "../AssessmentsInboxPage";

const assessments = [
  {
    id: "assessment-1",
    businessName: "Test Business",
    industry: "Pest Control",
    city: "Gulf Shores",
    state: "AL",
    websiteUrl: null,
    gbpUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    contactName: "Test Person",
    contactEmail: "test@example.com",
    contactPhone: null,
    contactMethod: "email",
    scoreOverall: 42,
    scoreLeadRecovery: 40,
    scoreLocalPresence: 42,
    scoreAiVisibility: 39,
    scoreReviewStrength: 46,
    status: "new",
    notes: null,
    createdAt: "2026-08-12T12:00:00.000Z",
  },
];

const apiFetch = vi.fn().mockResolvedValue({ assessments });

vi.mock("@/lib/api", () => ({
  useApiFetch: () => apiFetch,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe("AssessmentsInboxPage truthful pipeline summaries", () => {
  it("uses existing lead stages and counts without fabricated monetary values", async () => {
    render(<AssessmentsInboxPage />);

    await waitFor(() => expect(screen.getByText("Test Business")).toBeTruthy());

    const pageText = document.body.textContent ?? "";
    expect(screen.getByText("Active Leads")).toBeTruthy();
    expect(screen.getByText("Lead Stage Snapshot")).toBeTruthy();
    expect(screen.getByText("Pipeline Summary")).toBeTruthy();
    expect(pageText).not.toContain("Revenue Pipeline");
    expect(pageText).not.toContain("Revenue Forecast");
    expect(pageText).not.toMatch(/\$[\d,]+/);
    expect(pageText).not.toContain("Apple Business Connect");
    expect(pageText).not.toContain("missing schema markup");
  });
});
