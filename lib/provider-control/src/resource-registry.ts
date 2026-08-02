import type { ProviderId, ProviderOperation, RegisteredResource } from "./types.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._:/-]{2,199}$/;

export function createRegisteredResource(input: RegisteredResource): RegisteredResource {
  if (!ID_PATTERN.test(input.resourceId) || !ID_PATTERN.test(input.resourceType)) {
    throw new Error("PROVIDER_RESOURCE_INVALID");
  }
  if (!input.canonicalName.trim() || input.canonicalName.length > 300) {
    throw new Error("PROVIDER_RESOURCE_INVALID");
  }
  return Object.freeze({ ...input, allowedOperations: Object.freeze([...new Set(input.allowedOperations)]) });
}

export class ProviderResourceRegistry {
  private readonly resources: ReadonlyMap<string, RegisteredResource>;

  constructor(resources: readonly RegisteredResource[]) {
    const entries = resources.map((resource) => {
      const normalized = createRegisteredResource(resource);
      return [`${normalized.provider}:${normalized.resourceId}`, normalized] as const;
    });
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new Error("PROVIDER_RESOURCE_DUPLICATE");
    }
    this.resources = new Map(entries);
  }

  get(provider: ProviderId, resourceId: string): RegisteredResource | null {
    return this.resources.get(`${provider}:${resourceId}`) ?? null;
  }

  allows(provider: ProviderId, resourceId: string, operation: ProviderOperation): boolean {
    const resource = this.get(provider, resourceId);
    return Boolean(resource?.enabled && resource.allowedOperations.includes(operation));
  }
}
