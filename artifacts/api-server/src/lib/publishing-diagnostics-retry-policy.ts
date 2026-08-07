import type { PublishingLaneDiagnostic } from "./publishing-unresolved-diagnostics.js";

/**
 * Align read-only diagnostics with the retry contract that actually exists.
 *
 * PublishingService.retryDelivery() only permits an isolated single-platform
 * source post. Until a dedicated multi-platform failed-lane retry boundary is
 * implemented, diagnostics must not advertise retry for a lane belonging to a
 * multi-platform source post.
 */
export function applyPublishingDiagnosticsRetryPolicy(input: {
  readonly expectedPlatforms: readonly string[];
  readonly lanes: readonly PublishingLaneDiagnostic[];
}): readonly PublishingLaneDiagnostic[] {
  const isolatedSource = input.expectedPlatforms.length === 1;
  if (isolatedSource) return input.lanes;

  return input.lanes.map((lane) => {
    if (lane.state !== "terminal_failure" || !lane.retryAllowed) return lane;

    return Object.freeze({
      ...lane,
      retryAllowed: false,
      message:
        `${lane.message} Safe isolated retry is not available for a multi-platform source post yet; review this lane manually.`,
    });
  });
}
