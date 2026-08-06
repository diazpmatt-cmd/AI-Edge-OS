import { Router } from "express";
import { getAuth } from "@clerk/express";

import {
  buildWeeklyCampaignPreview,
  getWeeklyCampaignDateRange,
} from "../lib/apollos-weekly-preview";

const router = Router();

const FUTURE_PLATFORMS = [
  "tiktok",
  "nextdoor",
  "yelp",
  "thumbtack",
  "linkedin",
  "pinterest",
] as const;

router.post("/apollos/weekly-campaign/preview", (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const command =
    typeof req.body?.command === "string" ? req.body.command.trim() : "";
  if (command.length > 1_000) {
    res.status(413).json({
      error: "APOLLOS_WEEKLY_COMMAND_TOO_LARGE",
      maxCharacters: 1_000,
    });
    return;
  }

  const normalized = command.toLowerCase();
  const futurePlatforms = FUTURE_PLATFORMS.filter((platform) =>
    normalized.includes(platform),
  );
  if (futurePlatforms.length > 0) {
    res.status(409).json({
      error: "APOLLOS_FUTURE_PLATFORM_ADAPTER_NOT_ACTIVE",
      message:
        "A weekly preview cannot imply active scheduling or publishing for future channels.",
      platforms: futurePlatforms,
      previewAvailable: false,
      preparationAvailable: true,
      schedulingAvailable: false,
      publishingAvailable: false,
    });
    return;
  }

  const startDate =
    typeof req.body?.startDate === "string"
      ? req.body.startDate
      : undefined;

  try {
    const preview = buildWeeklyCampaignPreview({ command, startDate });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(preview);
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "APOLLOS_WEEKLY_PREVIEW_FAILED";

    if (code === "APOLLOS_WEEKLY_START_DATE_OUT_OF_RANGE") {
      res.status(422).json({
        error: code,
        ...getWeeklyCampaignDateRange(),
      });
      return;
    }
    if (code === "APOLLOS_WEEKLY_COMMAND_TOO_LARGE") {
      res.status(413).json({
        error: code,
        maxCharacters: 1_000,
      });
      return;
    }

    res.status(400).json({
      error: code,
      message:
        "Ask Apollos to preview or show a week of content and name the active platforms or say all four.",
    });
  }
});

export default router;
