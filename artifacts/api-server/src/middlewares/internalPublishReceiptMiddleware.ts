import type { RequestHandler } from "express";

import { logger } from "../lib/logger.js";
import { persistAdapterReceiptEnvelope } from "../lib/publishing-adapter-receipts.js";

export type PersistInternalPublishReceipts =
  typeof persistAdapterReceiptEnvelope;

export function shouldCaptureInternalPublishReceipt(
  routeId: string | undefined,
): boolean {
  return Boolean(routeId && routeId !== "bulk");
}

export function createInternalPublishReceiptMiddleware(
  persist: PersistInternalPublishReceipts = persistAdapterReceiptEnvelope,
): RequestHandler {
  return (req, res, next) => {
    if (!shouldCaptureInternalPublishReceipt(req.params.id)) {
      next();
      return;
    }

    const postId = req.params.id;
    const sendJson = res.json.bind(res);
    let responseCaptured = false;

    res.json = ((body: unknown) => {
      if (responseCaptured) return res;
      responseCaptured = true;

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
