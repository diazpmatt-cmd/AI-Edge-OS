export interface ApollosRuntimeVersion {
  readonly commit: string;
  readonly branch: string;
  readonly resource: string;
  readonly builtAt: string;
}

function boundedEnv(name: string, max: number): string {
  const value = process.env[name]?.trim();
  return value ? value.slice(0, max) : "unknown";
}

/**
 * Returns the same secret-free build identity exposed by `/api/version`.
 * In production `APP_COMMIT_SHA` is pinned to the immutable `IMAGE_TAG`, so
 * this snapshot identifies the image executing the current API process.
 */
export function getApollosRuntimeVersion(): ApollosRuntimeVersion {
  return Object.freeze({
    commit: boundedEnv("APP_COMMIT_SHA", 100),
    branch: boundedEnv("COOLIFY_BRANCH", 200),
    resource: boundedEnv("COOLIFY_RESOURCE_UUID", 200),
    builtAt: boundedEnv("APP_BUILD_TIME", 100),
  });
}
