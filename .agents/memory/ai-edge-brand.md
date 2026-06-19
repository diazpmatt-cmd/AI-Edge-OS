---
name: AI Edge Solutions brand
description: Brand colors, logo pattern, and architecture decisions for the AI Edge Solutions marketing website and admin Command Center.
---

# AI Edge Solutions Brand

**Colors:**
- Electric blue: `#00AEEF` (primary CTA, accents, glows)
- Cyan glow: `#00D4FF` (hover states, gradients)
- Metallic silver: `#C0C0C0` (secondary text, nav links)
- Black/dark navy: `#030612` (page background)
- Mid navy: `#0A0F1C` / `#0B1629` (card backgrounds, sidebar)

**Logo:** transparent PNG at `public/logo-transparent.png`. Referenced as `${import.meta.env.BASE_URL}logo-transparent.png`.

**Architecture:**
- Marketing site lives in `artifacts/ai-edge-solutions` (web artifact)
- Pages: Home, Services, Products, Case Studies, Pricing, Contact — all in `src/pages/marketing/`
- Shared Nav + Footer: `src/components/marketing/`
- Routing via wouter in `App.tsx`; marketing routes are public (no auth)
- All marketing pages use **inline styles only** (not Tailwind classes)

**Why inline styles:** The existing Tailwind setup uses dark-mode CSS vars tuned for the dashboard. Marketing pages need full control over dark-navy theme without CSS variable conflicts.

**Route structure (IMPORTANT):**
- Public marketing: `/`, `/services`, `/products`, `/case-studies`, `/pricing`, `/contact`
- Admin entry point: `/admin/login` (Clerk SignIn, routing="path", path=`${basePath}/admin/login`)
- Protected admin routes all under `/admin/*`:
  - `/admin/dashboard` → DashboardPage
  - `/admin/connections` → ConnectionsPage
  - `/admin/distribution` → DistributionPage
  - `/admin/repurpose` → RepurposePage
  - `/admin/lead-recovery` → LeadRecoveryPage
  - `/admin/publishing` → PublishingPage
  - `/admin/article/:id` → ArticlePage
- `Authenticated` wrapper redirects unauthenticated users to `/admin/login`
- `/sign-in` and `/sign-up` kept alive for Clerk OAuth callback compatibility
- Command Center MUST NOT appear in the public marketing Nav

**CTA pattern:** "Book Strategy Call" → routes to `/contact`. Main CTA button is `#00AEEF` with glow on hover.
