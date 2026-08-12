import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
  fireEvent.change(screen.getByPlaceholderText("(602) 867-5300"), { target: { value: "5551234567" } });
  fireEvent.change(screen.getByPlaceholderText("Your Business LLC"), { target: { value: "Test Co" } });
  const industrySelect = screen.getByDisplayValue("Select your industry");
  fireEvent.change(industrySelect, { target: { value: "HVAC" } });
}

describe("ContactPage — form submission", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("shows the success screen when the server returns 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }));

    await renderContact();
    fillRequiredFields();
    fireEvent.submit(screen.getByRole("button", { name: /Book My Free Strategy Call/i }));

    await waitFor(() => {
      expect(screen.getByText(/We'll be in touch soon!/i)).toBeTruthy();
    });

    expect(screen.queryByText(/Submission failed/i)).toBeNull();
    expect(screen.getByText(/We received the contact details you submitted/i)).toBeTruthy();
    expect(screen.queryByText(/Check your email/i)).toBeNull();
  });

  it("shows the error banner and NOT the success screen on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await renderContact();
    fillRequiredFields();
    fireEvent.submit(screen.getByRole("button", { name: /Book My Free Strategy Call/i }));

    await waitFor(() => {
      expect(screen.getByText(/Submission failed/i)).toBeTruthy();
    }, { timeout: 3500 });

    expect(screen.queryByText(/We'll be in touch soon!/i)).toBeNull();
  });

  it("shows the error banner and NOT the success screen when the server returns 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    await renderContact();
    fillRequiredFields();
    fireEvent.submit(screen.getByRole("button", { name: /Book My Free Strategy Call/i }));

    await waitFor(() => {
      expect(screen.getByText(/Submission failed/i)).toBeTruthy();
    }, { timeout: 3500 });

    expect(screen.queryByText(/We'll be in touch soon!/i)).toBeNull();
    expect(screen.getByText(/Server error \(500\)/i)).toBeTruthy();
  });

  it("shows the error banner and NOT the success screen when the server returns 422", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
    }));

    await renderContact();
    fillRequiredFields();
    fireEvent.submit(screen.getByRole("button", { name: /Book My Free Strategy Call/i }));

    await waitFor(() => {
      expect(screen.getByText(/Submission failed/i)).toBeTruthy();
    });

    expect(screen.queryByText(/We'll be in touch soon!/i)).toBeNull();
  });

  it("re-enables the submit button after a failed submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await renderContact();
    fillRequiredFields();
    const btn = screen.getByRole("button", { name: /Book My Free Strategy Call/i });
    fireEvent.submit(btn);

    await waitFor(() => {
      expect(screen.getByText(/Submission failed/i)).toBeTruthy();
    }, { timeout: 3500 });

    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
