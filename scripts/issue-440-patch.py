from pathlib import Path
import re


def replace_once(path_str: str, old: str, new: str) -> None:
    path = Path(path_str)
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    assert count == 1, f"{path_str}: expected one literal match, found {count}"
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def sub_once(path_str: str, pattern: str, replacement: str) -> None:
    path = Path(path_str)
    source = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    assert count == 1, f"{path_str}: expected one regex match, found {count}"
    path.write_text(updated, encoding="utf-8")


replace_once(
    "lib/db/src/schema/client-onboarding.ts",
    '  createdByUserId:     text("created_by_user_id"),\n  businessName:',
    '  createdByUserId:     text("created_by_user_id"),\n  provisionedClientId:  uuid("provisioned_client_id"),\n  provisionedAt:        timestamp("provisioned_at", { withTimezone: true }),\n  businessName:',
)
replace_once(
    "lib/db/src/schema/client-onboarding.ts",
    '  id: true, createdAt: true, updatedAt: true,\n',
    '  id: true, provisionedClientId: true, provisionedAt: true, createdAt: true, updatedAt: true,\n',
)

replace_once(
    "artifacts/api-server/src/lib/client-resolver.ts",
    '(async () => {\n  try {\n',
    'export const clientBootstrapReady: Promise<boolean> = (async () => {\n  try {\n',
)
replace_once(
    "artifacts/api-server/src/lib/client-resolver.ts",
    '    console.log("[CLIENT-RESOLVER] clients table ready");\n  } catch (err) {\n    console.error("[CLIENT-RESOLVER] Bootstrap failed:", err);\n  }\n})();',
    '    console.log("[CLIENT-RESOLVER] clients table ready");\n    return true;\n  } catch (err) {\n    console.error("[CLIENT-RESOLVER] Bootstrap failed:", err);\n    return false;\n  }\n})();',
)

replace_once(
    "lib/db/src/client-context.ts",
    '  serviceAreas?: string[] | null;\n  topics?: string[] | null;',
    '  serviceAreas?: string[] | null;\n  region?: string | null;\n  topics?: string[] | null;',
)
sub_once(
    "lib/db/src/client-context.ts",
    r'function deriveRegion\(serviceAreas: string\[\]\): string \{.*?\n\}\n\n/\*\*\n \* Build a ClientContentContext',
    '''function deriveRegion(serviceAreas: string[]): string {
  const firstArea = serviceAreas[0] ?? "";
  const [city, state] = firstArea.split(",").map(s => s.trim());
  if (state) return `${city} area, ${state}`;
  return city || "the local area";
}

/**
 * Build a ClientContentContext''',
)
sub_once(
    "lib/db/src/client-context.ts",
    r'  const registry = registryOverride \?\? bbbRegistryProvider;\n\n  const clientName.*?  const serviceAreas = \(config\?\.serviceAreas\?\.length\)\n    \? \[\.\.\.config\.serviceAreas\]\n    : \[\.\.\.BBB_DEFAULT_SERVICE_AREAS\];',
    '''  const registry = registryOverride ?? bbbRegistryProvider;
  const hasConfig = config !== null;

  const clientName    = config?.clientName?.trim()    || (hasConfig ? "Local Business" : "Bed Bugs & Beyond");
  const industry      = config?.industry?.trim()      || (hasConfig ? "local_service" : "pest_control");
  const approvalMode  = config?.approvalMode?.trim()  || "approval_required";
  const ctaText       = config?.ctaText?.trim()       || (hasConfig ? `Contact ${clientName}` : "Call Now — (251) 324-9090");
  const ctaPreference = config?.ctaPreference?.trim() || (hasConfig ? "contact_business" : "call_now");
  const frequency     = config?.frequency?.trim()     || "every_other_day";

  // Every array field is spread-copied so that mutating one context's fields
  // cannot affect another context or the exported constant arrays. An explicit
  // tenant config never inherits BB&B geography when service areas are empty.
  const serviceAreas = config === null
    ? [...BBB_DEFAULT_SERVICE_AREAS]
    : [...(config.serviceAreas ?? [])];''',
)
replace_once(
    "lib/db/src/client-context.ts",
    '  const region = deriveRegion(serviceAreas);\n',
    '  const region = config === null ? BBB_REGION : (config.region?.trim() || deriveRegion(serviceAreas));\n',
)
replace_once(
    "lib/db/src/client-context.ts",
    '    serviceAreas:  parseJsonSafe<string[]>(client.serviceAreas, []),\n    approvalMode:',
    '    serviceAreas:  parseJsonSafe<string[]>(client.serviceAreas, []),\n    region:        client.region,\n    approvalMode:',
)

