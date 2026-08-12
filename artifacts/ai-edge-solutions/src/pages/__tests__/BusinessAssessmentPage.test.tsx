import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BusinessAssessmentPage from "../BusinessAssessmentPage";

vi.mock("wouter", () => ({
  useLocation: () => ["/assessment", vi.fn()],
}));

vi.mock("@/components/marketing/Nav", () => ({
  default: () => <nav data-testid="nav" />,
}));

vi.mock("@/components/marketing/Footer", () => ({
  default: () => <footer data-testid="footer" />,
}));

function completeForm() {
  fireEvent.change(screen.getByPlaceholderText("e.g. Bed Bugs & Beyond"), { target: { value: "Test Business" } });
  fireEvent.change(screen.getByDisplayValue("Select your industry..."), { target: { value: "Pest Control" } });
  fireEvent.change(screen.getByPlaceholderText("e.g. Gulf Shores"), { target: { value: "Gulf Shores" } });
  fireEvent.change(screen.getByDisplayValue("State"), { target: { value: "AL" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
  fireEvent.change(screen.getByPlaceholderText("First & Last Name"), { target: { value: "Test Person" } });
  fireEvent.change(screen.getByPlaceholderText("you@business.com"), { target: { value: "test@example.com" } });
}

async function finishAssessmentDelay() {
  await act(async () => {
    vi.advanceTimersByTime(4_200);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("BusinessAssessmentPage submission state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows preliminary results only after the assessment is saved successfully", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchMock);
    render(<BusinessAssessmentPage />);
    completeForm();

    fireEvent.click(screen.getByRole("button", { name: /Run My Assessment/i }));
    expect(screen.queryByText("Test Business Assessment")).toBeNull();

    await finishAssessmentDelay();

    expect(screen.getByText("Test Business Assessment")).toBeTruthy();
    expect(screen.getByText(/not live provider-verified diagnostics/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves form data and allows one retry after a network failure", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchMock);
    render(<BusinessAssessmentPage />);
    completeForm();

    fireEvent.click(screen.getByRole("button", { name: /Run My Assessment/i }));
    await finishAssessmentDelay();

    expect(screen.getByRole("alert").textContent).toMatch(/couldn't save your assessment/i);
    expect(screen.queryByText("Test Business Assessment")).toBeNull();
    expect((screen.getByPlaceholderText("First & Last Name") as HTMLInputElement).value).toBe("Test Person");
    expect((screen.getByPlaceholderText("you@business.com") as HTMLInputElement).value).toBe("test@example.com");

    const retry = screen.getByRole("button", { name: /Retry Assessment/i });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await finishAssessmentDelay();

    expect(screen.getByText("Test Business Assessment")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed and retains the completed form after a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    render(<BusinessAssessmentPage />);
    completeForm();

    fireEvent.click(screen.getByRole("button", { name: /Run My Assessment/i }));
    await finishAssessmentDelay();

    expect(screen.getByRole("alert").textContent).toMatch(/couldn't save your assessment/i);
    expect(screen.queryByText("Test Business Assessment")).toBeNull();
    expect((screen.getByPlaceholderText("First & Last Name") as HTMLInputElement).value).toBe("Test Person");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
