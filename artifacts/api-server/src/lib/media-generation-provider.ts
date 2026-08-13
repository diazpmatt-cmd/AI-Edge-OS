export type MediaCapability = "image" | "video" | "audio";

export type MediaGenerationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface MediaGenerationRequest {
  clientId: string;
  userId: string;
  capability: MediaCapability;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  sourceAssetIds?: string[];
  idempotencyKey: string;
}

export interface MediaGenerationStartResult {
  providerId: string;
  providerJobId: string;
  status: MediaGenerationStatus;
}

export interface MediaGenerationPollResult extends MediaGenerationStartResult {
  outputUrl?: string;
  contentType?: string;
  failureReason?: string;
}

export interface MediaProviderReadiness {
  ready: boolean;
  reason: string | null;
}

export interface MediaGenerationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly MediaCapability[];
  getReadiness(): Promise<MediaProviderReadiness>;
  start(request: MediaGenerationRequest): Promise<MediaGenerationStartResult>;
  poll(providerJobId: string): Promise<MediaGenerationPollResult>;
}

export interface MediaProviderStatus {
  id: string;
  displayName: string;
  capabilities: MediaCapability[];
  ready: boolean;
  reason: string | null;
}

export interface MediaRegistryReadiness {
  status: "not_configured" | "partial" | "ready";
  generationAllowed: boolean;
  capabilities: Record<MediaCapability, boolean>;
  providers: MediaProviderStatus[];
}

const CAPABILITIES: readonly MediaCapability[] = ["image", "video", "audio"];

export class MediaGenerationRegistry {
  private readonly providers = new Map<string, MediaGenerationProvider>();

  register(provider: MediaGenerationProvider): void {
    const id = provider.id.trim();
    if (!id) throw new Error("media_provider_id_required");
    if (this.providers.has(id)) {
      throw new Error(`duplicate_media_provider:${id}`);
    }
    this.providers.set(id, provider);
  }

  get(providerId: string): MediaGenerationProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  list(): MediaGenerationProvider[] {
    return [...this.providers.values()];
  }

  async getReadiness(): Promise<MediaRegistryReadiness> {
    const providers = await Promise.all(
      this.list().map(async (provider): Promise<MediaProviderStatus> => {
        try {
          const readiness = await provider.getReadiness();
          return {
            id: provider.id,
            displayName: provider.displayName,
            capabilities: [...provider.capabilities],
            ready: readiness.ready,
            reason: readiness.reason,
          };
        } catch {
          return {
            id: provider.id,
            displayName: provider.displayName,
            capabilities: [...provider.capabilities],
            ready: false,
            reason: "provider_readiness_check_failed",
          };
        }
      }),
    );

    const capabilities = Object.fromEntries(
      CAPABILITIES.map((capability) => [
        capability,
        providers.some((provider) => provider.ready && provider.capabilities.includes(capability)),
      ]),
    ) as Record<MediaCapability, boolean>;

    const generationAllowed = Object.values(capabilities).some(Boolean);
    const readyProviderCount = providers.filter((provider) => provider.ready).length;

    return {
      status:
        providers.length === 0
          ? "not_configured"
          : readyProviderCount === providers.length
            ? "ready"
            : "partial",
      generationAllowed,
      capabilities,
      providers,
    };
  }
}

/**
 * Production intentionally starts with no registered generation providers.
 * A provider is added only when a concrete server-side adapter exists and can
 * prove its own credential/configuration readiness. Never register demo/mock
 * providers here and never infer readiness from a vendor name alone.
 */
export function createProductionMediaGenerationRegistry(): MediaGenerationRegistry {
  return new MediaGenerationRegistry();
}
