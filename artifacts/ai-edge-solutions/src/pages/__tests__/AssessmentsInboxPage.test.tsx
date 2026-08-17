import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  useApiFetch: () => apiFetch,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ assessments });
});

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

  it("does not show a failed status mutation as saved", async () => {
    apiFetch
      .mockResolvedValueOnce({ assessments })
      .mockRejectedValueOnce(new Error("persistence unavailable"));

    render(<AssessmentsInboxPage />);
    await waitFor(() => expect(screen.getByText("Test Business")).toBeTruthy());

    fireEvent.click(screen.getByText("Test Business"));
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Mark Contacted"));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Update was not saved"));
    expect(screen.getByText("Mark Contacted")).toBeTruthy();
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/assessments/assessment-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "contacted" }) }),
    );
  });
});
