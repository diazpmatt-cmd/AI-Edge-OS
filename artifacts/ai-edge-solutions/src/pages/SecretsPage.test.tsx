import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@/contexts/theme-context";
import { SecretsPrototypeContent } from "./SecretsPage";

const writeText = vi.fn(() => Promise.resolve());

function renderPage() {
  return render(<ThemeProvider><SecretsPrototypeContent /></ThemeProvider>);
}

describe("Secrets UI prototype", () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  });

  afterEach(() => cleanup());

  it("searches, reveals, hides, and copies mock values", async () => {
    renderPage();
    const search = screen.getByLabelText("Filter secrets by name");
    fireEvent.change(search, { target: { value: "google" } });
    expect(screen.getByText("GOOGLE_OAUTH_CLIENT_ID")).toBeTruthy();
    expect(screen.queryByText("OPENAI_API_KEY")).toBeNull();

    const value = screen.getByLabelText("Value for GOOGLE_OAUTH_CLIENT_ID");
    expect(value.textContent).toContain("••••");
    fireEvent.click(screen.getByLabelText("Reveal value for GOOGLE_OAUTH_CLIENT_ID"));
    expect(value.textContent).toMatch(/^prototype_[a-f0-9]+$/);
    fireEvent.click(screen.getByLabelText("Copy value for GOOGLE_OAUTH_CLIENT_ID"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(value.textContent));
    fireEvent.click(screen.getByLabelText("Hide value for GOOGLE_OAUTH_CLIENT_ID"));
    expect(value.textContent).toContain("••••");
  });

  it("adds a prototype secret in memory", () => {
    renderPage();
    const generatedTestValue = crypto.randomUUID();
    fireEvent.click(screen.getByRole("button", { name: "New Secret" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "DEMO_ONLY" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: generatedTestValue } });
    fireEvent.click(screen.getByRole("button", { name: "Add Secret" }));
    expect(screen.getByText("DEMO_ONLY")).toBeTruthy();
  });

  it("edits and confirms deletion", async () => {
    renderPage();
    fireEvent.pointerDown(screen.getByLabelText("Actions for OPENAI_API_KEY"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Edit"));
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "RENAMED_MOCK" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByText("RENAMED_MOCK")).toBeTruthy();

    fireEvent.pointerDown(screen.getByLabelText("Actions for RENAMED_MOCK"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Delete"));
    expect(screen.getByText("Delete prototype secret?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByText("RENAMED_MOCK")).toBeNull();
  });
});
