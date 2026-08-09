import { describe, expect, it } from "vitest";

import {
  isApollosFullUtilizationCommand,
  matchAuthorizedClientFromMessage,
} from "./apollos-full-utilization-intent";

const clients = [
  {
    clientId: "bbb",
    slug: "bed-bugs-and-beyond",
    clientName: "Bed Bugs & Beyond",
    industry: "pest_control",
    industryLabel: "Pest Control",
    region: "Baldwin County",
    accessLevel: "operator" as const,
    ownership: "delegated" as const,
  },
  {
    clientId: "boatliner",
    slug: "boatliner-company",
    clientName: "Boatliner Company",
    industry: "marine_services",
    industryLabel: "Marine Services",
    region: "Alabama Gulf Coast",
    accessLevel: "operator" as const,
    ownership: "delegated" as const,
  },
];

describe("isApollosFullUtilizationCommand", () => {
  it.each([
    "Apollos, make sure Bed Bugs & Beyond is using everything AI Edge has to offer.",
    "Make sure Boatliner is utilizing every tool we have.",
    "Run a full utilization check for this client.",
    "Ensure this company is taking advantage of all the capabilities.",
    "Make sure they're getting recognized through every platform.",
  ])("recognizes operator mission: %s", (message) => {
    expect(isApollosFullUtilizationCommand(message)).toBe(true);
  });

  it.each([
    "How are we doing?",
    "Did Facebook publish today?",
    "What should I do next?",
    "Make sure the review request went out.",
  ])("does not hijack ordinary Apollos chat: %s", (message) => {
    expect(isApollosFullUtilizationCommand(message)).toBe(false);
  });
});

describe("matchAuthorizedClientFromMessage", () => {
  it("matches an authorized client name despite ampersand normalization", () => {
    expect(matchAuthorizedClientFromMessage("Make sure Bed Bugs and Beyond uses everything", clients)?.clientId)
      .toBe("bbb");
  });

  it("matches the canonical slug wording", () => {
    expect(matchAuthorizedClientFromMessage("full utilization for boatliner company", clients)?.clientId)
      .toBe("boatliner");
  });

  it("returns null when no authorized client is named", () => {
    expect(matchAuthorizedClientFromMessage("make sure this client uses everything", clients)).toBeNull();
  });

  it("never manufactures a match for an unauthorized company", () => {
    expect(matchAuthorizedClientFromMessage("full utilization for Other Company", clients)).toBeNull();
  });
});
