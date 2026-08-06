import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { socialPostsTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Request, RequestHandler } from "express";

import { PUBLISHING_STATE_LOCKED_CODE } from "../lib/publishing-mutation-guard.js";

export function extractPublishingMutationPostIds(
  req: Pick<Request, "params" | "body">,
): string[] {
  const ids: string[] = [];
  const routeId = req.params?.id;
  if (typeof routeId === "string" && routeId && routeId !== "bulk") {
    ids.push(routeId);
  }

  const bodyIds = (req.body as { postIds?: unknown } | undefined)?.postIds;
  if (Array.isArray(bodyIds)) {
    for (const value of bodyIds) {
      if (typeof value === "string" && value) ids.push(value);
    }
  }

  return [...new Set(ids)];
}

export const rejectPublishingPostMutation: RequestHandler = async (
  req,
  res,
  next,
) => {
  const { userId } = getAuth(req);
  if (!userId) {
    next();
    return;
  }

  const postIds = extractPublishingMutationPostIds(req);
  if (postIds.length === 0) {
    next();
    return;
  }

  try {
    const locked = await db
      .select({ id: socialPostsTable.id })
      .from(socialPostsTable)
      .where(and(
        eq(socialPostsTable.userId, userId),
        inArray(socialPostsTable.id, postIds),
        eq(socialPostsTable.status, "publishing"),
      ));

    if (locked.length > 0) {
      res.status(409).json({
        error: PUBLISHING_STATE_LOCKED_CODE,
        message:
          "This post is being delivered to a provider and cannot be changed until the attempt finishes.",
        postIds: locked.map((post) => post.id),
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
