import {
  listAuthorizedApollosClients,
  resolveAuthorizedApollosClientTarget,
  type ApollosAuthorizedClient,
  type ApollosClientTargetResolution,
} from "./apollos-client-access.js";
import { buildApollosClientMissionSummary } from "./apollos-client-mission.js";
import {
  buildApollosLiveCoverageForUser,
  type ApollosLiveCoverageResult,
} from "./apollos-client-coverage-live.js";
import { prepareApollosCapabilityActivation } from "./apollos-client-preparation.js";
import { ApollosSafeActionExecutor } from "./apollos-safe-action-executor.js";
import { ApollosFullUtilizationCycleRunner } from "./apollos-full-utilization-cycle.js";
import {
  getApollosClerkOAuthSettings,
  getApollosClerkUser,
  listApollosClerkOAuthApplications,
} from "./apollos-clerk-readonly.js";
import { getApollosHetznerInfrastructure } from "./apollos-hetzner-readonly.js";
import { getApollosReferralPilotStatus } from "./apollos-referral-pilot-status.js";
import { dispatchApollosApprovedReferralInvitation } from "./apollos-referral-dispatch.js";
import { buildLeadRecoveryReadiness } from "./lead-recovery-readiness.js";
import {
  APOLLOS_MCP_EXTERNAL_WRITE_ANNOTATIONS,
  APOLLOS_MCP_INTERNAL_WRITE_ANNOTATIONS,
  APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
} from "./apollos-client-mcp-auth.js";

const CLIENT_ID_PROPERTY = Object.freeze({ type: "string", minLength: 1, maxLength: 100 });
const CAPABILITY_KEY_PROPERTY = Object.freeze({ type: "string", minLength: 1, maxLength: 100 });
const CLERK_USER_ID_PROPERTY = Object.freeze({ type: "string", minLength: 1, maxLength: 200 });
const REFERRAL_INVITATION_ID_PROPERTY = Object.freeze({ type: "string", format: "uuid" });
const REFERRAL_MODE_PROPERTY = Object.freeze({ type: "string", enum: ["dry_run", "live"] });
const REFERRAL_CONFIRM_PROPERTY = Object.freeze({ type: "boolean", const: true });
const REFERRAL_IDEMPOTENCY_KEY_PROPERTY = Object.freeze({
  type: "string",
  minLength: 8,
  maxLength: 120,
  pattern: "^[A-Za-z0-9:_-]{8,120}$",
});
const TOOL_AUTH = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: APOLLOS_MCP_READ_ONLY_ANNOTATIONS,
});
const TOOL_INTERNAL_WRITE_AUTH = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: APOLLOS_MCP_INTERNAL_WRITE_ANNOTATIONS,
});
const TOOL_EXTERNAL_WRITE_AUTH = Object.freeze({
  securitySchemes: APOLLOS_MCP_OAUTH_SECURITY_SCHEMES,
  annotations: APOLLOS_MCP_EXTERNAL_WRITE_ANNOTATIONS,
});

