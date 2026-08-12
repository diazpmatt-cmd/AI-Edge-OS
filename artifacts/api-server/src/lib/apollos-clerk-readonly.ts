import { isApollosAdminUser } from "./apollos-admin-access-policy.js";

const CLERK_BAPI_BASE = "https://api.clerk.com/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

interface ClerkBapiResponse {
  readonly status: number;
  readonly body: unknown;
}

function requireAdmin(userId: string): void {
  if (!isApollosAdminUser(userId)) {
    throw new Error("APOLLOS_MCP_CLERK_ADMIN_REQUIRED");
  }
}

function requireSecret(): string {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error("APOLLOS_MCP_CLERK_NOT_CONFIGURED");
  return secret;
}

async function clerkBapi(path: string): Promise<ClerkBapiResponse> {
  const secret = requireSecret();
  let response: globalThis.Response;
  try {
    response = await fetch(`${CLERK_BAPI_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw new Error("APOLLOS_MCP_CLERK_UNAVAILABLE");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("APOLLOS_MCP_CLERK_AUTH_FAILED");
    }
    throw new Error("APOLLOS_MCP_CLERK_UNAVAILABLE");
  }

  return Object.freeze({ status: response.status, body });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? Object.freeze(value.filter((item): item is string => typeof item === "string"))
    : Object.freeze([]);
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boundedString(value: unknown, max = 300): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function paginatedData(value: unknown): readonly unknown[] {
  const payload = record(value);
  return Array.isArray(payload.data) ? payload.data : Array.isArray(value) ? value : [];
}

function paginatedCount(value: unknown): number {
  const payload = record(value);
  return nullableNumber(payload.total_count ?? payload.totalCount) ?? paginatedData(value).length;
}

function sanitizeOAuthApplication(value: unknown): Readonly<Record<string, unknown>> {
  const app = record(value);
  return Object.freeze({
    id: app.id ?? null,
    name: app.name ?? null,
    clientId: app.client_id ?? app.clientId ?? null,
    public: app.public ?? app.is_public ?? app.isPublic ?? null,
    dynamicallyRegistered: app.dynamically_registered ?? app.dynamicallyRegistered ?? null,
    consentScreenEnabled: app.consent_screen_enabled ?? app.consentScreenEnabled ?? null,
    redirectUris: stringArray(app.redirect_uris ?? app.redirectUris),
    scopes: typeof app.scopes === "string" ? app.scopes : stringArray(app.scopes),
    createdAt: app.created_at ?? app.createdAt ?? null,
    updatedAt: app.updated_at ?? app.updatedAt ?? null,
  });
}

function sanitizeEmailAddresses(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map((entry) => {
    const email = record(entry);
    const verification = record(email.verification);
    return Object.freeze({
      id: email.id ?? null,
      emailAddress: email.email_address ?? email.emailAddress ?? null,
      verificationStatus: verification.status ?? null,
    });
  }));
}

function sanitizeOrganization(value: unknown): Readonly<Record<string, unknown>> {
  const organization = record(value);
  return Object.freeze({
    id: boundedString(organization.id, 200),
    name: boundedString(organization.name, 250),
    slug: boundedString(organization.slug, 250),
    membersCount: nullableNumber(organization.members_count ?? organization.membersCount),
    maxAllowedMemberships: nullableNumber(organization.max_allowed_memberships ?? organization.maxAllowedMemberships),
  });
}

function sanitizeMembership(value: unknown): Readonly<Record<string, unknown>> {
  const membership = record(value);
  const organization = record(membership.organization);
  return Object.freeze({
    id: boundedString(membership.id, 200),
    role: boundedString(membership.role, 200),
    organization: Object.freeze({
      id: boundedString(organization.id, 200),
      name: boundedString(organization.name, 250),
      slug: boundedString(organization.slug, 250),
    }),
    createdAt: membership.created_at ?? membership.createdAt ?? null,
    updatedAt: membership.updated_at ?? membership.updatedAt ?? null,
  });
}

export async function getApollosClerkOAuthSettings(actorUserId: string): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);
  const { body } = await clerkBapi("/instance/oauth_application_settings");
  const settings = record(body);
  return Object.freeze({
    dynamicClientRegistrationEnabled:
      settings.dynamic_client_registration_enabled
      ?? settings.dynamicClientRegistrationEnabled
      ?? settings.enabled
      ?? null,
    defaultScopes: stringArray(settings.default_scopes ?? settings.defaultScopes),
  });
}

export async function listApollosClerkOAuthApplications(actorUserId: string): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);
  const { body } = await clerkBapi("/oauth_applications?limit=100&order_by=-created_at");
  const payload = record(body);
  const data = Array.isArray(payload.data) ? payload.data : Array.isArray(body) ? body : [];
  return Object.freeze({
    totalCount: payload.total_count ?? payload.totalCount ?? data.length,
    applications: Object.freeze(data.map(sanitizeOAuthApplication)),
  });
}

export async function getApollosClerkUser(
  actorUserId: string,
  requestedUserId?: string | null,
): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);
  const userId = requestedUserId?.trim() || actorUserId;
  if (!userId || userId.length > 200) throw new Error("APOLLOS_MCP_CLERK_USER_ID_INVALID");

  const { body } = await clerkBapi(`/users/${encodeURIComponent(userId)}`);
  const user = record(body);
  return Object.freeze({
    id: user.id ?? null,
    username: user.username ?? null,
    firstName: user.first_name ?? user.firstName ?? null,
    lastName: user.last_name ?? user.lastName ?? null,
    primaryEmailAddressId: user.primary_email_address_id ?? user.primaryEmailAddressId ?? null,
    emailAddresses: sanitizeEmailAddresses(user.email_addresses ?? user.emailAddresses),
    lastSignInAt: user.last_sign_in_at ?? user.lastSignInAt ?? null,
    createdAt: user.created_at ?? user.createdAt ?? null,
    updatedAt: user.updated_at ?? user.updatedAt ?? null,
  });
}

export async function getApollosClerkInstanceDiagnostics(
  actorUserId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);
  const userId = actorUserId.trim();
  if (!userId || userId.length > 200) throw new Error("APOLLOS_MCP_CLERK_USER_ID_INVALID");

  const [instanceResponse, organizationSettingsResponse, organizationsResponse, membershipsResponse] = await Promise.all([
    clerkBapi("/instance"),
    clerkBapi("/instance/organization_settings"),
    clerkBapi("/organizations?limit=100&include_members_count=true"),
    clerkBapi(`/users/${encodeURIComponent(userId)}/organization_memberships?limit=100`),
  ]);

  const instance = record(instanceResponse.body);
  const organizationSettings = record(organizationSettingsResponse.body);
  const forceOrganizationSelection = nullableBoolean(
    organizationSettings.force_organization_selection
    ?? organizationSettings.forceOrganizationSelection,
  );
  const organizations = paginatedData(organizationsResponse.body).map(sanitizeOrganization);
  const memberships = paginatedData(membershipsResponse.body).map(sanitizeMembership);

  return Object.freeze({
    instance: Object.freeze({
      environmentType: boundedString(instance.environment_type ?? instance.environmentType, 40),
      allowedOrigins: stringArray(instance.allowed_origins ?? instance.allowedOrigins),
    }),
    organizations: Object.freeze({
      enabled: nullableBoolean(organizationSettings.enabled),
      membershipRequired: forceOrganizationSelection,
      personalAccountsEnabled: forceOrganizationSelection === null ? null : !forceOrganizationSelection,
      domainsEnabled: nullableBoolean(organizationSettings.domains_enabled ?? organizationSettings.domainsEnabled),
      domainsEnrollmentModes: stringArray(
        organizationSettings.domains_enrollment_modes
        ?? organizationSettings.domainsEnrollmentModes,
      ),
      creatorRole: boundedString(organizationSettings.creator_role ?? organizationSettings.creatorRole, 200),
      domainsDefaultRole: boundedString(
        organizationSettings.domains_default_role
        ?? organizationSettings.domainsDefaultRole,
        200,
      ),
      maxAllowedMemberships: nullableNumber(
        organizationSettings.max_allowed_memberships
        ?? organizationSettings.maxAllowedMemberships,
      ),
      maxAllowedPermissions: nullableNumber(
        organizationSettings.max_allowed_permissions
        ?? organizationSettings.maxAllowedPermissions,
      ),
      maxAllowedRoles: nullableNumber(
        organizationSettings.max_allowed_roles
        ?? organizationSettings.maxAllowedRoles,
      ),
      slugDisabled: nullableBoolean(organizationSettings.slug_disabled ?? organizationSettings.slugDisabled),
      adminDeleteEnabled: nullableBoolean(
        organizationSettings.admin_delete_enabled
        ?? organizationSettings.adminDeleteEnabled,
      ),
      totalOrganizations: paginatedCount(organizationsResponse.body),
      items: Object.freeze(organizations),
    }),
    actorMemberships: Object.freeze({
      totalCount: paginatedCount(membershipsResponse.body),
      items: Object.freeze(memberships),
    }),
    interpretation: Object.freeze({
      membershipPolicyKnown: forceOrganizationSelection !== null,
      actorHasOrganizationMembership: memberships.length > 0,
      requiresDashboardConfirmation: forceOrganizationSelection === null,
    }),
  });
}
