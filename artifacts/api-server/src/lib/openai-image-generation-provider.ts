import type {
  MediaGenerationPollResult,
  MediaGenerationProvider,
  MediaGenerationRequest,
  MediaGenerationStartResult,
  MediaProviderReadiness,
} from "./media-generation-provider";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-1";
const RESPONSE_MAX_BYTES = 32 * 1024 * 1024;
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface OpenAiImageProviderConfig {
  enabled: boolean;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(value?: string | null): string {
  return (value?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
}

function sizeFromAspectRatio(aspectRatio?: string): "1024x1024" | "1536x1024" | "1024x1536" {
  switch (aspectRatio) {
    case "16:9":
    case "landscape":
      return "1536x1024";
    case "9:16":
    case "portrait":
      return "1024x1536";
    default:
      return "1024x1024";
  }
}

function ensurePng(buffer: Buffer): void {
  if (buffer.length > IMAGE_MAX_BYTES) throw new Error("media_provider_image_too_large");
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error("media_provider_invalid_image_format");
  }
}

export class OpenAiImageGenerationProvider implements MediaGenerationProvider {
  readonly id = "openai_images";
  readonly displayName = "OpenAI Images";
  readonly capabilities = ["image"] as const;

  private readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAiImageProviderConfig) {
    this.enabled = config.enabled;
    this.apiKey = config.apiKey?.trim() ?? "";
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.model = config.model?.trim() || DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async getReadiness(): Promise<MediaProviderReadiness> {
    if (!this.enabled) return { ready: false, reason: "provider_not_enabled" };
    if (!this.apiKey) return { ready: false, reason: "provider_api_key_missing" };
    return { ready: true, reason: null };
  }

  async start(request: MediaGenerationRequest): Promise<MediaGenerationStartResult> {
    if (request.capability !== "image") throw new Error("media_provider_capability_not_supported");
    const readiness = await this.getReadiness();
    if (!readiness.ready) throw new Error(readiness.reason ?? "media_provider_not_ready");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: request.prompt,
          size: sizeFromAspectRatio(request.aspectRatio),
          n: 1,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();
    if (Buffer.byteLength(rawText, "utf8") > RESPONSE_MAX_BYTES) {
      throw new Error("media_provider_response_too_large");
    }
    if (!response.ok) {
      throw new Error(`media_provider_http_${response.status}`);
    }

    let payload: { data?: Array<{ b64_json?: string }> };
    try {
      payload = JSON.parse(rawText) as { data?: Array<{ b64_json?: string }> };
    } catch {
      throw new Error("media_provider_invalid_json");
    }
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error("media_provider_missing_image_data");

    const bytes = Buffer.from(encoded, "base64");
    ensurePng(bytes);

    return {
      providerId: this.id,
      status: "succeeded",
      output: {
        contentType: "image/png",
        bytes,
      },
    };
  }

  async poll(_providerJobId: string): Promise<MediaGenerationPollResult> {
    throw new Error("media_provider_poll_not_supported");
  }
}

export function createConfiguredOpenAiImageProvider(
  env: NodeJS.ProcessEnv = process.env,
): OpenAiImageGenerationProvider {
  return new OpenAiImageGenerationProvider({
    // Deliberate second gate: an existing OPENAI_API_KEY used elsewhere must not
    // silently activate a new paid Media Engine surface.
    enabled: env.MEDIA_OPENAI_IMAGE_ENABLED === "true",
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.MEDIA_OPENAI_IMAGE_MODEL,
  });
}
