import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ObjectStorageService, objectStorageClient } from "./objectStorage.js";

const VIDEO_MAX_SECONDS = 90;
const VIDEO_MIN_SECONDS = 8;
const AUDIO_MAX_BYTES = 12 * 1024 * 1024;
const VIDEO_MAX_BYTES = 80 * 1024 * 1024;
const TTS_TIMEOUT_MS = 60_000;
const RENDER_TIMEOUT_MS = 120_000;

export type NativeVideoRenderInput = {
  generationId: string;
  imagePath: string;
  narration: string;
  title: string;
  clientName: string;
  cta: string;
  openAiBaseUrl: string;
  openAiApiKey: string;
};

export type NativeVideoRenderResult = {
  storageKey: string;
  videoPath: string;
  durationSeconds: number;
  byteSize: number;
};

function runProcess(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command}_timeout`));
    }, timeoutMs);
    child.stderr.on("data", chunk => {
      if (stderr.length < 16_000) stderr += String(chunk);
    });
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`${command}_failed:${code}:${stderr.slice(-1_000)}`));
    });
  });
}

function srtTimestamp(seconds: number): string {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function buildApproximateSrt(narration: string, durationSeconds: number): string {
  const words = narration.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(" "));
  if (!chunks.length) return "";
  const secondsPerChunk = durationSeconds / chunks.length;
  return chunks.map((chunk, index) => {
    const start = index * secondsPerChunk;
    const end = Math.min(durationSeconds, (index + 1) * secondsPerChunk);
    return `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${chunk}\n`;
  }).join("\n");
}

async function downloadImage(imagePath: string): Promise<Buffer> {
  if (imagePath.startsWith("/objects/uploads/")) {
    const objectId = imagePath.slice("/objects/uploads/".length);
    if (!/^[0-9a-f-]{36}$/i.test(objectId)) throw new Error("invalid_local_image_path");
    const localMediaDir = process.env.LOCAL_MEDIA_DIR?.trim();
    if (localMediaDir) return readFile(path.join(localMediaDir, "uploads", objectId));
  }
  if (imagePath.startsWith("/objects/")) {
    const service = new ObjectStorageService();
    const file = await service.getObjectEntityFile(imagePath);
    const response = await service.downloadObject(file);
    return Buffer.from(await response.arrayBuffer());
  }
  if (imagePath.startsWith("https://")) {
    const response = await fetch(imagePath, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`image_download_failed:${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("unsupported_image_path");
}

