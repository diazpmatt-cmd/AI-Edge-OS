# ADR-007: C8R-5 Tenant-Safe AI Visibility Read Model

**Status:** Accepted
**Date:** 2026-07-13
**Decision owners:** Matthew Diaz (final authority), AI Edge OS architecture review

## Context

AI Edge OS already has canonical systems for Local Presence, Discovery, backlinks, reviews, content preparation and publishing, and connected Google state. A useful AI Visibility view must combine those records into prioritized, explainable recommendations without creating another source of truth or implying that unavailable integrations have produced evidence.

The legacy `ai_visibility_audits` system predates the canonical Growth Engine architecture. Its JSON summaries are not tenant-safe canonical evidence and cannot be used as an input to C8R-5.

Bed Bugs & Beyond is the golden-template client. Its active-service, positioning, tenant, and Baldwin County geography constraints must be enforced before any recommendation is prioritized.

## Decision

C8R-5 defines AI Visibility as a pure, deterministic, tenant-safe read model over bounded normalized inputs supplied by separate canonical-source adapters. It adds contracts, adapters, composition, prioritization, fixture examples, and pure tests only. It adds no persistence or runtime integration.

## Canonical source ownership

- Local Presence owns GBP facts, directories, citations, NAP consistency, and tenant-safe reviews.
- Discovery owns canonical evidence, clusters, and opportunities.
- The backlink system owns backlink prospects, immutable evidence, opportunities, and pursuit workflows.
- Content Autopilot owns preparation, approval, queueing, scheduling, publishing, failure, and measurement state.
- Connected Google systems own bounded connection and measurement summaries when those integrations exist.
- AI Visibility owns only the deterministic projection and recommendation explanation produced from those sources.

No adapter accepts legacy `ai_visibility_audits`, and no C8R-5 type identifies it as an evidence source.

## Pure adapter and composer separation

Adapters translate canonical records into bounded normalized inputs and coverage diagnostics. The composer accepts only those inputs and an explicit authorized tenant/service/geography scope.

The composer has no database, schema, API route, environment-variable, OAuth, network, provider-client, scheduler, or external-action dependency. This makes input validation, rejection, deduplication, scoring, provenance, and ordering deterministic and testable.

## Deterministic prioritization

Potential value and attainability remain separate outputs; no generic SEO or AI Visibility score is created.

Potential value weights:

- Business impact: 30%
- Evidence strength: 25%
- Local impact: 20%
- Service priority: 15%
- Urgency: 10%

Attainability weights:

- Relationship access: 25%
- Workflow readiness: 20%
- Effort ease: 20%
- Freshness: 15%
- Local relevance: 10%
- Service relevance: 10%

Priority thresholds are explicit: critical at 80, high at 65, medium at 45, and low below 45. Canonical backlink potential and attainability values pass through separately rather than being recomputed as a single score.

## Source availability diagnostics

Missing data is never converted to a zero score. Each source reports an explicit bounded status such as `available`, `not_connected`, `not_implemented`, `not_tenant_safe`, or `no_observation`. Coverage affects the completeness summary, not the score of unrelated observed evidence.

## Canonical references and bounded provenance

Every recommendation retains bounded canonical references containing source, record type, record ID, client ID, and observation time. Evidence and reference arrays are capped, normalized, deduplicated, and stably ordered. Duplicate observations merge provenance deterministically while canonical workflow precedence selects the existing execution workflow.

Recommendations explain what was observed, why it matters, what evidence supports it, which existing workflow owns the next action, and whether human approval is required.

## Lifecycle-facet preservation

Content state is projected through four separate facets:

- Preparation: generated, draft, or not applicable
- Approval: not approved, pending, approved, rejected, not required, or not applicable
- Dispatch: not queued, queued, scheduled, or not applicable
- Delivery: not attempted, publishing, published, published with warning, failed, cancelled, skipped, or not applicable

Generated content without an approval record maps to `not_approved`, not `not_required`. Generated, approved, queued, and scheduled content is never interpreted as published without delivery or canonical published-state evidence.

## Pre-prioritization rejection rules

The composer rejects invalid inputs before scoring, including:

- Tenant or canonical-reference mismatch
- Unsupported or inactive services
- Prohibited claims or positioning
- Unauthorized geography
- Missing canonical references, explanations, workflow details, or score basis
- Malformed or unsupported evidence

For BB&B this blocks termite opportunities, whole-home bed-bug heat-treatment positioning, and out-of-area work. Furniture/item-level treatment remains the bed-bug differentiator, fumigation remains active, and Baldwin County, Alabama remains the primary geography.

## Consequences and tradeoffs

Positive consequences:

- Canonical systems retain ownership and workflow integrity.
- Results are deterministic, explainable, tenant-safe, and fixture-testable.
- New providers or measurements can be introduced through bounded adapters without changing the composer or canonical downstream records.
- Unavailable integrations do not unfairly reduce business scores.

Tradeoffs:

- The read model cannot display evidence that a canonical tenant-safe adapter does not yet supply.
- C8R-5 does not persist snapshots or expose visible application behavior.
- Adapter defaults are explicit policy and require review when production observations replace fixtures.

## Deferred integrations

The following remain unimplemented and require separately approved bounded phases: persistent AI Visibility snapshots, API routes, UI, schedulers, live GBP collection, Search Console, GA4, local-rank tracking, tenant-safe review ingestion, Gemini, ChatGPT, Perplexity, live answer-engine monitoring, Similarweb, paid providers, and automated execution or outreach.

## Security and tenant-safety safeguards

- Trusted client scope controls every accepted observation and canonical reference.
- Mixed-tenant observations are rejected before scoring or merging.
- Provider metadata, evidence, and provenance are bounded.
- No credentials, secrets, OAuth tokens, environment values, raw provider payloads, or private customer data enter the read-model contract.
- No network, provider, database, API, UI, scheduler, or external side effect exists in the composer.
- Human approval requirements and existing workflow ownership are retained on every recommendation.
