import type { RequestHandler } from "express";

import { logger } from "../lib/logger.js";
import { readAdapterResultsEnvelope } from "../lib/publishing-adapter-result.js";
import { persistAdapterReceiptEnvelope } from "../lib/publishing-adapter-receipts.js";

export const INTERNAL_PARTIAL_ADAPTER_STATUS = 207;

export type PersistInternalPublishReceipts =
  typeof persistAdapterReceiptEnvelope;

export function shouldCaptureInternalPublishReceipt(
  routeId: string | undefined,
): routeId is string {
  return Boolean(routeId && routeId !== "bulk");
}

export function resolveInternalAdapterResponseStatus(
  currentStatus: number,
  body: unknown,
): number {
  return currentStatus >= 500 && readAdapterResultsEnvelope(body)
    ? INTERNAL_PARTIAL_ADAPTER_STATUS
    : currentStatus;
}

export function createInternalPublishReceiptMiddleware(
  persist: PersistInternalPublishReceipts = persistAdapterReceiptEnvelope,
): RequestHandler {
  return (req, res, next) => {
    const routeId = req.params.id;
    if (!shouldCaptureInternalPublishReceipt(routeId)) {
      next();
      return;
    }

    const postId = routeId;
    const sendJson = res.json.bind(res);
    let responseCaptured = false;

    res.json = ((body: unknown) => {
      if (responseCaptured) return res;
      responseCaptured = true;

      const normalizedStatus = resolveInternalAdapterResponseStatus(
        res.statusCode,
        body,
      );
      if (normalizedStatus !== res.statusCode) {
        res.status(normalizedStatus);
      }

      void persist({ postId, body })
        .then(({ persisted, expected }) => {
          if (expected > 0 && persisted !== expected) {
            logger.error(
              { postId, persisted, expected },
              "[publishing-adapter] receipt envelope only partially persisted",
            );
          }
        })
        .catch((error: unknown) => {
          logger.error(
            {
              postId,
              err: error instanceof Error ? error.message : String(error),
            },
            "[publishing-adapter] receipt envelope persistence failed",
          );
        })
        .finally(() => {
          sendJson(body);
        });

      return res;
    }) as typeof res.json;

    next();
  };
}

export const persistInternalPublishAdapterReceipts =
  createInternalPublishReceiptMiddleware();
