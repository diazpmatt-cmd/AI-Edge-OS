import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("wouter", () => ({
  useSearch: () => "",
}));

vi.mock("@/components/marketing/Nav", () => ({
  default: () => <nav data-testid="nav" />,
}));

vi.mock("@/components/marketing/Footer", () => ({
  default: () => <footer data-testid="footer" />,
}));

async function renderContact() {
  const { default: ContactPage } = await import("../ContactPage");
  return render(<ContactPage />);
}

function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText("John"), { target: { value: "Jane" } });
  fireEvent.change(screen.getByPlaceholderText("Smith"), { target: { value: "Doe" } });
  fireEvent.change(screen.getByPlaceholderText("john@business.com"), { target: { value: "jane@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("(555) 555-0100"), { target: { value: "5551234567" } });
  fireEvent.change(screen.getByPlaceholderText("Your Business LLC"), { target: { value: "Test Co" } });
  fireEvent.change(screen.getByDisplayValue("Select your industry"), { target: { value: "HVAC" } });
}

describe("ContactPage public lead funnel", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses AI Edge Solutions as the SMS sender and contains no BB&B identity", async () => {
    await renderContact();
    const text = document.body.textContent ?? "";

    expect(text).toContain("SMS Consent");
    expect(text).toContain("AI Edge Solutions");
    expect(text).not.toContain("Bed Bugs & Beyond");
    expect(text).not.toContain("Bed Bugs and Beyond");
  });

  it("does not publish the retired unsupported proof claims", async () => {
    await renderContact();
    const text = document.body.textContent ?? "";

    expect(text).not.toContain("500+ local businesses helped");
    expect(text).not.toContain("Average 3.8× ROI in 60 days");
    expect(text).not.toContain("4.9 star average client rating");
    expect(text).not.toContain("Sarah T.");
    expect(text).not.toContain("Clean & Clear Plumbing");
  });

  it("shows the success screen only after the server returns success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    await renderContact();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Send My Request/i }));

    await waitFor(() => {
      expect(screen.getByText(/We received your request/i)).toBeTruthy();
    });

    expect(screen.getByText(/AI Edge Solutions will use the contact details/i)).toBeTruthy();
    expect(screen.queryByText(/Submission failed/i)).toBeNull();
    expect(screen.queryByText(/Check your email/i)).toBeNull();
  });

  it("shows a failure and never a success state when the server returns 422", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

    await renderContact();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Send My Request/i }));

    await waitFor(() => {
      expect(screen.getByText(/Submission failed/i)).toBeTruthy();
    });

    expect(screen.getByText(/Server error \(422\)/i)).toBeTruthy();
    expect(screen.queryByText(/We received your request/i)).toBeNull();
  });

  it("retries a transient 500 and succeeds if a later attempt is accepted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await renderContact();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Send My Request/i }));

    await waitFor(() => {
      expect(screen.getByText(/We received your request/i)).toBeTruthy();
    }, { timeout: 2500 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the form available after a terminal client error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

    await renderContact();
    fillRequiredFields();
    const button = screen.getByRole("button", { name: /Send My Request/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Submission failed/i)).toBeTruthy();
    });

    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
