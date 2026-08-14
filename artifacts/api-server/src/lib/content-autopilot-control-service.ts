import { db } from "@workspace/db";
import { autoContentSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

import {
  resolveClientActiveCheck,
  resolveClientContentContextFromDb,
} from "./client-resolver.js";

export type ContentAutopilotControlAction =
  | "set_continuous_generation"
  | "set_automatic_media"
  | "pause_content_autopilot"
  | "resume_content_autopilot";

export interface ContentAutopilotControlState {
  readonly autopilotEnabled: boolean;
  readonly autoMediaEnabled: boolean;
  readonly enginePaused: boolean;
  readonly nextGenerationAt: string | null;
  readonly approvalMode: string;
}

export interface ContentAutopilotControlRow {
  readonly autopilotEnabled: string | null;
  readonly autoMediaEnabled: string | null;
  readonly enginePaused: string | null;
  readonly nextGenerationAt: Date | null;
  readonly approvalMode: string;
}

export interface DerivedContentAutopilotControls {
  readonly autopilotEnabled: string;
  readonly autoMediaEnabled: string;
  readonly enginePaused: string;
  readonly nextGenerationAt: Date | null;
}

export interface ContentAutopilotControlStore {
  read(ownerUserId: string): Promise<ContentAutopilotControlRow | null>;
  update(ownerUserId: string, values: Partial<{
    autopilotEnabled: string;
    autoMediaEnabled: string;
    enginePaused: string;
    nextGenerationAt: Date | null;
    updatedAt: Date;
  }>): Promise<boolean>;
}

export interface ContentAutopilotTenantGate {
  active(ownerUserId: string): Promise<
    | { readonly ok: true; readonly clientId: string; readonly clientName: string }
    | { readonly ok: false; readonly reason: "not_found" | "inactive" }
  >;
  registryReady(ownerUserId: string): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string }
  >;
}

export interface ExecuteContentAutopilotControlInput {
  readonly ownerUserId: string;
  readonly expectedClientId: string;
  readonly action: ContentAutopilotControlAction;
  readonly enabled?: boolean;
  readonly now?: Date;
}

export interface ContentAutopilotControlExecution {
  readonly action: ContentAutopilotControlAction;
  readonly clientId: string;
  readonly clientName: string;
  readonly changed: boolean;
  readonly verified: true;
  readonly before: ContentAutopilotControlState;
  readonly after: ContentAutopilotControlState;
  readonly approvalBoundary: "human_approval_required" | "legacy_non_approval_required";
  readonly externalSideEffects: false;
  readonly providerCalls: false;
  readonly spendAuthorized: false;
  readonly executedAt: string;
}

function bool(value: string | null | undefined): boolean {
  return value === "true";
}

function toState(row: ContentAutopilotControlRow): ContentAutopilotControlState {
  return Object.freeze({
    autopilotEnabled: bool(row.autopilotEnabled),
    autoMediaEnabled: bool(row.autoMediaEnabled),
    enginePaused: bool(row.enginePaused),
    nextGenerationAt: row.nextGenerationAt?.toISOString() ?? null,
    approvalMode: row.approvalMode,
  });
}

/**
 * Canonical bounded derivation for the operator-control path. It intentionally
 * mirrors the existing PUT /auto-content/settings control semantics:
 * - enabling continuous generation unpauses the engine;
 * - first-time enable initializes nextGenerationAt;
 * - disabling continuous generation does not erase the existing schedule timestamp;
 * - omitted controls preserve their current values.
 *
 * The HTTP route is not refactored in A1; parity is regression-tested here so
 * this slice remains small and reversible.
 */
