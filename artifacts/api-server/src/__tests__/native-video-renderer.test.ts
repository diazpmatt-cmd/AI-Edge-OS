import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildApproximateSrt } from "../lib/native-video-renderer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");

describe("native campaign video renderer", () => {
  it("creates sequential, bounded captions from narration", () => {
    const srt = buildApproximateSrt("One two three four five six seven eight nine ten", 10);
    expect(srt).toContain("00:00:00,000 --> 00:00:05,000");
    expect(srt).toContain("One two three four five six seven eight");
    expect(srt).toContain("00:00:05,000 --> 00:00:10,000");
    expect(srt).toContain("nine ten");
  });

  it("ships ffmpeg and fonts in the production image", async () => {
    const dockerfile = await readFile(path.join(repoRoot, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("ffmpeg");
    expect(dockerfile).toContain("fonts-dejavu-core");
  });

  it("keeps rendered YouTube media private and approval-gated", async () => {
    const route = await readFile(path.join(repoRoot, "artifacts/api-server/src/routes/auto-content.ts"), "utf8");
    expect(route).toContain('router.post("/auto-content/generate-video"');
    expect(route).toContain("if (post.user_id !== userId)");
    expect(route).toContain("youtube_privacy='private'");
    expect(route).not.toContain("youtube_privacy='public'");
  });
});