export const APOLLOS_CLIENT_MCP_TOOLS = Object.freeze([
  {
    ...TOOL_AUTH,
    name: "apollos_list_clients",
    description: "List the AI Edge client tenants the authenticated actor is authorized to operate.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_get_client_context",
    description: "Return safe business context and enabled services for one authorized AI Edge client.",
    inputSchema: {
      type: "object",
      properties: { clientId: CLIENT_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_get_client_coverage",
    description: "Audit meaningful utilization across all AI Edge capabilities applicable to one authorized client.",
    inputSchema: {
      type: "object",
      properties: { clientId: CLIENT_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_get_activation_plan",
    description: "Return the prioritized plan for closing one authorized client's current AI Edge capability gaps.",
    inputSchema: {
      type: "object",
      properties: { clientId: CLIENT_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_get_full_utilization",
    description: "Answer the operator mission: make sure one authorized client is using everything AI Edge currently offers.",
    inputSchema: {
      type: "object",
      properties: { clientId: CLIENT_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_get_capability_status",
    description: "Return status and recommended action for one AI Edge capability for one authorized client.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: CLIENT_ID_PROPERTY,
        capabilityKey: CAPABILITY_KEY_PROPERTY,
      },
      required: ["capabilityKey"],
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_prepare_activation",
    description: "Prepare one authorized client's next activation action and authorization boundary without external side effects.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: CLIENT_ID_PROPERTY,
        capabilityKey: CAPABILITY_KEY_PROPERTY,
      },
      required: ["capabilityKey"],
      additionalProperties: false,
    },
  },
  {
    ...TOOL_INTERNAL_WRITE_AUTH,
    name: "apollos_execute_safe_action",
    description: "Execute one allowlisted SAFE_AUTOMATIC_ACTION for an authorized client. Rejects OAuth, publishing, outreach, provider-spend, external-configuration, and unimplemented actions.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: CLIENT_ID_PROPERTY,
        capabilityKey: CAPABILITY_KEY_PROPERTY,
      },
      required: ["capabilityKey"],
      additionalProperties: false,
    },
  },
  {
    ...TOOL_INTERNAL_WRITE_AUTH,
    name: "apollos_run_full_utilization_cycle",
    description: "Do everything currently safe and implemented for one authorized client, refresh state after successful actions, and return the remaining OAuth, approval, setup, and unimplemented queue.",
    inputSchema: {
      type: "object",
      properties: { clientId: CLIENT_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_get_referral_pilot_status",
    description: "Return non-PII Referral pilot readiness, local GorillaDesk aggregate sync evidence, invitation counts, and delivery/attribution evidence for one authorized client.",
    inputSchema: {
      type: "object",
      properties: { clientId: CLIENT_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_get_lead_recovery_readiness",
    description: "Return sanitized Lead Recovery and AI Receptionist production readiness for one authorized client, including Telnyx config presence, endpoint state, transfer safety, recovery ownership, and live-test readiness. Never returns credential values or customer communications.",
    inputSchema: {
      type: "object",
      properties: { clientId: CLIENT_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_EXTERNAL_WRITE_AUTH,
    name: "apollos_dispatch_approved_referral_invitation",
    description: "Dispatch exactly one already-approved Referral invitation through the canonical delivery path. Live mode may contact the invitation recipient; no destination or message body is accepted through MCP.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: CLIENT_ID_PROPERTY,
        invitationId: REFERRAL_INVITATION_ID_PROPERTY,
        requestedMode: REFERRAL_MODE_PROPERTY,
        confirmDispatch: REFERRAL_CONFIRM_PROPERTY,
        idempotencyKey: REFERRAL_IDEMPOTENCY_KEY_PROPERTY,
      },
      required: ["invitationId", "requestedMode", "confirmDispatch", "idempotencyKey"],
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_clerk_get_oauth_settings",
    description: "Admin-only: inspect Clerk OAuth application settings used by AI Edge OS, including dynamic client registration and default scopes. Never returns secrets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_clerk_list_oauth_applications",
    description: "Admin-only: list sanitized Clerk OAuth applications and dynamically registered clients. Never returns client secrets or access tokens.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_clerk_get_user",
    description: "Admin-only: return sanitized Clerk identity details for the authenticated admin or a specified Clerk user ID.",
    inputSchema: {
      type: "object",
      properties: { userId: CLERK_USER_ID_PROPERTY },
      additionalProperties: false,
    },
  },
  {
    ...TOOL_AUTH,
    name: "apollos_hetzner_get_infrastructure",
    description: "Admin-only: inspect sanitized Hetzner Cloud servers, public IPs, and firewall configuration. Read-only and never returns API credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const);

export type ApollosClientMcpToolName = typeof APOLLOS_CLIENT_MCP_TOOLS[number]["name"];

export interface ApollosClientMcpExecutionContext {
  /** Authenticated actor identity supplied by the transport/authentication layer. */
  readonly userId: string;
  readonly actorReference: string;
}

export interface ApollosClientMcpResult {
  readonly tool: ApollosClientMcpToolName;
  readonly actorReference: string;
  readonly clientId: string | null;
  readonly sideEffects: boolean;
  readonly data: unknown;
}

export type ApollosLiveCoverageBuilder = (ownerUserId: string) => Promise<ApollosLiveCoverageResult>;
export type ApollosClientListBuilder = (actorUserId: string) => Promise<readonly ApollosAuthorizedClient[]>;
export type ApollosClientTargetResolver = (
  actorUserId: string,
  requestedClientId?: string | null,
) => Promise<ApollosClientTargetResolution>;

interface ParsedArguments {
  readonly clientId: string | null;
  readonly capabilityKey: string | null;
}

interface ParsedReferralDispatchArguments {
  readonly clientId: string | null;
  readonly invitationId: string;
  readonly requestedMode: "dry_run" | "live";
  readonly confirmDispatch: true;
  readonly idempotencyKey: string;
}

function parseArguments(input: {
  readonly value: unknown;
  readonly capabilityRequired: boolean;
  readonly allowClientId: boolean;
}): ParsedArguments {
  const value = input.value ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set(input.capabilityRequired
    ? ["clientId", "capabilityKey"]
    : input.allowClientId ? ["clientId"] : []);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }

  const rawClientId = record.clientId;
  const clientId = rawClientId === undefined
    ? null
    : typeof rawClientId === "string" && rawClientId.trim() && rawClientId.trim().length <= 100
      ? rawClientId.trim()
      : (() => { throw new Error("APOLLOS_MCP_CLIENT_ID_INVALID"); })();

  const rawCapabilityKey = record.capabilityKey;
  const capabilityKey = rawCapabilityKey === undefined
    ? null
    : typeof rawCapabilityKey === "string" && rawCapabilityKey.trim() && rawCapabilityKey.trim().length <= 100
      ? rawCapabilityKey.trim()
      : (() => { throw new Error("APOLLOS_MCP_CAPABILITY_KEY_INVALID"); })();

  if (input.capabilityRequired && !capabilityKey) {
    throw new Error("APOLLOS_MCP_CAPABILITY_KEY_INVALID");
  }

  return Object.freeze({ clientId, capabilityKey });
}

function parseReferralDispatchArguments(value: unknown): ParsedReferralDispatchArguments {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "clientId",
    "invitationId",
    "requestedMode",
    "confirmDispatch",
    "idempotencyKey",
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }

  const rawClientId = record.clientId;
  const clientId = rawClientId === undefined
    ? null
    : typeof rawClientId === "string" && rawClientId.trim() && rawClientId.trim().length <= 100
      ? rawClientId.trim()
      : (() => { throw new Error("APOLLOS_MCP_CLIENT_ID_INVALID"); })();
  const invitationId = typeof record.invitationId === "string" ? record.invitationId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitationId)) {
    throw new Error("APOLLOS_MCP_REFERRAL_INVITATION_ID_INVALID");
  }
  if (record.requestedMode !== "dry_run" && record.requestedMode !== "live") {
    throw new Error("APOLLOS_MCP_REFERRAL_MODE_INVALID");
  }
  if (record.confirmDispatch !== true) {
    throw new Error("APOLLOS_MCP_REFERRAL_CONFIRMATION_REQUIRED");
  }
  const idempotencyKey = typeof record.idempotencyKey === "string" ? record.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey)) {
    throw new Error("APOLLOS_MCP_REFERRAL_IDEMPOTENCY_KEY_INVALID");
  }

  return Object.freeze({
    clientId,
    invitationId,
    requestedMode: record.requestedMode,
    confirmDispatch: true as const,
    idempotencyKey,
  });
}

function parseOptionalClerkUserId(value: unknown): string | null {
  const input = value ?? {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "userId")) {
    throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
  }
  if (record.userId === undefined) return null;
  if (typeof record.userId !== "string" || !record.userId.trim() || record.userId.trim().length > 200) {
    throw new Error("APOLLOS_MCP_CLERK_USER_ID_INVALID");
  }
  return record.userId.trim();
}

function assertToolName(value: unknown): ApollosClientMcpToolName {
  if (typeof value !== "string") throw new Error("APOLLOS_MCP_TOOL_INVALID");
  if (!APOLLOS_CLIENT_MCP_TOOLS.some((tool) => tool.name === value)) {
    throw new Error("APOLLOS_MCP_TOOL_INVALID");
  }
  return value as ApollosClientMcpToolName;
}

function requiresOperatorAccess(tool: ApollosClientMcpToolName): boolean {
  return tool === "apollos_execute_safe_action"
    || tool === "apollos_run_full_utilization_cycle"
    || tool === "apollos_dispatch_approved_referral_invitation";
}

function isClerkControlPlaneTool(tool: ApollosClientMcpToolName): boolean {
  return tool === "apollos_clerk_get_oauth_settings"
    || tool === "apollos_clerk_list_oauth_applications"
    || tool === "apollos_clerk_get_user";
}

export class ApollosClientMcpRuntime {
  private readonly fullUtilizationCycle: ApollosFullUtilizationCycleRunner;

  constructor(
    private readonly buildLiveCoverage: ApollosLiveCoverageBuilder = buildApollosLiveCoverageForUser,
    private readonly listClients: ApollosClientListBuilder = listAuthorizedApollosClients,
    private readonly resolveTarget: ApollosClientTargetResolver = resolveAuthorizedApollosClientTarget,
    private readonly safeActionExecutor: ApollosSafeActionExecutor = new ApollosSafeActionExecutor(),
    fullUtilizationCycle?: ApollosFullUtilizationCycleRunner,
  ) {
    this.fullUtilizationCycle = fullUtilizationCycle
      ?? new ApollosFullUtilizationCycleRunner(this.buildLiveCoverage, this.safeActionExecutor);
  }

  listTools(): typeof APOLLOS_CLIENT_MCP_TOOLS {
    return APOLLOS_CLIENT_MCP_TOOLS;
  }

  async execute(input: {
    readonly context: ApollosClientMcpExecutionContext;
    readonly toolName: unknown;
    readonly arguments?: unknown;
  }): Promise<ApollosClientMcpResult> {
    const actorUserId = input.context.userId.trim();
    if (!actorUserId || !input.context.actorReference.trim()) {
      throw new Error("APOLLOS_MCP_IDENTITY_REQUIRED");
    }

    const tool = assertToolName(input.toolName);
    if (tool === "apollos_list_clients") {
      parseArguments({ value: input.arguments, capabilityRequired: false, allowClientId: false });
      const clients = await this.listClients(actorUserId);
      return Object.freeze({
        tool,
        actorReference: input.context.actorReference,
        clientId: null,
        sideEffects: false,
        data: Object.freeze({ clients }),
      });
    }

    if (isClerkControlPlaneTool(tool)) {
      let data: unknown;
      if (tool === "apollos_clerk_get_user") {
        const requestedUserId = parseOptionalClerkUserId(input.arguments);
        data = await getApollosClerkUser(actorUserId, requestedUserId);
      } else {
        parseArguments({ value: input.arguments, capabilityRequired: false, allowClientId: false });
        data = tool === "apollos_clerk_get_oauth_settings"
          ? await getApollosClerkOAuthSettings(actorUserId)
          : await listApollosClerkOAuthApplications(actorUserId);
      }
      return Object.freeze({
        tool,
        actorReference: input.context.actorReference,
        clientId: null,
        sideEffects: false,
        data,
      });
    }

    if (tool === "apollos_hetzner_get_infrastructure") {
      parseArguments({ value: input.arguments, capabilityRequired: false, allowClientId: false });
      const data = await getApollosHetznerInfrastructure(actorUserId);
      return Object.freeze({
        tool,
        actorReference: input.context.actorReference,
        clientId: null,
        sideEffects: false,
        data,
      });
    }

    const referralDispatch = tool === "apollos_dispatch_approved_referral_invitation"
      ? parseReferralDispatchArguments(input.arguments)
      : null;
    const capabilityRequired = tool === "apollos_get_capability_status"
      || tool === "apollos_prepare_activation"
      || tool === "apollos_execute_safe_action";
    const parsed = referralDispatch
      ? Object.freeze({ clientId: referralDispatch.clientId, capabilityKey: null })
      : parseArguments({
          value: input.arguments,
          capabilityRequired,
          allowClientId: true,
        });

    const resolution = await this.resolveTarget(actorUserId, parsed.clientId);
    if (!resolution.ok) {
      throw new Error(`APOLLOS_MCP_CLIENT_${resolution.reason.toUpperCase()}`);
    }
    if (requiresOperatorAccess(tool) && resolution.target.accessLevel === "viewer") {
      throw new Error("APOLLOS_MCP_CLIENT_WRITE_UNAUTHORIZED");
    }

    const live = await this.buildLiveCoverage(resolution.target.ownerUserId);
    if (!live.ok) {
      throw new Error(`APOLLOS_MCP_CLIENT_${live.reason.toUpperCase()}`);
    }
    if (live.context.clientId !== resolution.target.clientId) {
      throw new Error("APOLLOS_MCP_CLIENT_RESOLUTION_MISMATCH");
    }

    let data: unknown;
    let sideEffects = false;
    switch (tool) {
      case "apollos_get_client_context":
        data = live.context;
        break;
      case "apollos_get_client_coverage":
        data = live.coverage;
        break;
      case "apollos_get_activation_plan":
        data = live.activationPlan;
        break;
      case "apollos_get_full_utilization":
        data = buildApollosClientMissionSummary({
          coverage: live.coverage,
          activationPlan: live.activationPlan,
        });
        break;
      case "apollos_get_capability_status": {
        const current = live.coverage.capabilities.find(
          (candidate) => candidate.capability.key === parsed.capabilityKey,
        );
        if (!current) throw new Error("APOLLOS_MCP_CAPABILITY_NOT_FOUND");
        data = current;
        break;
      }
      case "apollos_prepare_activation": {
        const prepared = prepareApollosCapabilityActivation(live, parsed.capabilityKey!);
        if (prepared.status === "capability_not_found") {
          throw new Error("APOLLOS_MCP_CAPABILITY_NOT_FOUND");
        }
        data = prepared;
        break;
      }
      case "apollos_execute_safe_action": {
        const execution = await this.safeActionExecutor.execute({
          live,
          ownerUserId: resolution.target.ownerUserId,
          capabilityKey: parsed.capabilityKey!,
        });
        data = execution;
        sideEffects = execution.status === "executed";
        break;
      }
      case "apollos_run_full_utilization_cycle": {
        const cycle = await this.fullUtilizationCycle.run({
          ownerUserId: resolution.target.ownerUserId,
          initialLive: live,
        });
        data = cycle;
        sideEffects = cycle.sideEffects;
        break;
      }
      case "apollos_get_referral_pilot_status":
        data = await getApollosReferralPilotStatus(resolution.target.clientId);
        break;
      case "apollos_get_lead_recovery_readiness":
        data = await buildLeadRecoveryReadiness(resolution.target.clientId);
        break;
      case "apollos_dispatch_approved_referral_invitation": {
        if (!referralDispatch) throw new Error("APOLLOS_MCP_ARGUMENTS_INVALID");
        const dispatch = await dispatchApollosApprovedReferralInvitation({
          clientId: resolution.target.clientId,
          actorUserId,
          invitationId: referralDispatch.invitationId,
          requestedMode: referralDispatch.requestedMode,
          idempotencyKey: referralDispatch.idempotencyKey,
        });
        data = dispatch;
        sideEffects = !dispatch.idempotent;
        break;
      }
      default:
        throw new Error("APOLLOS_MCP_TOOL_INVALID");
    }

    return Object.freeze({
      tool,
      actorReference: input.context.actorReference,
      clientId: resolution.target.clientId,
      sideEffects,
      data,
    });
  }
}
