export type PublishingPlatformBindingResult =
  | {
      readonly ok: true;
      readonly platforms: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: "PLATFORM_BINDING_INVALID";
      readonly message: string;
    };

export function parsePublishingPlatformBinding(
  raw: string | null | undefined,
): PublishingPlatformBindingResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return Object.freeze({
      ok: false as const,
      code: "PLATFORM_BINDING_INVALID" as const,
      message: "Post platform binding is not valid JSON",
    });
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (platform) =>
        typeof platform === "string" && platform.trim().length > 0,
    )
  ) {
    return Object.freeze({
      ok: false as const,
      code: "PLATFORM_BINDING_INVALID" as const,
      message: "Post platform binding must be an array of non-empty strings",
    });
  }

  return Object.freeze({
    ok: true as const,
    platforms: Object.freeze([
      ...new Set(parsed.map((platform) => platform.trim())),
    ]),
  });
}
