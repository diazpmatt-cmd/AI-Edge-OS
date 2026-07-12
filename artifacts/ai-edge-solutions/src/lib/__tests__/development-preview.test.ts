import { describe, expect, it } from "vitest";
import { isSecretsPreviewAvailable } from "../development-preview";

describe("Secrets preview route gate", () => {
  it("is available in development", () => {
    expect(isSecretsPreviewAvailable(true)).toBe(true);
  });

  it("is unavailable in production", () => {
    expect(isSecretsPreviewAvailable(false)).toBe(false);
  });
});
