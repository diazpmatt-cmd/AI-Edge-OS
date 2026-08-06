# Bed Bugs & Beyond Website AI Discovery Audit

Status: execution blocked until the authoritative public website repository and production property are identified
Last updated: 2026-08-03
Related: Issue #113

## Purpose

Define the exact, repeatable checks required before changing crawler rules, structured data, or answer-ready content for Bed Bugs & Beyond. This prevents AI Edge OS from applying business-discovery changes to the unrelated AI Edge Solutions frontend.

## Required inputs

Do not begin implementation until all of the following are known and recorded:

- canonical production website origin;
- authoritative source repository and production branch;
- deployment platform and responsible service;
- DNS/CDN or firewall owner;
- analytics property and access path;
- Google Search Console property, if present;
- Bing Webmaster Tools property, if present;
- current robots, sitemap, canonical, and structured-data ownership.

Credentials, session tokens, API keys, and verification files must remain outside GitHub.

## Read-only technical audit

For the canonical production origin, record evidence for:

1. `robots.txt` HTTP status and complete active directives.
2. Sitemap discovery from `robots.txt` and known sitemap URLs.
3. HTTP status, canonical URL, title, primary heading, and indexability for:
   - home;
   - contact/request-service;
   - each active service;
   - each legitimate service-area page;
   - preparation, safety, and FAQ content.
4. Redirect chains and alternate host behavior for HTTP/HTTPS and `www`/non-`www`.
5. CDN/firewall responses to normal browser requests and approved search-crawler requests.
6. Organization and LocalBusiness JSON-LD, including whether every claim is visible on the page.
7. Name, phone, website, hours, service area, and active-service consistency.
8. Internal-link reachability and orphaned priority pages.
9. Analytics referral capture for known AI/search referrers where observable.
10. Search Console and Bing indexing evidence where authorized.

## Crawler policy matrix

Each crawler must have an explicit, independently reviewed decision. Search/discovery access must not be treated as permission for model training.

| Surface | Crawler or mechanism | Current rule | Intended rule | Official source checked | Evidence date |
|---|---|---|---|---|---|
| ChatGPT Search | OAI-SearchBot | Unknown | Pending audit |  |  |
| OpenAI training | GPTBot | Unknown | Separate owner decision |  |  |
| Google Search/AI features | Googlebot | Unknown | Pending audit |  |  |
| Bing/Copilot | Bingbot | Unknown | Pending audit |  |  |
| Claude/search | Current official Anthropic crawler(s) | Unknown | Pending current-doc review |  |  |
| Perplexity | Current official crawler(s) | Unknown | Pending current-doc review |  |  |

Never add a crawler rule from memory. Re-check the platform's current official documentation before proposing a production change.

## Entity and service truth gates

The public website must not contradict the canonical business rules:

- Termite service is coming soon, not currently offered.
- Wildlife removal is not offered.
- Whole-home bed bug heat treatment is not offered.
- Bed bug positioning emphasizes targeted treatment of affected furniture/items and specific areas.
- Fumigation is an active service.
- Unsupported guarantees, fixed prices, exact savings, or one-visit promises are prohibited.

Any inconsistency is logged as a correction candidate, not silently rewritten without review.

## Structured-data acceptance criteria

- JSON-LD parses without syntax errors.
- Business name, URL, phone, hours, area served, and service claims match visible content.
- No fabricated aggregate rating, review, price range, address, or service is present.
- URLs are canonical HTTPS URLs.
- Social/profile links point only to verified official profiles.
- Service-area representation does not imply storefronts that do not exist.
- Structured data remains useful without relying on unsupported or speculative AI-specific markup.

## Answer-ready content audit

For each priority customer question, record whether a useful, unique, indexable page exists and whether it gives a concise direct answer supported by detail:

- bed bug signs and inspection;
- furniture/item-focused treatment approach;
- preparation before service;
- safety and post-service expectations;
- cockroach and rodent control;
- fumigation explanation and limits;
- local service availability by legitimate area;
- pricing factors without unsupported quotes;
- commercial and property-management service;
- how to request service or an inspection.

Thin city-name substitutions do not pass. A service-area page needs genuine local usefulness.

## Evidence format

Each finding must include:

- observation date/time;
- exact URL or property;
- observed status/value;
- expected status/value;
- severity;
- source of truth;
- proposed change, if any;
- verification method;
- rollback or containment note for production changes.

## Implementation boundary

This document authorizes read-only assessment and repository preparation only. It does not authorize DNS changes, crawler-rule changes, deployment, analytics configuration, Search Console changes, content publication, or production structured-data modification.

## Done when

The canonical website and repository are proven, the read-only audit is completed with evidence, every proposed change targets the correct production property, and implementation work is separated into reviewable changes with tests and rollback instructions.
