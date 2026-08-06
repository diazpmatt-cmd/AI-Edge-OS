import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ObjectStorageService, objectStorageClient } from "./objectStorage.js";
import { BBB_LOGO_PNG_BASE64 } from "./bbb-brand.js";

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
  phoneNumber?: string;
  videoMode?: "professional" | "pest-story";
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
  const musicFile = path.join(workDir, "brand-music.wav");
  const logoFile = path.join(workDir, "bbb-logo.png");
  const sceneTwoFile = path.join(workDir, "scene-two.txt");
  const sceneThreeFile = path.join(workDir, "scene-three.txt");
  const phoneFile = path.join(workDir, "phone.txt");
  const titleFile = path.join(workDir, "title.txt");
  const ctaFile = path.join(workDir, "cta.txt");
  const outputFile = path.join(workDir, "campaign.mp4");

  try {
    const narration = input.narration.replace(/#[A-Za-z0-9_]+/g, "").replace(/\s+/g, " ").trim().slice(0, 1_400);
    if (!narration) throw new Error("narration_required");

    const image = await downloadImage(input.imagePath);
    await Promise.all([
      writeFile(imageFile, image),
      writeFile(logoFile, Buffer.from(BBB_LOGO_PNG_BASE64, "base64")),
    ]);

    const speechResponse = await fetch(`${input.openAiBaseUrl.replace(/\/$/, "")}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: narration,
        instructions: "Speak like a friendly, upbeat local radio host. Sound warm, lively, confident, and genuinely helpful. Smile through the delivery, vary the pace and emphasis naturally, and keep the energy engaging without sounding alarmist or theatrical.",
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

    const phoneNumber = input.phoneNumber?.trim() || "(251) 324-9090";
    const storyMode = input.videoMode === "pest-story";
    const sceneTwo = storyMode ? "THEY FOUND THE KITCHEN..." : "KNOW THE WARNING SIGNS";
    const sceneThree = storyMode ? "TIME FOR AN EVICTION" : "EARLY ACTION MATTERS";

    await Promise.all([
      writeFile(subtitleFile, buildApproximateSrt(narration, duration)),
      writeFile(titleFile, input.title.slice(0, 82)),
      writeFile(sceneTwoFile, sceneTwo),
      writeFile(sceneThreeFile, sceneThree),
      writeFile(phoneFile, phoneNumber),
      writeFile(ctaFile, input.cta.replace(/\bcall\s+now\b/gi, "Call today").slice(0, 110)),
    ]);

    const frames = Math.ceil(duration * 30);
    const sceneOneEnd = Math.max(3, duration * 0.24);
    const sceneTwoEnd = Math.max(sceneOneEnd + 3, duration * 0.52);
    const sceneThreeEnd = Math.max(sceneTwoEnd + 3, duration * 0.76);
    const outroStart = sceneThreeEnd;
    const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

    // A recognizable BB&B jingle: bright, playful arpeggio notes with a soft
    // rhythmic pulse. Generated locally so it is original and reusable.
    const beat = "mod(t,4)";
    const musicExpression = [
      "0.075*(",
      `sin(2*PI*329.63*t)*between(${beat},0.00,0.42)`,
      `+sin(2*PI*392.00*t)*between(${beat},0.50,0.92)`,
      `+sin(2*PI*523.25*t)*between(${beat},1.00,1.42)`,
      `+sin(2*PI*392.00*t)*between(${beat},1.50,1.92)`,
      `+sin(2*PI*349.23*t)*between(${beat},2.00,2.42)`,
      `+sin(2*PI*440.00*t)*between(${beat},2.50,2.92)`,
      `+sin(2*PI*523.25*t)*between(${beat},3.00,3.42)`,
      `+sin(2*PI*659.25*t)*between(${beat},3.50,3.92)`,
      ")+0.018*sin(2*PI*130.81*t)",
    ].join("");
    await runProcess("ffmpeg", [
      "-y", "-f", "lavfi",
      "-i", `aevalsrc=${musicExpression}:s=44100:d=${duration}`,
      "-af", "aecho=0.8:0.45:55:0.15,highpass=f=90,lowpass=f=4200",
      "-c:a", "pcm_s16le", musicFile,
    ], 30_000);

    const videoFilter = [
      `[0:v]scale=1400:800:force_original_aspect_ratio=increase,crop=1400:800,`,
      `zoompan=z='if(lte(zoom,1.0),1.0,min(zoom+0.0007,1.12))':x='iw/2-(iw/zoom/2)+18*sin(on/35)':y='ih/2-(ih/zoom/2)+10*cos(on/42)':d=${frames}:s=1280x720:fps=30,`,
      "eq=saturation=1.08:contrast=1.03,",
      `drawbox=x=0:y=0:w=iw:h=ih:color=0x0D2B45@0.58:t=fill:enable='between(t,0,${sceneOneEnd})',`,
      `drawbox=x=0:y=0:w=iw:h=118:color=0x0D2B45@0.92:t=fill:enable='between(t,0,${sceneOneEnd})',`,
      `drawbox=x=0:y=114:w=iw:h=5:color=0xF26C21@1:t=fill:enable='between(t,0,${sceneOneEnd})',`,
      `drawtext=fontfile=${font}:textfile=${titleFile}:fontcolor=white:fontsize=42:x=54:y=35:enable='between(t,0,${sceneOneEnd})',`,
      `drawbox=x=55:y=470:w=720:h=100:color=0x0D2B45@0.86:t=fill:enable='between(t,${sceneOneEnd},${sceneTwoEnd})',`,
      `drawbox=x=55:y=470:w=8:h=100:color=0x39C6E8@1:t=fill:enable='between(t,${sceneOneEnd},${sceneTwoEnd})',`,
      `drawtext=fontfile=${font}:textfile=${sceneTwoFile}:fontcolor=white:fontsize=39:x=86:y=500:enable='between(t,${sceneOneEnd},${sceneTwoEnd})',`,
      `drawbox=x=505:y=145:w=720:h=100:color=0xF26C21@0.90:t=fill:enable='between(t,${sceneTwoEnd},${sceneThreeEnd})',`,
      `drawtext=fontfile=${font}:textfile=${sceneThreeFile}:fontcolor=white:fontsize=39:x=540:y=175:enable='between(t,${sceneTwoEnd},${sceneThreeEnd})',`,
      `drawbox=x=0:y=0:w=iw:h=ih:color=0x0D2B45@0.90:t=fill:enable='gte(t,${outroStart})',`,
      `drawtext=fontfile=${font}:text='${input.clientName.replace(/[':]/g, "")}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=290:enable='gte(t,${outroStart})',`,
      `drawtext=fontfile=${font}:textfile=${ctaFile}:fontcolor=0x39C6E8:fontsize=30:x=(w-text_w)/2:y=355:enable='gte(t,${outroStart})',`,
      `drawtext=fontfile=${font}:textfile=${phoneFile}:fontcolor=0xF26C21:fontsize=54:x=(w-text_w)/2:y=410:enable='gte(t,${outroStart})',`,
      `subtitles=${subtitleFile}:force_style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,MarginV=42':enable='lt(t,${outroStart})',`,
      "format=yuv420p[base]",
      ";[3:v]scale=210:118[logo]",
      `;[base][logo]overlay=W-w-28:22:enable='lt(t,${outroStart})'[video]`,
    ].join("");

    const musicFadeOut = Math.max(0, duration - 2);
    const audioMix = [
      "[1:a]volume=1.0[voice]",
      `[2:a]volume=0.30,afade=t=in:st=0:d=0.5,afade=t=out:st=${musicFadeOut}:d=2[music]`,
      "[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]",
    ].join(";");
    await runProcess("ffmpeg", [
      "-y", "-loop", "1", "-i", imageFile, "-i", audioFile, "-i", musicFile, "-i", logoFile,
      "-filter_complex", `${videoFilter};${audioMix}`,
      "-map", "[video]", "-map", "[aout]", "-t", String(duration),
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
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
