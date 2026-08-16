import { describe, expect, it, vi } from "vitest";
import { OpenAiImageGenerationProvider } from "../lib/openai-image-generation-provider.js";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);

function request() {
  return {
    clientId: "11111111-1111-1111-1111-111111111111",
    userId: "user_test",
    capability: "image" as const,
    prompt: "Professional plumbing marketing image for Pipe Repair",
    aspectRatio: "16:9",
    idempotencyKey: "media-test-1",
  };
}

describe("OpenAiImageGenerationProvider", () => {
  it("stays blocked unless the dedicated media provider flag is enabled", async () => {
    const provider = new OpenAiImageGenerationProvider({
      enabled: false,
      apiKey: "present-but-must-not-auto-activate",
    });

    await expect(provider.getReadiness()).resolves.toEqual({
      ready: false,
      reason: "provider_not_enabled",
    });
    await expect(provider.start(request())).rejects.toThrow("provider_not_enabled");
  });

  it("reports a missing key without attempting generation", async () => {
    const provider = new OpenAiImageGenerationProvider({ enabled: true, apiKey: "" });
    await expect(provider.getReadiness()).resolves.toEqual({
      ready: false,
      reason: "provider_api_key_missing",
    });
  });

  it("returns a truthful immediate terminal result without inventing a provider job id", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-image-1");
      expect(body.size).toBe("1536x1024");
      expect(body.prompt).toContain("Pipe Repair");
      return new Response(
        JSON.stringify({ data: [{ b64_json: PNG_BYTES.toString("base64") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const provider = new OpenAiImageGenerationProvider({
      enabled: true,
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await provider.start(request());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe("openai_images");
    expect(result.providerJobId).toBeUndefined();
    expect(result.status).toBe("succeeded");
    expect(result.output?.contentType).toBe("image/png");
    expect(result.output?.bytes).toEqual(PNG_BYTES);
  });

  it("rejects malformed image bytes and never pretends polling exists", async () => {
    const provider = new OpenAiImageGenerationProvider({
      enabled: true,
      apiKey: "test-key",
      fetchImpl: (async () => new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("not-a-png").toString("base64") }] }),
        { status: 200 },
      )) as typeof fetch,
    });

    await expect(provider.start(request())).rejects.toThrow("media_provider_invalid_image_format");
    await expect(provider.poll("fake-job-id")).rejects.toThrow("media_provider_poll_not_supported");
  });
});