function parsePrivateDir(privateDir: string): { bucket: string; prefix: string } {
  const clean = privateDir.replace(/^gs:\/\//, "").replace(/^\/+/, "");
  const slash = clean.indexOf("/");
  return slash === -1
    ? { bucket: clean, prefix: "" }
    : { bucket: clean.slice(0, slash), prefix: clean.slice(slash + 1).replace(/\/$/, "") };
}

export async function renderNativeCampaignVideo(input: NativeVideoRenderInput): Promise<NativeVideoRenderResult> {
  const localMediaDir = process.env.LOCAL_MEDIA_DIR?.trim();
  const privateDir = process.env.PRIVATE_OBJECT_DIR?.trim() ?? "";
  if (!localMediaDir && !privateDir) throw new Error("storage_not_configured");
  if (!input.openAiApiKey) throw new Error("tts_provider_not_configured");

  const workDir = await mkdtemp(path.join(tmpdir(), "aie-video-"));
  const imageFile = path.join(workDir, "campaign.png");
  const audioFile = path.join(workDir, "narration.mp3");
  const subtitleFile = path.join(workDir, "captions.srt");
  const titleFile = path.join(workDir, "title.txt");
  const ctaFile = path.join(workDir, "cta.txt");
  const outputFile = path.join(workDir, "campaign.mp4");

  try {
    const narration = input.narration.replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim().slice(0, 1_400);
    if (!narration) throw new Error("narration_required");

    const image = await downloadImage(input.imagePath);
    await writeFile(imageFile, image);

    const speechResponse = await fetch(`${input.openAiBaseUrl.replace(/\/$/, "")}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: narration,
        instructions: "Warm, trustworthy local-service commercial voice. Clear and conversational, never sensational.",
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (!speechResponse.ok) throw new Error(`tts_provider_http_${speechResponse.status}`);
    const audio = Buffer.from(await speechResponse.arrayBuffer());
    if (!audio.length || audio.length > AUDIO_MAX_BYTES) throw new Error("invalid_tts_audio");
    await writeFile(audioFile, audio);

    const probeOutput = await new Promise<string>((resolve, reject) => {
      const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioFile]);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => { stdout += String(chunk); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.once("error", reject);
      child.once("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`ffprobe_failed:${stderr.slice(-500)}`)));
    });
    const measuredDuration = Number.parseFloat(probeOutput);
    if (!Number.isFinite(measuredDuration)) throw new Error("invalid_audio_duration");
    const duration = Math.min(VIDEO_MAX_SECONDS, Math.max(VIDEO_MIN_SECONDS, measuredDuration));

    await Promise.all([
      writeFile(subtitleFile, buildApproximateSrt(narration, duration)),
      writeFile(titleFile, input.title.slice(0, 100)),
      writeFile(ctaFile, `${input.clientName}\n${input.cta}`.slice(0, 180)),
    ]);

    const frames = Math.ceil(duration * 30);
    const outroStart = Math.max(4, duration - 5);
    const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const filter = [
      `scale=1280:720:force_original_aspect_ratio=increase`,
      `crop=1280:720`,
      `zoompan=z='min(zoom+0.00045,1.08)':d=${frames}:s=1280x720:fps=30`,
      `drawbox=x=0:y=0:w=iw:h=110:color=0x0D2B45@0.88:t=fill:enable='between(t,0,4)'`,
      `drawbox=x=0:y=106:w=iw:h=4:color=0xF26C21@1:t=fill:enable='between(t,0,4)'`,
      `drawtext=fontfile=${font}:textfile=${titleFile}:fontcolor=white:fontsize=42:x=(w-text_w)/2:y=30:enable='between(t,0,4)'`,
      `drawbox=x=0:y=h-150:w=iw:h=150:color=0x0D2B45@0.92:t=fill:enable='gte(t,${outroStart})'`,
      `drawbox=x=0:y=h-154:w=iw:h=4:color=0x39C6E8@1:t=fill:enable='gte(t,${outroStart})'`,
      `drawtext=fontfile=${font}:textfile=${ctaFile}:fontcolor=white:fontsize=34:line_spacing=10:x=(w-text_w)/2:y=h-125:enable='gte(t,${outroStart})'`,
      `subtitles=${subtitleFile}:force_style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,MarginV=45'`,
      `format=yuv420p`,
    ].join(",");

    await runProcess("ffmpeg", [
      "-y", "-loop", "1", "-i", imageFile, "-i", audioFile,
      "-vf", filter,
      "-map", "0:v:0", "-map", "1:a:0", "-t", String(duration),
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
      outputFile,
    ], RENDER_TIMEOUT_MS);

    const video = await readFile(outputFile);
    if (!video.length || video.length > VIDEO_MAX_BYTES) throw new Error("invalid_video_output");

    let storageKey: string;
    if (localMediaDir) {
      const uploadsDir = path.join(localMediaDir, "uploads");
      await mkdir(uploadsDir, { recursive: true });
      const dataPath = path.join(uploadsDir, input.generationId);
      await writeFile(dataPath, video, { flag: "wx" });
      await writeFile(
        `${dataPath}.json`,
        JSON.stringify({ contentType: "video/mp4", byteSize: video.length, brand: "bed-bugs-and-beyond-v1" }),
        { encoding: "utf8", flag: "wx" },
      );
      storageKey = `uploads/${input.generationId}`;
    } else {
      const { bucket, prefix } = parsePrivateDir(privateDir);
      storageKey = `generated-videos/${input.generationId}.mp4`;
      const objectName = `${prefix ? `${prefix}/` : ""}${storageKey}`;
      await objectStorageClient.bucket(bucket).file(objectName).save(video, {
        contentType: "video/mp4",
        resumable: false,
        metadata: { cacheControl: "private, max-age=0" },
      });
    }

    return {
      storageKey,
      videoPath: `/objects/${storageKey}`,
      durationSeconds: Math.round(duration),
      byteSize: video.length,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
