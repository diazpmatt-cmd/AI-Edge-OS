import { GitHubReconciliationError, type GitHubReadPage, type GitHubReadRequest, type ReadOnlyGitHubClient } from "./types";

const BOUNDED_STREAM = /^[a-z0-9_:-]{1,100}$/;
const NUMERIC_ID = /^[1-9][0-9]{0,19}$/;

export function createReadOnlyGitHubClient(read: (request: GitHubReadRequest) => Promise<GitHubReadPage>): ReadOnlyGitHubClient {
  return Object.freeze({
    async read(request: GitHubReadRequest) {
      if ((request.method !== "GET" && request.method !== "HEAD") || !NUMERIC_ID.test(request.repositoryId) || !BOUNDED_STREAM.test(request.stream)) {
        throw new GitHubReconciliationError("INVALID_READ_REQUEST", "bounded read-only GitHub request required");
      }
      const page = await read(Object.freeze({ ...request }));
      if (![200, 304, 403, 429, 503].includes(page.status) || page.observations.length > 100) {
        throw new GitHubReconciliationError("INVALID_READ_RESPONSE", "bounded GitHub response required");
      }
      return page;
    },
  });
}
