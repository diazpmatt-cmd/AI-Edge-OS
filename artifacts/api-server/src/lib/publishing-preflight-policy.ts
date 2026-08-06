export const PUBLISH_REJECTION_CODES = [
  "POST_NOT_FOUND",
  "APPROVAL_REQUIRED",
  "PLATFORM_BINDING_INVALID",
  "NO_PLATFORMS_SELECTED",
  "CLAIMS_POLICY_BLOCKED",
  "ALREADY_PUBLISHED",
  "ALREADY_PUBLISHING",
] as const;

export type PublishRejectionCode =
  (typeof PUBLISH_REJECTION_CODES)[number];

export interface PublishRejection {
  readonly code: PublishRejectionCode;
  readonly retryable: boolean;
  readonly terminalForScheduledPost: boolean;
}

const REJECTION_POLICY: Readonly<
  Record<PublishRejectionCode, Omit<PublishRejection, "code">>
> = Object.freeze({
  POST_NOT_FOUND: Object.freeze({
    retryable: false,
    terminalForScheduledPost: true,
  }),
  APPROVAL_REQUIRED: Object.freeze({
    retryable: false,
    terminalForScheduledPost: true,
  }),
  PLATFORM_BINDING_INVALID: Object.freeze({
    retryable: false,
    terminalForScheduledPost: true,
  }),
  NO_PLATFORMS_SELECTED: Object.freeze({
    retryable: false,
    terminalForScheduledPost: true,
  }),
  CLAIMS_POLICY_BLOCKED: Object.freeze({
    retryable: false,
    terminalForScheduledPost: true,
  }),
  ALREADY_PUBLISHED: Object.freeze({
    retryable: false,
    terminalForScheduledPost: false,
  }),
  ALREADY_PUBLISHING: Object.freeze({
    retryable: true,
    terminalForScheduledPost: false,
  }),
});

export function getPublishRejection(
  code: PublishRejectionCode,
): PublishRejection {
  return Object.freeze({ code, ...REJECTION_POLICY[code] });
}

export function shouldTerminallyFailScheduledPost(
  rejection: PublishRejection | null | undefined,
): boolean {
  return rejection?.terminalForScheduledPost === true;
}

export type PublishPlatformBindingResult =
  | {
      readonly ok: true;
      readonly platforms: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: "PLATFORM_BINDING_INVALID";
      readonly message: string;
    };

export function parsePublishPlatformBinding(
  raw: string | null | undefined,
): PublishPlatformBindingResult {
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
