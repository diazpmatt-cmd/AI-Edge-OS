import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReviewsEnginePage from "../ReviewsEnginePage";

const apiFetchMock = vi.fn();

vi.mock("../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/theme-context", () => ({
  useTheme: () => ({ colors: { text: "#fff", text2: "#94A3B8" } }),
}));

vi.mock("../../lib/api", () => ({
  useApiFetch: () => apiFetchMock,
}));

const overview = {
  clientId: "client-1",
  clientSlug: "bbb",
  clientName: "Bed Bugs & Beyond",
  source: "tenant_safe_review_summaries",
  automationStatus: "not_activated",
  summaries: [],
};

function configuration(status: "not_configured" | "owner_confirmed") {
  return {
    clientId: "client-1",
    clientSlug: "bbb",
    clientName: "Bed Bugs & Beyond",
    configuration: {
      status,
      reviewUrl: status === "owner_confirmed" ? "https://g.page/r/test-review" : null,
      confirmedAt: status === "owner_confirmed" ? "2026-08-13T03:00:00.000Z" : null,
    },
    sendPathStatus: "not_accepted",
    automationStatus: "not_activated",
  };
}

function eligibility(configured: boolean) {
  return {
    clientId: "client-1",
    clientSlug: "bbb",
    clientName: "Bed Bugs & Beyond",
    source: "gorilladesk_local_transaction_snapshots",
    windowDays: 30,
    reservationLeaseMinutes: 15,
    candidateCount: 1,
    deliveryReadyCount: 0,
    automationStatus: "not_activated",
    reviewConfigurationStatus: configured ? "owner_confirmed" : "not_configured",
    reviewConfigurationConfirmedAt: configured ? "2026-08-13T03:00:00.000Z" : null,
    globalBlockers: configured
      ? ["controlled_send_path_not_accepted"]
      : ["verified_review_url_not_configured", "controlled_send_path_not_accepted"],
    candidates: [
      {
        jobExternalId: "job-123",
        customerExternalId: "customer-1",
        customerName: "Jane Customer",
        serviceType: "Pest Control",
        jobAmountCents: 15000,
        paidAmountCents: 15000,
        completedAt: "2026-08-12T15:00:00.000Z",
        lastPaidAt: "2026-08-12T15:05:00.000Z",
        contactChannels: { smsAvailable: true, emailAvailable: false },
        evidence: {
          completedJob: true,
          paidInFull: true,
          sameTenantProject: true,
          priorReviewRequestEvidence: false,
          noActiveReservation: true,
          ownerConfirmedReviewUrl: configured,
        },
        deliveryReady: false,
        blockers: configured
          ? ["controlled_send_path_not_accepted"]
          : ["verified_review_url_not_configured", "controlled_send_path_not_accepted"],
      },
    ],
  };
}

const reservation = {
  reservation: {
    id: "reservation-1",
    jobExternalId: "job-123",
    reservedAt: "2026-08-13T03:10:00.000Z",
    expiresAt: "2026-08-13T03:25:00.000Z",
  },
  customer: {
    name: "Jane Customer",
    smsAvailable: true,
    emailAvailable: false,
  },
  evidence: {
    completedJob: true,
    paidInFull: true,
    sameTenantProject: true,
    noPriorActiveReservationOrDelivery: true,
    ownerConfirmedReviewUrl: true,
  },
  preview: {
    channel: "sms",
    message: "Hi Jane! Thanks for choosing Bed Bugs & Beyond. Review us: https://g.page/r/test-review",
  },
  deliveryReady: false,
  sendPathStatus: "not_accepted",
  blockers: ["controlled_send_path_not_accepted"],
};

describe("ReviewsEnginePage controlled review workflow", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("requires explicit owner confirmation before saving a review link", async () => {
    let configured = false;
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/reviews/overview") return overview;
      if (path === "/reviews/configuration" && init?.method === "PUT") {
        configured = true;
        return configuration("owner_confirmed");
      }
      if (path === "/reviews/configuration") return configuration(configured ? "owner_confirmed" : "not_configured");
      if (path === "/reviews/eligibility") return eligibility(configured);
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<ReviewsEnginePage />);
    fireEvent.click(screen.getByRole("button", { name: "Eligibility Queue" }));

    const reviewLink = await screen.findByLabelText("Google review link");
    fireEvent.change(reviewLink, { target: { value: "https://g.page/r/test-review" } });

    const verifyButton = screen.getByRole("button", { name: "Verify review link" });
    expect((verifyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Confirm review link ownership"));
    expect((verifyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/reviews/configuration",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            reviewUrl: "https://g.page/r/test-review",
            ownerConfirmed: true,
          }),
        }),
      );
    });
    expect(await screen.findByText(/Saved with owner confirmation/i)).toBeTruthy();
  });

  it("reserves a preview without exposing a customer-send action", async () => {
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/reviews/overview") return overview;
      if (path === "/reviews/configuration") return configuration("owner_confirmed");
      if (path === "/reviews/eligibility") return eligibility(true);
      if (path === "/reviews/reservations/job-123" && init?.method === "POST") return reservation;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<ReviewsEnginePage />);
    fireEvent.click(screen.getByRole("button", { name: "Eligibility Queue" }));

    const reserveButton = await screen.findByRole("button", { name: "Reserve & Preview" });
    fireEvent.click(reserveButton);

    expect(await screen.findByText(/Preview only — nothing sent/i)).toBeTruthy();
    expect(screen.getByText(reservation.preview.message)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Send/i })).toBeNull();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/reviews/reservations/job-123",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