export function deriveContentAutopilotControls(input: {
  readonly existing: Pick<ContentAutopilotControlRow,
    "autopilotEnabled" | "autoMediaEnabled" | "enginePaused" | "nextGenerationAt"> | null;
  readonly autopilotEnabled?: boolean;
  readonly autoMediaEnabled?: boolean;
  readonly enginePaused?: boolean;
  readonly now?: Date;
}): DerivedContentAutopilotControls {
  const existing = input.existing;
  const now = input.now ?? new Date();
  return Object.freeze({
    autopilotEnabled: String(
      typeof input.autopilotEnabled === "boolean"
        ? input.autopilotEnabled
        : existing?.autopilotEnabled === "true",
    ),
    autoMediaEnabled: String(
      typeof input.autoMediaEnabled === "boolean"
        ? input.autoMediaEnabled
        : existing?.autoMediaEnabled === "true",
    ),
    enginePaused: String(
      input.autopilotEnabled === true
        ? false
        : typeof input.enginePaused === "boolean"
          ? input.enginePaused
          : existing?.enginePaused === "true",
    ),
    nextGenerationAt:
      input.autopilotEnabled === true && !existing?.nextGenerationAt
        ? now
        : existing?.nextGenerationAt ?? null,
  });
}

export const DEFAULT_CONTENT_AUTOPILOT_CONTROL_STORE: ContentAutopilotControlStore = Object.freeze({
  async read(ownerUserId) {
    const [row] = await db
      .select({
        autopilotEnabled: autoContentSettingsTable.autopilotEnabled,
        autoMediaEnabled: autoContentSettingsTable.autoMediaEnabled,
        enginePaused: autoContentSettingsTable.enginePaused,
        nextGenerationAt: autoContentSettingsTable.nextGenerationAt,
        approvalMode: autoContentSettingsTable.approvalMode,
      })
      .from(autoContentSettingsTable)
      .where(eq(autoContentSettingsTable.userId, ownerUserId));
    return row ?? null;
  },

  async update(ownerUserId, values) {
    const rows = await db
      .update(autoContentSettingsTable)
      .set(values)
      .where(eq(autoContentSettingsTable.userId, ownerUserId))
      .returning({ userId: autoContentSettingsTable.userId });
    return rows.length === 1;
  },
});

export const DEFAULT_CONTENT_AUTOPILOT_TENANT_GATE: ContentAutopilotTenantGate = Object.freeze({
  async active(ownerUserId) {
    const result = await resolveClientActiveCheck(ownerUserId);
    return result.ok
      ? Object.freeze({ ok: true as const, clientId: result.clientId, clientName: result.clientName })
      : result;
  },

  async registryReady(ownerUserId) {
    const result = await resolveClientContentContextFromDb(ownerUserId);
    return result.found
      ? Object.freeze({ ok: true as const })
      : Object.freeze({ ok: false as const, reason: result.reason });
  },
});

function requiresRegistry(action: ContentAutopilotControlAction): boolean {
  return action !== "pause_content_autopilot";
}

function enablesOperation(action: ContentAutopilotControlAction, enabled: boolean | undefined): boolean {
  return action === "resume_content_autopilot"
    || (action === "set_continuous_generation" && enabled === true)
    || (action === "set_automatic_media" && enabled === true);
}

function assertActionValue(action: ContentAutopilotControlAction, enabled: boolean | undefined): void {
  const valueRequired = action === "set_continuous_generation" || action === "set_automatic_media";
  if (valueRequired && typeof enabled !== "boolean") {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_VALUE_REQUIRED");
  }
  if (!valueRequired && enabled !== undefined) {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_VALUE_NOT_ALLOWED");
  }
}

function sameState(a: ContentAutopilotControlState, b: ContentAutopilotControlState): boolean {
  return a.autopilotEnabled === b.autopilotEnabled
    && a.autoMediaEnabled === b.autoMediaEnabled
    && a.enginePaused === b.enginePaused
    && a.nextGenerationAt === b.nextGenerationAt
    && a.approvalMode === b.approvalMode;
}

