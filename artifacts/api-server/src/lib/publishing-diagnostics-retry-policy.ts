import type { PublishingLaneDiagnostic } from "./publishing-unresolved-diagnostics.js";

/**
 * Keep the diagnostics surface aligned with the executable retry contract.
 *
 * A dedicated isolated-lane retry boundary now supports both single-platform
 * posts and one failed lane inside a multi-platform partial publish. The base
 * lane classifier remains the source of truth for whether a terminal failure is
 * retryable; this adapter intentionally preserves that decision.
 */
export function applyPublishingDiagnosticsRetryPolicy(input: {
  readonly expectedPlatforms: readonly string[];
  readonly lanes: readonly PublishingLaneDiagnostic[];
}): readonly PublishingLaneDiagnostic[] {
  void input.expectedPlatforms;
  return input.lanes;
}
