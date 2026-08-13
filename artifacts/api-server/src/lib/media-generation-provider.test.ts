import { describe, expect, it } from "vitest";
import {
  MediaGenerationRegistry,
  createProductionMediaGenerationRegistry,
  type MediaGenerationProvider,
  type MediaProviderReadiness,
} from "./media-generation-provider.js";

function provider(options: {
  id: string;
  capabilities: Array<"image" | "video" | "audio">;
  readiness?: MediaProviderReadiness;
  throws?: boolean;
}): MediaGenerationProvider {
  return {
    id: options.id,
    displayName: options.id,
    capabilities: options.capabilities,
    async getReadiness() {
      if (options.throws) throw new Error("provider unavailable");
      return options.readiness ?? { ready: true, reason: null };
    },
    async start() {
      throw new Error("not used in readiness tests");
    },
    async poll() {
      throw new Error("not used in readiness tests");
    },
  };
}

describe("MediaGenerationRegistry", () => {
  it("keeps the production registry fail closed with no configured providers", async () => {
    const readiness = await createProductionMediaGenerationRegistry().getReadiness();

    expect(readiness).toEqual({
      status: "not_configured",
      generationAllowed: false,
      capabilities: {
        image: false,
        video: false,
        audio: false,
      },
      providers: [],
    });
  });

  it("enables only capabilities backed by a ready provider", async () => {
    const registry = new MediaGenerationRegistry();
    registry.register(provider({ id: "image-provider", capabilities: ["image"] }));

    const readiness = await registry.getReadiness();

    expect(readiness.status).toBe("ready");
    expect(readiness.generationAllowed).toBe(true);
    expect(readiness.capabilities).toEqual({
      image: true,
      video: false,
      audio: false,
    });
  });

  it("does not advertise capabilities from an unready provider", async () => {
    const registry = new MediaGenerationRegistry();
    registry.register(provider({ id: "image-provider", capabilities: ["image"] }));
    registry.register(provider({
      id: "video-provider",
      capabilities: ["video"],
      readiness: { ready: false, reason: "missing_api_key" },
    }));

    const readiness = await registry.getReadiness();

    expect(readiness.status).toBe("partial");
    expect(readiness.generationAllowed).toBe(true);
    expect(readiness.capabilities.image).toBe(true);
    expect(readiness.capabilities.video).toBe(false);
    expect(readiness.providers.find((item) => item.id === "video-provider")).toMatchObject({
      ready: false,
      reason: "missing_api_key",
    });
  });

  it("fails closed when a provider readiness check throws", async () => {
    const registry = new MediaGenerationRegistry();
    registry.register(provider({ id: "broken-video", capabilities: ["video"], throws: true }));

    const readiness = await registry.getReadiness();

    expect(readiness.generationAllowed).toBe(false);
    expect(readiness.capabilities.video).toBe(false);
    expect(readiness.providers[0]).toMatchObject({
      id: "broken-video",
      ready: false,
      reason: "provider_readiness_check_failed",
    });
  });

  it("rejects duplicate provider identifiers", () => {
    const registry = new MediaGenerationRegistry();
    registry.register(provider({ id: "same", capabilities: ["image"] }));

    expect(() => registry.register(provider({ id: "same", capabilities: ["video"] })))
      .toThrow("duplicate_media_provider:same");
  });
});