export async function executeContentAutopilotControl(
  input: ExecuteContentAutopilotControlInput,
  dependencies: {
    readonly store?: ContentAutopilotControlStore;
    readonly tenantGate?: ContentAutopilotTenantGate;
  } = {},
): Promise<ContentAutopilotControlExecution> {
  const ownerUserId = input.ownerUserId.trim();
  const expectedClientId = input.expectedClientId.trim();
  if (!ownerUserId || !expectedClientId) {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_TARGET_REQUIRED");
  }
  assertActionValue(input.action, input.enabled);

  const store = dependencies.store ?? DEFAULT_CONTENT_AUTOPILOT_CONTROL_STORE;
  const tenantGate = dependencies.tenantGate ?? DEFAULT_CONTENT_AUTOPILOT_TENANT_GATE;
  const now = input.now ?? new Date();

  const active = await tenantGate.active(ownerUserId);
  if (!active.ok) {
    throw new Error(`APOLLOS_MCP_CONTENT_AUTOPILOT_CLIENT_${active.reason.toUpperCase()}`);
  }
  if (active.clientId !== expectedClientId) {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_CLIENT_MISMATCH");
  }

  if (requiresRegistry(input.action)) {
    const registry = await tenantGate.registryReady(ownerUserId);
    if (!registry.ok) {
      throw new Error(`APOLLOS_MCP_CONTENT_AUTOPILOT_${registry.reason.toUpperCase()}`);
    }
  }

  const currentRow = await store.read(ownerUserId);
  if (!currentRow) {
    // Fail closed rather than creating a row that could inherit legacy schema
    // defaults such as auto_schedule. Client onboarding/settings initialization
    // remains the canonical place to create the full settings record.
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_SETTINGS_NOT_INITIALIZED");
  }

  if (enablesOperation(input.action, input.enabled) && currentRow.approvalMode !== "approval_required") {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_APPROVAL_MODE_UNSAFE");
  }

  const before = toState(currentRow);
  let update: Partial<{
    autopilotEnabled: string;
    autoMediaEnabled: string;
    enginePaused: string;
    nextGenerationAt: Date | null;
    updatedAt: Date;
  }>;

  switch (input.action) {
    case "set_continuous_generation": {
      const derived = deriveContentAutopilotControls({
        existing: currentRow,
        autopilotEnabled: input.enabled,
        now,
      });
      update = { ...derived, updatedAt: now };
      break;
    }
    case "set_automatic_media": {
      const derived = deriveContentAutopilotControls({
        existing: currentRow,
        autoMediaEnabled: input.enabled,
        now,
      });
      update = { ...derived, updatedAt: now };
      break;
    }
    case "pause_content_autopilot":
      update = { enginePaused: "true", updatedAt: now };
      break;
    case "resume_content_autopilot":
      update = { enginePaused: "false", updatedAt: now };
      break;
    default: {
      const exhaustive: never = input.action;
      throw new Error(`APOLLOS_MCP_CONTENT_AUTOPILOT_ACTION_INVALID:${exhaustive}`);
    }
  }

  // Compute whether the desired effective state already matches. Avoid writing
  // merely to bump updatedAt on an idempotent replay.
  const previewRow: ContentAutopilotControlRow = {
    ...currentRow,
    autopilotEnabled: update.autopilotEnabled ?? currentRow.autopilotEnabled,
    autoMediaEnabled: update.autoMediaEnabled ?? currentRow.autoMediaEnabled,
    enginePaused: update.enginePaused ?? currentRow.enginePaused,
    nextGenerationAt: update.nextGenerationAt === undefined
      ? currentRow.nextGenerationAt
      : update.nextGenerationAt,
  };
  const preview = toState(previewRow);

  if (!sameState(before, preview)) {
    const updated = await store.update(ownerUserId, update);
    if (!updated) throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_UPDATE_FAILED");
  }

  const verifiedRow = await store.read(ownerUserId);
  if (!verifiedRow) throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_VERIFY_FAILED");
  const after = toState(verifiedRow);
  if (!sameState(after, preview)) {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_VERIFY_FAILED");
  }
  if (after.approvalMode !== currentRow.approvalMode) {
    throw new Error("APOLLOS_MCP_CONTENT_AUTOPILOT_APPROVAL_MODE_CHANGED");
  }

  return Object.freeze({
    action: input.action,
    clientId: active.clientId,
    clientName: active.clientName,
    changed: !sameState(before, after),
    verified: true as const,
    before,
    after,
    approvalBoundary: after.approvalMode === "approval_required"
      ? "human_approval_required" as const
      : "legacy_non_approval_required" as const,
    externalSideEffects: false as const,
    providerCalls: false as const,
    spendAuthorized: false as const,
    executedAt: now.toISOString(),
  });
}
