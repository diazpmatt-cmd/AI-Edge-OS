---
name: B4 multi-tenant test patterns
description: Gotchas when writing vitest tests that use ServiceRegistryProvider, Lakeside fixtures, and bbbRegistryProvider.
---

## Rules

**bbbRegistryProvider import source**
Import from `../../../../../lib/db/src/client-context`, NOT from `bbb-services`. `bbb-services` does not export it.

**bbbRegistryProvider has no getServices()**
The static `bbbRegistryProvider` (client-context.ts) does not expose `getServices()`. Use `BBB_SERVICES` imported directly from `bbb-services` when you need the raw services array for `validateTopicForGenerationWith` / `normalizeTopicsIn`.

**Lakeside fixture type**
`createDbServiceRegistryProvider` takes `DbServiceRecord[]`, not `BBBService[]`. Use `DbServiceRecord` from `db-service-registry-provider`. Required fields include `generationAllowed: true`, `category: "pest" as any` (no plumbing category in the union), `priority`, `contentFrequencyWeight`, `bookingAllowed`, `publishAllowed`, `ctaAllowed`, `allowedContentAngles`, `prohibitedClaims`, `differentiators`, `notes`, `promptRulePrefix`, `sortOrder`.

**matchByTopic miss → undefined, not null**
`ServiceRegistryProvider.matchByTopic` returns `BBBService | undefined`. Use `toBeUndefined()` for the "not found" assertion, never `toBeNull()`.

**makeInput helper null handling**
Using `overrides.someField ?? defaultValue` silently substitutes the default when `null` is passed. Use `"someField" in overrides ? overrides.someField : defaultValue` to preserve explicit `null` overrides.

**'CST' timezone is accepted by V8 in this environment**
V8 `Intl.DateTimeFormat` on this runner accepts `"CST"` as a valid timezone abbreviation. Do not write a test asserting it returns false — it will fail on this platform.

**Why:**
These were all discovered during B4 test authoring (July 2026). Each took multiple attempts to debug because the failure modes were non-obvious (e.g. `bbbRegistryProvider` appearing undefined rather than "wrong import path").
