import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssessmentsInboxPage from "../AssessmentsInboxPage";
import WebLeadsPage from "../WebLeadsPage";

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

const webLead = {
  id: "lead-1",
  customerName: "Test Prospect",
  phone: "+12515550123",
  email: "prospect@example.com",
  business: "Test Prospect LLC",
  industry: "Pest Control",
  services: "Lead Recovery AI",
  packageLabel: "Growth Package",
  packageKey: "growth",
  note: "Need help recovering missed leads",
  status: "new",
  notes: null,
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
};

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  useApiFetch: () => apiFetch,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/contexts/theme-context", () => ({
  useTheme: () => ({
    colors: {
      card: "#0B1629",
      text: "#FFFFFF",
      text2: "#94A3B8",
      text3: "#64748B",
      border: "rgba(255,255,255,0.08)",
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === "/assessments" && !options) return { assessments };
    if (path === "/assessments/assessment-1" && options?.method === "PATCH") {
      return JSON.parse(String(options.body ?? "{}"));
    }
    if (path === "/leads/web" && !options) {
      return { leads: [webLead], stats: { total: 1, active: 1, thisMonth: 1 } };
    }
    if (path === "/leads/lead-1" && options?.method === "PATCH") {
      return { ...webLead, ...JSON.parse(String(options.body ?? "{}")) };
    }
    throw new Error(`Unexpected API call: ${path}`);
  });
});

async function openAssessment() {
  render(<AssessmentsInboxPage />);
  await waitFor(() => expect(screen.getByText("Test Business")).toBeTruthy());
  fireEvent.click(screen.getByText("Test Business"));
  await waitFor(() => expect(screen.getByText("Pipeline Actions")).toBeTruthy());
}

function renderWebLeads() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WebLeadsPage />
    </QueryClientProvider>,
  );
}

async function openWebLead() {
  renderWebLeads();
  await waitFor(() => expect(screen.getByText("Test Prospect")).toBeTruthy());
  fireEvent.click(screen.getByText("Test Prospect"));
  await waitFor(() => expect(screen.getByText("Update Status")).toBeTruthy());
}

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

describe("Revenue funnel persistence contract", () => {
  it("PATCHes the selected assessment when its pipeline status changes", async () => {
    await openAssessment();

    fireEvent.click(screen.getByRole("button", { name: "Mark Contacted" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/assessments/assessment-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "contacted" }),
      });
    });
  });

  it("PATCHes internal notes for the selected assessment", async () => {
    await openAssessment();

    fireEvent.click(screen.getByRole("button", { name: "+ Add Note" }));
    fireEvent.change(screen.getByPlaceholderText("Add notes about this lead..."), {
      target: { value: "Synthetic acceptance note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Notes" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/assessments/assessment-1", {
        method: "PATCH",
        body: JSON.stringify({ notes: "Synthetic acceptance note" }),
      });
    });
  });

  it("PATCHes the selected web lead when its status changes", async () => {
    await openWebLead();

    fireEvent.click(screen.getByRole("button", { name: "Contacted" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "contacted" }),
      });
    });
  });

  it("PATCHes internal notes for the selected web lead", async () => {
    await openWebLead();

    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.change(screen.getByPlaceholderText("Add internal notes about this lead…"), {
      target: { value: "Synthetic web-lead acceptance note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ notes: "Synthetic web-lead acceptance note" }),
      });
    });
  });
});
