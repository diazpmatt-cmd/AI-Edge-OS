export const INTERNAL_PUBLISH_PLATFORM_HEADER = "x-ai-edge-publish-platform";

export interface InternalPublishPlatformSelection {
  readonly ok: boolean;
  readonly platforms: readonly string[];
  readonly code?: string;
  readonly message?: string;
  readonly status?: number;
}

export function resolveInternalPublishPlatformSelection(input: {
  readonly boundPlatforms: readonly string[];
  readonly rawHeader: string | string[] | undefined;
  readonly internalAuthorized: boolean;
}): InternalPublishPlatformSelection {
  if (input.rawHeader === undefined) {
    return { ok: true, platforms: [...input.boundPlatforms] };
  }

  if (!input.internalAuthorized) {
    return {
      ok: false,
      platforms: [],
      code: "INTERNAL_PLATFORM_OVERRIDE_FORBIDDEN",
      message: "Platform-scoped provider publishing is internal-only.",
      status: 403,
    };
  }

  if (Array.isArray(input.rawHeader)) {
    return {
      ok: false,
      platforms: [],
      code: "INTERNAL_PLATFORM_OVERRIDE_INVALID",
      message: "Platform override must contain exactly one platform.",
      status: 400,
    };
  }

  const platform = input.rawHeader.trim();
  if (!platform) {
    return {
      ok: false,
      platforms: [],
      code: "INTERNAL_PLATFORM_OVERRIDE_INVALID",
      message: "Platform override must be a non-empty platform name.",
      status: 400,
    };
  }

  if (!input.boundPlatforms.includes(platform)) {
    return {
      ok: false,
      platforms: [],
      code: "INTERNAL_PLATFORM_OVERRIDE_NOT_BOUND",
      message: "Requested platform is not bound to this post.",
      status: 409,
    };
  }

  return { ok: true, platforms: [platform] };
}
