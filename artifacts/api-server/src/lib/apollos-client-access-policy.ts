export type ApollosClientSelectionFailureReason = "not_found" | "unauthorized" | "selection_required";

export interface ApollosSelectableClient {
  readonly clientId: string;
  readonly ownership: "self" | "delegated";
}

export type ApollosClientSelectionResult<T extends ApollosSelectableClient> =
  | { readonly ok: true; readonly target: T }
  | { readonly ok: false; readonly reason: ApollosClientSelectionFailureReason };

export function selectAuthorizedApollosClient<T extends ApollosSelectableClient>(
  targets: readonly T[],
  requestedClientId?: string | null,
): ApollosClientSelectionResult<T> {
  if (targets.length === 0) {
    return Object.freeze({ ok: false as const, reason: "not_found" as const });
  }

  const requested = requestedClientId?.trim() ?? "";
  if (requested) {
    const target = targets.find((client) => client.clientId === requested);
    return target
      ? Object.freeze({ ok: true as const, target })
      : Object.freeze({ ok: false as const, reason: "unauthorized" as const });
  }

  if (targets.length === 1) {
    return Object.freeze({ ok: true as const, target: targets[0]! });
  }

  const selfOwned = targets.filter((client) => client.ownership === "self");
  if (selfOwned.length === 1) {
    return Object.freeze({ ok: true as const, target: selfOwned[0]! });
  }

  return Object.freeze({ ok: false as const, reason: "selection_required" as const });
}
