# AI Discovery Partner Plan

Last updated: 2026-08-03
Business: Bed Bugs & Beyond

## Objective

Improve the probability that accurate Bed Bugs & Beyond information is discoverable and cited across major AI answer and search experiences without inventing unsupported platform submission programs.

## Important boundary

Most AI assistants do not provide a normal local-business account or listing portal comparable to Google Business Profile, Yelp, or Apple Business. The practical path is to make the public website, business profiles, reviews, and structured business data crawlable, consistent, authoritative, and measurable.

Crawler permission is a business-policy decision. Search and user-directed retrieval bots must be evaluated separately from model-training bots. Enabling discovery does not require granting every training crawler access.

## Priority surfaces

1. ChatGPT Search / OpenAI
2. Google AI Overviews, AI Mode, and Gemini-related discovery
3. Claude web search and Anthropic retrieval
4. Perplexity and other answer engines
5. Bing/Copilot-backed discovery

## Current official crawler distinctions

### OpenAI

- `OAI-SearchBot` supports discovery, summaries, citations, and links in ChatGPT Search.
- OpenAI states that public sites can appear in ChatGPT Search and recommends not blocking `OAI-SearchBot` when the publisher wants content discovered and summarized.
- Search visibility and model-training permission are separate policy choices.
- A successful robots rule is not enough if a CDN, firewall, CAPTCHA, JavaScript challenge, authentication layer, or rate limit blocks the crawler.

Official source checked 2026-08-03:

- https://help.openai.com/en/articles/12627856-publishers-and-developers-faq

### Anthropic

Anthropic currently documents separate bot purposes:

- `ClaudeBot` is associated with collecting public web content that may contribute to model development.
- `Claude-User` supports user-directed retrieval when a Claude user asks for web content.
- Anthropic bots respect `robots.txt`; Anthropic also documents `Crawl-delay` support.
- Anthropic does not currently publish stable bot IP ranges, so policy should be expressed through `robots.txt` and compatible edge controls rather than guessed IP blocks.

Official sources checked 2026-08-03:

- https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- https://support.anthropic.com/en/articles/10684638-blocking-and-removing-content-from-claude

### Google and Bing

- Standard search crawlability, indexability, canonicalization, useful visible content, and verified local profiles remain foundational.
- Do not assume that special AI-only markup is required or that a crawlable page is guaranteed to appear in an AI answer.
- Search Console, Bing Webmaster tools, analytics, public listing dashboards, and reproducible prompt benchmarks provide evidence; none guarantees placement.

## Work package A — crawler and index eligibility

- Identify the authoritative Bed Bugs & Beyond website repository and production property before changing crawler rules.
- Fetch and archive the live `robots.txt`, sitemap indexes, key canonical tags, and relevant response headers.
- Confirm `OAI-SearchBot` is not unintentionally blocked when ChatGPT Search discovery is desired.
- Decide explicitly whether model-training crawlers such as `ClaudeBot` are allowed; do not treat training access as a prerequisite for local discovery.
- Confirm user-directed retrieval and ordinary search crawlers are not unintentionally blocked by `robots.txt`, CDN, firewall, CAPTCHA, JavaScript challenge, authentication, geo rules, or rate limits.
- Confirm important service, service-area, contact, review, and business-information pages return successful public responses and contain meaningful visible text.
- Confirm canonical URLs, sitemap coverage, internal linking, and indexability.
- Use provider-published IP ranges only when a provider publishes and maintains them; otherwise use documented user agents and compatible edge policy.
- Do not add speculative `llms.txt` or proprietary markup as a substitute for normal crawlability, indexability, and useful content.

## Work package B — entity consistency

- Keep the same public business name, phone, website, hours, service area, and active services across the website and verified profiles.
- Do not list termite service as currently available; treat it as coming soon only.
- Do not describe whole-home bed bug heat treatment as an offered service.
- Preserve the actual differentiator: furniture and item-focused treatment rather than expensive whole-home heat treatment.
- Include fumigation as an active service.
- Maintain clear organization and local-business structured data that matches visible page content.
- Link verified profiles and authoritative citations back to the official website where appropriate.

## Work package C — answer-ready content

Create useful, factual pages that directly answer local customer questions, including:

- signs of bed bugs, rodents, cockroaches, ants, spiders, wasps, fleas, and other offered pest services;
- what customers should do before and after service;
- service-area pages with unique local information rather than copied city-name substitutions;
- pricing factors without unsupported fixed-price promises;
- safety, preparation, inspection, treatment, fumigation, and follow-up explanations;
- comparison pages explaining Bed Bugs & Beyond's treatment approach accurately;
- frequently asked questions written for people first, with concise answers and supporting detail.

## Work package D — authority and corroboration

- Build and maintain verified profiles on Google, Apple, Bing, Yelp, Nextdoor, Facebook, Instagram, TikTok, Thumbtack, Angi, and qualified directories.
- Earn genuine customer reviews without review gating or fabricated testimonials.
- Pursue legitimate local citations and partnerships with property managers, realtors, hotels, storage facilities, and moving companies.
- Keep public claims consistent so AI systems can corroborate the entity across independent sources.

## Work package E — measurement

- Track referrals from ChatGPT and other observable AI/search sources in analytics.
- Use Google Search Console for Google Search and AI-feature visibility when reports are available to the property.
- Use Bing Webmaster and Bing Places data where available.
- Record prompt-based visibility tests as observations, not as guaranteed rankings.
- Maintain a recurring benchmark set of local questions such as:
  - pest control near Foley, Alabama;
  - bed bug treatment in Baldwin County;
  - rodent control near Orange Beach;
  - furniture-focused bed bug treatment;
  - local fumigation service;
  - affordable pest inspection near me.
- Store date, assistant/search surface, location context, cited businesses, whether Bed Bugs & Beyond appeared, and source URLs.
- Record crawler-policy changes and benchmark changes so result movement is not attributed to the wrong cause.

## Platform-specific operating rules

### ChatGPT Search

- Allow `OAI-SearchBot` on public pages intended for discovery.
- Test the live path through robots, edge security, redirects, and final content response.
- Do not promise inclusion, ranking, or citation.

### Google AI features and Gemini discovery

- Keep pages indexed, snippet-eligible, people-first, and consistent with the verified Business Profile.
- Use visible content and supported structured data; do not invent AI-specific schema.
- Treat AI-feature traffic and citations as observations.

### Claude and Anthropic

- Document separate policy decisions for `ClaudeBot` and user-directed retrieval.
- Do not claim that allowing model-training crawling guarantees Claude web-search visibility.
- Do not create brittle IP allowlists when Anthropic does not publish stable ranges.

### Perplexity, Bing, and other answer engines

- Prefer strong Bing/Google indexability, accurate local listings, direct factual content, and authoritative third-party corroboration.
- Do not claim a business is integrated with an AI partner merely because its pages can be indexed or cited.

## Completion gates

This plan is considered operational only after:

- the authoritative website property is identified;
- crawler rules and edge access are audited against the live property;
- technical indexing checks pass;
- business identity and active service claims are consistent;
- structured data is validated against visible content;
- the priority answer-ready pages exist;
- AI/search referrals and prompt benchmarks are recorded;
- training-crawler and search/retrieval-crawler policy choices are documented separately;
- no unsupported guarantee of AI ranking or citation is made.
