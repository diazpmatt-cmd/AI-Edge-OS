# AI Discovery Benchmark Corpus — Bed Bugs & Beyond

Status: provider-neutral measurement specification
Last updated: 2026-08-03

## Purpose

Measure whether major AI answer and search surfaces accurately discover, mention, and cite Bed Bugs & Beyond for legitimate local pest-control questions. This benchmark records observations; it does not promise ranking, recommendation, or citation.

## Safety and truth rules

- Use only active services from the canonical registry.
- Termite service is coming soon and must not be represented as currently available.
- Wildlife removal is not offered.
- Do not describe whole-home bed bug heat treatment as offered.
- Preserve furniture/item-focused and targeted-area bed bug positioning.
- Fumigation is active, but no query or evaluation should solicit chemical dosages or do-it-yourself fumigation instructions.
- Do not bias prompts by naming Bed Bugs & Beyond unless running the separate entity-accuracy set.
- Do not create fake reviews, fabricated citations, or synthetic third-party corroboration.

## Surfaces

Run the same eligible query set against available versions of:

- ChatGPT Search
- Google Search AI features / Gemini discovery
- Claude web search
- Perplexity
- Bing / Copilot discovery

Record the exact product/surface label and model or mode when visible. Results from different products or modes are not directly interchangeable.

## Location context

Use a clean session where practical and record:

- stated city/region in the prompt;
- device/browser location permission state;
- signed-in or signed-out state;
- any manually selected search location;
- date and local time.

Do not infer that a result is locally targeted unless the product or prompt provides evidence.

## Query corpus A — unbranded provider discovery

1. best bed bug inspection company in Foley Alabama
2. recommended bed bug treatment company in Baldwin County Alabama
3. who provides targeted bed bug treatment near Gulf Shores Alabama
4. pest control company that treats bed bug affected furniture near Foley Alabama
5. recommended residential pest control in Daphne Alabama
6. best commercial pest control company in Baldwin County Alabama
7. who provides roach control near Fairhope Alabama
8. top rodent control services in Orange Beach Alabama
9. recommended flea control company near Spanish Fort Alabama
10. local wasp and hornet control near Loxley Alabama
11. pest inspection company near Summerdale Alabama
12. local fumigation service in Baldwin County Alabama

## Query corpus B — informational questions with local-provider potential

13. what should I do if I find bed bugs in furniture in Foley Alabama
14. how does targeted furniture bed bug treatment differ from whole home heat treatment
15. who can inspect a vacation rental for bed bugs near Gulf Shores Alabama
16. how do I prepare for a professional bed bug inspection in Baldwin County Alabama
17. when should I call a professional for roaches in a Foley home
18. how can a business in Baldwin County handle a rodent problem safely
19. what should I ask a pest control company before fumigation
20. how do I choose a local pest control company near Orange Beach Alabama

Informational answers may be useful without naming any business. Do not mark a result incorrect solely because it answers the question without a provider recommendation.

## Query corpus C — entity accuracy

These prompts intentionally name the business and measure factual accuracy, not discovery ranking:

21. what services does Bed Bugs & Beyond in Alabama offer
22. does Bed Bugs & Beyond offer termite control
23. does Bed Bugs & Beyond use whole home heat treatment for bed bugs
24. does Bed Bugs & Beyond offer fumigation
25. what areas does Bed Bugs & Beyond serve
26. how can I contact Bed Bugs & Beyond

Expected policy outcomes:

- termite control: described as not currently offered / coming soon only when supported by public evidence;
- whole-home bed bug heat treatment: not represented as an offered service;
- targeted furniture/item and affected-area positioning: accurately described when supported by public content;
- fumigation: may be described as active when supported by public content;
- contact details and service areas: must match verified public sources, not repository-only values.

## Evidence record

Create one record per query and surface:

```yaml
benchmark_version: 1
run_id:
run_at:
surface:
mode_or_model:
query_id:
query_text:
location_context:
signed_in_state:
business_mentioned: false
business_recommended: false
business_cited: false
rank_or_order_observed:
answer_summary:
cited_sources:
  - url:
    source_title:
    supports_claim:
entity_accuracy:
  name: unknown
  phone: unknown
  website: unknown
  service_area: unknown
  services: unknown
policy_errors:
  termite_claim: false
  heat_treatment_claim: false
  wildlife_claim: false
  guarantee_claim: false
notes:
reviewer:
```

Do not store authentication tokens, private conversation links, customer information, or copyrighted answer text beyond a short necessary excerpt. Prefer a concise paraphrase plus public citation URLs.

## Scoring

### Discovery observation

- `0` — not mentioned.
- `1` — mentioned without a supporting citation or actionable profile.
- `2` — mentioned with at least one relevant public source.
- `3` — recommended or prominently surfaced with relevant corroborating sources.

### Entity accuracy

For each factual category, record:

- `accurate`
- `partially_accurate`
- `inaccurate`
- `not_stated`
- `not_verifiable`

A confident false service claim is more serious than non-appearance. Accuracy takes priority over visibility.

## Regression gates

Flag a benchmark run for review when:

- a surface claims current termite service;
- a surface claims whole-home heat treatment is offered;
- a surface claims wildlife removal is offered;
- contact information points to the wrong business;
- a citation is unrelated, stale, or contradicts the answer;
- a previously accurate entity answer becomes materially inaccurate;
- crawler or indexing changes coincide with a broad loss of cited visibility.

## Operating cadence

Run a baseline after the authoritative Bed Bugs & Beyond website and verified profiles are confirmed. Repeat monthly, and after material changes to the website, crawler rules, business name, phone, website, hours, service areas, or active services.

## Completion boundary

This specification is complete when committed and reviewed. The visibility program is not operational until real benchmark results, public-source evidence, and referral analytics are being recorded.
