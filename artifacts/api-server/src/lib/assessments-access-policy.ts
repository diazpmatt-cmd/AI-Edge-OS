import { isApollosAdminUser } from "./apollos-admin-access-policy.js";

export type AssessmentsAccessDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: "Unauthorized" | "APOLLOS_ADMIN_REQUIRED" };

export function authorizeAssessmentsAccess(
  userId: string | null | undefined,
  isAdminUser: (userId: string | null | undefined) => boolean = isApollosAdminUser,
): AssessmentsAccessDecision {
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  if (!isAdminUser(userId)) return { ok: false, status: 403, error: "APOLLOS_ADMIN_REQUIRED" };
  return { ok: true };
}
