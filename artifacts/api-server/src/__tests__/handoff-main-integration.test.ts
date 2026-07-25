import { describe, expect, it } from "vitest";
import {
  LOCAL_PRESENCE_PROVIDERS,
  generateOptimizations,
  localPresenceChannelsTable,
  localPresenceProfilesTable,
  mapGbpSnapshotToChannelUpdate,
  ne,
} from "@workspace/db";

describe("handoff-to-main Local Presence integration", () => {
  it("preserves every profile and channel extension used by the handoff", () => {
    expect(localPresenceProfilesTable).toMatchObject({
      description: expect.any(Object),
      categoriesJson: expect.any(Object),
      hoursJson: expect.any(Object),
      serviceAreasJson: expect.any(Object),
      attributesJson: expect.any(Object),
      photosJson: expect.any(Object),
    });
    expect(localPresenceChannelsTable).toMatchObject({
      providerId: expect.any(Object),
      nextSyncAt: expect.any(Object),
      healthScore: expect.any(Object),
      issuesJson: expect.any(Object),
    });
  });

  it("preserves main provider metadata and handoff capability declarations", () => {
    const google = LOCAL_PRESENCE_PROVIDERS.find(
      provider => provider.id === "google_business_profile",
    );

    expect(google).toMatchObject({
      channelName: "google_business",
      scoreWeight: 40,
      syncSupported: true,
      capabilities: {
        syncSupported: true,
        writeSupported: false,
        fetchHours: true,
        fetchPhotos: true,
        fetchReviews: true,
        fetchCategories: true,
        oauthRequired: true,
      },
    });
  });

  it("exports both main and handoff database entry points", () => {
    expect(typeof generateOptimizations).toBe("function");
    expect(typeof mapGbpSnapshotToChannelUpdate).toBe("function");
    expect(typeof ne).toBe("function");
  });
});
