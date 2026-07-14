import type { GitHubReadPage, GitHubReadRequest, GitHubSourceObservation, ReadOnlyGitHubClient } from "./types.js";

export const DAB2B2_REPOSITORY_ID = "123456789";
export const DAB2B2_MATTHEW_ACTOR_ID = "256463127";
export const DAB2B2_EXPECTED_SHA = "9496ea93b1e39213192e687347b4a8625569a658";
export const DAB2B2_SPECIFICATION_HASH = "spec_357fe57f1a4e18638be773033c10152a23a4807847ca51c9c8d1626fb27987c7";

export function approvalFixture(overrides: Partial<GitHubSourceObservation> = {}): GitHubSourceObservation {
  return Object.freeze({ repositoryId: DAB2B2_REPOSITORY_ID, repositoryName: "diazpmatt-cmd/AI-Edge-OS", objectType: "issue_comment", objectId: "4962936805", sourceUrl: "https://github.com/diazpmatt-cmd/AI-Edge-OS/issues/18#issuecomment-4962936805", actorId: DAB2B2_MATTHEW_ACTOR_ID, actorLogin: "diazpmatt-cmd", createdAt: "2026-07-13T21:38:34.000Z", updatedAt: "2026-07-13T21:38:34.000Z", content: `Task: DAB-2B2\nSpecification revision: 1\nSpecification hash: ${DAB2B2_SPECIFICATION_HASH}\nExpected origin/main SHA: ${DAB2B2_EXPECTED_SHA}\nAuthorized categories:\n- Scope\n- Editing\n`, ...overrides });
}

export function mutableIssueFixture(): GitHubSourceObservation { return approvalFixture({ objectType: "issue", objectId: "18", sourceUrl: "https://github.com/diazpmatt-cmd/AI-Edge-OS/issues/18", mutableField: true }); }
export function refFixture(overrides: Partial<GitHubSourceObservation> = {}): GitHubSourceObservation { return approvalFixture({ objectType: "ref", objectId: "9001", sourceUrl: "https://github.com/diazpmatt-cmd/AI-Edge-OS/tree/main", actorId: null, actorLogin: null, content: null, headSha: DAB2B2_EXPECTED_SHA, ...overrides }); }

export class FixtureGitHubClient implements ReadOnlyGitHubClient {
  readonly requests: GitHubReadRequest[] = [];
  constructor(private readonly pages: readonly GitHubReadPage[]) {}
  async read(request: GitHubReadRequest): Promise<GitHubReadPage> { this.requests.push(Object.freeze({ ...request })); const page = this.pages[Math.min(this.requests.length - 1, this.pages.length - 1)]; if (!page) throw new Error("fixture page unavailable"); return page; }
}

export function fixturePage(observations: readonly GitHubSourceObservation[], overrides: Partial<GitHubReadPage> = {}): GitHubReadPage { return Object.freeze({ status: 200, observations: Object.freeze([...observations]), nextCursor: "cursor-1", etag: "fixture-etag-1", rateLimit: null, ...overrides }); }
