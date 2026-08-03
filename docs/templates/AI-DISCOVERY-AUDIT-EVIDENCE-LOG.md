# AI Discovery Audit Evidence Log

Last updated: 2026-08-03
Scope: authoritative Bed Bugs & Beyond public website and verified public profiles
Related: Issue #113, `docs/roadmaps/AI-DISCOVERY-PARTNER-PLAN.md`, and `docs/specs/BED-BUGS-AND-BEYOND-WEBSITE-AI-DISCOVERY-AUDIT.md`

## Purpose

Use this log to record reproducible evidence for crawl eligibility, indexability, structured business facts, answer-ready content, referral measurement, and prompt benchmarks. Do not record assumptions as findings and do not apply website changes to the AI Edge Solutions frontend by mistake.

## Property identity

- Authoritative production domain: **unknown**
- Authoritative repository: **unknown**
- Production host/CDN: **unknown**
- Analytics property: **unknown**
- Search Console property: **unknown**
- Bing Webmaster property: **unknown**
- Audit date/time and time zone: **unknown**
- Auditor: **unknown**
- Exact deployed website commit/version: **unknown**

## A. Technical crawl and index evidence

| Check | URL or user agent | Observed result | Evidence date | Status |
|---|---|---|---|---|
| `robots.txt` reachable | `/robots.txt` | unknown | unknown | pending |
| Sitemap reachable | intended sitemap URL | unknown | unknown | pending |
| Canonical homepage | homepage | unknown | unknown | pending |
| HTTP status | priority pages | unknown | unknown | pending |
| Meta robots | priority pages | unknown | unknown | pending |
| X-Robots-Tag | priority pages | unknown | unknown | pending |
| Internal links | priority pages | unknown | unknown | pending |
| OAI-SearchBot policy | `OAI-SearchBot` | unknown | unknown | pending |
| Googlebot policy | `Googlebot` | unknown | unknown | pending |
| Bingbot policy | `bingbot` | unknown | unknown | pending |
| Anthropic agents | current officially documented agents | unknown | unknown | pending |
| Perplexity agents | current officially documented agents | unknown | unknown | pending |
| CDN/firewall behavior | verified crawler request method | unknown | unknown | pending |

Record model-training crawler policy separately from search/discovery crawler policy.

## B. Priority URL inventory

| Page purpose | Canonical URL | HTTP | Indexable | Sitemap | Internal links | Content owner | Status |
|---|---|---:|---|---|---|---|---|
| Homepage | unknown | unknown | unknown | unknown | unknown | unknown | pending |
| Bed bug service | unknown | unknown | unknown | unknown | unknown | unknown | pending |
| Furniture/item treatment explanation | unknown | unknown | unknown | unknown | unknown | unknown | pending |
| Fumigation | unknown | unknown | unknown | unknown | unknown | unknown | pending |
| Preparation/safety | unknown | unknown | unknown | unknown | unknown | unknown | pending |
| Service area | unknown | unknown | unknown | unknown | unknown | unknown | pending |
| FAQ | unknown | unknown | unknown | unknown | unknown | unknown | pending |
| Contact/booking | unknown | unknown | unknown | unknown | unknown | unknown | pending |

Do not create doorway pages or duplicate city pages merely to increase page count.

## C. Structured-data consistency

| Field | Visible page value | Structured value | Verified listing value | Match | Notes |
|---|---|---|---|---|---|
| Business name | unknown | unknown | unknown | unknown | unknown |
| Website | unknown | unknown | unknown | unknown | unknown |
| Phone | unknown | unknown | unknown | unknown | unknown |
| Service area | unknown | unknown | unknown | unknown | unknown |
| Hours | unknown | unknown | unknown | unknown | unknown |
| Business category | unknown | unknown | unknown | unknown | unknown |
| Logo/image | unknown | unknown | unknown | unknown | unknown |
| Social/profile identifiers | unknown | unknown | unknown | unknown | unknown |

Structured data must describe visible, truthful content. It must not add services, locations, reviews, or claims that are absent from the public page.

## D. Service-policy validation

| Claim | Required result | Observed result | Status |
|---|---|---|---|
| Termite service | not represented as currently offered | unknown | pending |
| Whole-home bed bug heat treatment | not represented as offered | unknown | pending |
| Furniture/item-focused treatment | represented accurately where relevant | unknown | pending |
| Fumigation | represented as active where relevant | unknown | pending |
| Unsupported guarantees | absent | unknown | pending |
| AI platform partnership/integration claim | absent unless formally authorized | unknown | pending |

## E. Answer-ready content checks

For each priority question, record the strongest page that gives a direct, useful, locally relevant answer.

| Question | Best canonical page | Direct answer present | Supporting details | Unsupported claim found | Status |
|---|---|---|---|---|---|
| What bed bug services are available? | unknown | unknown | unknown | unknown | pending |
| How are furniture and belongings treated? | unknown | unknown | unknown | unknown | pending |
| Is whole-home heat treatment offered? | unknown | unknown | unknown | unknown | pending |
| Is fumigation available? | unknown | unknown | unknown | unknown | pending |
| What areas are served? | unknown | unknown | unknown | unknown | pending |
| How should a customer prepare? | unknown | unknown | unknown | unknown | pending |
| What should a customer do after treatment? | unknown | unknown | unknown | unknown | pending |
| How can a customer request service? | unknown | unknown | unknown | unknown | pending |

## F. Observable referral measurement

| Source | Observable referrer or marker | Analytics capture verified | Conversion capture verified | Limitation |
|---|---|---|---|---|
| ChatGPT | unknown | unknown | unknown | unknown |
| Google AI/search | unknown | unknown | unknown | unknown |
| Claude | unknown | unknown | unknown | unknown |
| Perplexity | unknown | unknown | unknown | unknown |
| Bing/Copilot | unknown | unknown | unknown | unknown |

Record `unknown` rather than inferring a platform from browser, device, or user-agent alone.

## G. Prompt benchmark result

Use prompts from `docs/specs/AI-DISCOVERY-BENCHMARK-CORPUS.md` without silently rewriting them between runs.

| Field | Value |
|---|---|
| Benchmark run ID | unknown |
| Date/time and time zone | unknown |
| Platform/product/version | unknown |
| Signed-in or signed-out context | unknown |
| Stated location context | unknown |
| Prompt ID and exact prompt | unknown |
| Bed Bugs & Beyond mentioned | unknown |
| Position/order if meaningful | unknown |
| Cited URL(s) | unknown |
| Competing businesses cited | unknown |
| Factual errors | unknown |
| Service-policy errors | unknown |
| Screenshot/evidence location | unknown |
| Notes and limitations | unknown |

A result is an observation from one run, not a guaranteed ranking or durable inclusion.

## H. Findings and remediation

### Verified findings

- **none yet**

### Blockers

- Authoritative Bed Bugs & Beyond repository and production property have not been identified in the connected GitHub repository.
- Live crawler, index, structured-data, analytics, and benchmark evidence has not been captured.

### Proposed changes

List only changes tied to verified findings. Each production change requires review, exact property targeting, regression checks, and a rollback path.

## Completion rule

Do not mark Issue #113 technical or measurement checkboxes complete until the authoritative property is identified and the corresponding rows contain reproducible evidence. This template does not authorize publishing, crawler-policy changes, DNS/CDN changes, analytics changes, or edits to live public content.
