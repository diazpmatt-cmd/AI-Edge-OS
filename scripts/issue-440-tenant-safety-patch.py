from pathlib import Path


def replace_once(path_str: str, old: str, new: str) -> None:
    path = Path(path_str)
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    assert count == 1, f"{path_str}: expected one match, found {count}"
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


context_path = "lib/db/src/client-context.ts"
replace_once(
    context_path,
    "};\n\n// ── ClientContentContext ───────────────────────────────────────────────────────",
    '''};

/**
 * Fail-closed registry used only when an explicit tenant config is supplied
 * without a resolved tenant registry. It intentionally exposes no BB&B service
 * data and allows no content-generation topics.
 */
export const unconfiguredRegistryProvider: ServiceRegistryProvider = {
  getGeneratableServices: () => [],
  matchByTopic: () => undefined,
  getPromptRules: () => "",
  validateTopic: () => "SERVICE_NOT_GENERATABLE",
  selectWeeklySlots: () => [],
  normalizeTopics: () => [],
  getDefaultTopics: () => [],
  getSystemBusinessRules: () =>
    "BUSINESS RULES (MUST FOLLOW):\\n- No tenant service registry is configured. Do not generate or publish client-specific service claims.",
};

// ── ClientContentContext ───────────────────────────────────────────────────────''',
)
replace_once(
    context_path,
    "  const registry = registryOverride ?? bbbRegistryProvider;\n  const hasConfig = config !== null;",
    "  const registry = registryOverride ?? (config === null ? bbbRegistryProvider : unconfiguredRegistryProvider);\n  const hasConfig = config !== null;",
)

test_path = "artifacts/ai-edge-solutions/src/lib/__tests__/client-context.test.ts"
replace_once(
    test_path,
    '''    it("supplying only clientName overrides the name but keeps BB&B geography", () => {
      const ctx = buildClientContentContext({ clientName: "Gulf Pest Pros" });
      expect(ctx.clientName).toBe("Gulf Pest Pros");
      // All Alabama service areas → still derives BB&B region
      expect(ctx.region).toBe(BBB_REGION);
      expect(ctx.registry).toBe(bbbRegistryProvider);
    });''',
    '''    it("supplying only clientName does not inherit BB&B geography or registry", () => {
      const ctx = buildClientContentContext({ clientName: "Gulf Pest Pros" });
      expect(ctx.clientName).toBe("Gulf Pest Pros");
      expect(ctx.serviceAreas).toEqual([]);
      expect(ctx.region).toBe("the local area");
      expect(ctx.registry).not.toBe(bbbRegistryProvider);
    });''',
)
replace_once(
    test_path,
    '''    it("supplying only serviceAreas keeps clientName default", () => {
      const ctx = buildClientContentContext({
        serviceAreas: ["Austin, TX", "Round Rock, TX"],
      });
      expect(ctx.clientName).toBe("Bed Bugs & Beyond");
      expect(ctx.serviceAreas).toEqual(["Austin, TX", "Round Rock, TX"]);
      expect(ctx.region).not.toContain("Baldwin County");
    });''',
    '''    it("supplying only serviceAreas uses a neutral non-BB&B identity", () => {
      const ctx = buildClientContentContext({
        serviceAreas: ["Austin, TX", "Round Rock, TX"],
      });
      expect(ctx.clientName).toBe("Local Business");
      expect(ctx.serviceAreas).toEqual(["Austin, TX", "Round Rock, TX"]);
      expect(ctx.region).toBe("Austin area, TX");
      expect(ctx.registry).not.toBe(bbbRegistryProvider);
    });''',
)
replace_once(
    test_path,
    '''  it("empty serviceAreas array falls back to BBB_DEFAULT_SERVICE_AREAS", () => {
    const ctx = buildClientContentContext({ serviceAreas: [] });
    expect(ctx.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
  });''',
    '''  it("empty serviceAreas on an explicit tenant config stays empty", () => {
    const ctx = buildClientContentContext({ serviceAreas: [] });
    expect(ctx.serviceAreas).toEqual([]);
    expect(ctx.region).toBe("the local area");
  });''',
)
replace_once(
    test_path,
    '''  it("null serviceAreas falls back to BBB_DEFAULT_SERVICE_AREAS", () => {
    const ctx = buildClientContentContext({ serviceAreas: null });
    expect(ctx.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
  });''',
    '''  it("null serviceAreas on an explicit tenant config stays empty", () => {
    const ctx = buildClientContentContext({ serviceAreas: null });
    expect(ctx.serviceAreas).toEqual([]);
    expect(ctx.region).toBe("the local area");
  });''',
)
replace_once(
    test_path,
    '''  it("Alabama service areas always derive the canonical BB&B region string", () => {
    // Any subset of Alabama cities should produce the canonical BB&B region
    const ctx = buildClientContentContext({
      serviceAreas: ["Mobile, AL", "Huntsville, AL"],
    });
    expect(ctx.region).toBe(BBB_REGION);
  });''',
    '''  it("non-BB&B Alabama service areas derive a tenant-neutral region", () => {
    const ctx = buildClientContentContext({
      serviceAreas: ["Mobile, AL", "Huntsville, AL"],
    });
    expect(ctx.region).toBe("Mobile area, AL");
    expect(ctx.region).not.toBe(BBB_REGION);
  });''',
)
