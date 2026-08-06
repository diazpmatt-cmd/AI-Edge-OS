import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import { SCHEDULER_SECRET } from "../lib/scheduler-secret";

export function hasValidInternalPublishSecret(
  header: string | string[] | undefined,
  expectedSecret = SCHEDULER_SECRET,
): boolean {
  if (!expectedSecret || !header || Array.isArray(header)) return false;

  try {
    const supplied = Buffer.from(header, "utf8");
    const expected = Buffer.from(expectedSecret, "utf8");
    return (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    );
  } catch {
    return false;
  }
}

export const requireInternalPublishAdapter: RequestHandler = (req, res, next) => {
  // Express also matches the legitimate `/social-posts/bulk/publish` route to
  // the parameterized `/:id/publish` middleware with id="bulk". Preserve that
  // canonical user workflow while keeping real post-ID adapter calls internal.
  if (req.params.id === "bulk") {
    next();
    return;
  }

  if (hasValidInternalPublishSecret(req.headers["x-scheduler-secret"])) {
    next();
    return;
  }

  res.status(403).json({
    error: "INTERNAL_PUBLISH_ADAPTER_ONLY",
    message:
      "Direct provider publishing is not available. Use the canonical publish workflow.",
  });
};
