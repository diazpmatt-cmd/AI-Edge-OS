---
name: Social Posts API response shape
description: The /api/social-posts endpoint returns platforms (plural, string[]) not platform (singular, string). Critical for any page consuming social post data.
---

# Social Posts API — platforms vs platform

The social-posts API `rowToDto()` returns:
- `platforms: string[]` — plural, JSON array parsed from DB column
- NOT `platform: string` — singular field does NOT exist

**Why:** The DB schema stores `platforms` as a JSON string column supporting multi-platform posts. `rowToDto` parses it with `JSON.parse(r.platforms || "[]")`.

**How to apply:** Any TypeScript interface for social post data must use `platforms: string[]`. To get the primary platform for display, use `p.platforms?.[0] ?? ""`. This caused a runtime crash in BBBExecutionPage (p.platform was always undefined).