replace_once(
    "artifacts/api-server/src/routes/client-onboarding.ts",
    'import { buildStagingRowPreflight } from "../lib/client-onboarding-staging-preflight.js";\n',
    'import { buildStagingRowPreflight } from "../lib/client-onboarding-staging-preflight.js";\nimport { isApollosAdminUser } from "../lib/apollos-admin-access-policy.js";\nimport { CanonicalProvisioningError, provisionCanonicalClient } from "../lib/client-onboarding-provisioning.js";\n',
)
sub_once(
    "artifacts/api-server/src/routes/client-onboarding.ts",
    r'    ALTER TABLE client_onboarding\n      ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;\n\n    CREATE INDEX IF NOT EXISTS client_onboarding_created_by_user_id_idx\n      ON client_onboarding \(created_by_user_id\)\n      WHERE created_by_user_id IS NOT NULL;',
    '''    ALTER TABLE client_onboarding
      ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
      ADD COLUMN IF NOT EXISTS provisioned_client_id UUID,
      ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS client_onboarding_created_by_user_id_idx
      ON client_onboarding (created_by_user_id)
      WHERE created_by_user_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS client_onboarding_provisioned_client_id_idx
      ON client_onboarding (provisioned_client_id)
      WHERE provisioned_client_id IS NOT NULL;''',
)
replace_once(
    "artifacts/api-server/src/routes/client-onboarding.ts",
    '      provisioningStatus: "not_accepted",\n      safety:',
    '      provisioningStatus: row.provisionedClientId ? "provisioned" : "not_accepted",\n      canonicalClientId: row.provisionedClientId ?? null,\n      provisionedAt: row.provisionedAt?.toISOString?.() ?? row.provisionedAt ?? null,\n      safety:',
)
sub_once(
    "artifacts/api-server/src/routes/client-onboarding.ts",
    r'// Provisioning remains deliberately separate from staging ownership\..*?router\.post\("/client-onboarding/:id/deploy", async \(req, res\) => \{.*?\n\}\);\n\n// ── DELETE',
    '''// Canonical provisioning is an internal, no-provider transaction. The target
// tenant identity is accepted only from an explicitly allowlisted Apollos admin.
// Provider activation, phone ordering, messaging, publishing, billing and OAuth
// remain outside this endpoint and are returned as readiness-only work.
router.post("/client-onboarding/:id/deploy", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId || !(await requireOwnershipSchema(res))) return;

  if (!isApollosAdminUser(userId)) {
    return void res.status(403).json({
      error: "Forbidden",
      code: "APOLLOS_ADMIN_REQUIRED",
    });
  }

  const targetIdentitySource = String(req.body?.targetIdentitySource ?? "").trim();
  if (targetIdentitySource !== "clerk_user_id") {
    return void res.status(400).json({
      error: "trusted_target_identity_required",
      code: "TRUSTED_TARGET_IDENTITY_REQUIRED",
      message: "targetIdentitySource must be clerk_user_id and targetUserId must be supplied by an allowlisted admin.",
    });
  }

  try {
    const result = await provisionCanonicalClient({
      stagingId: req.params.id,
      actorUserId: userId,
      targetUserId: req.body?.targetUserId,
    });
    return void res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof CanonicalProvisioningError) {
      return void res.status(error.status).json({
        error: error.message,
        code: error.code,
        ...(error.details !== undefined && { details: error.details }),
      });
    }
    console.error("[client-onboarding] deploy error:", error);
    return void res.status(500).json({ error: "Canonical provisioning failed" });
  }
});

// ── DELETE''',
)
