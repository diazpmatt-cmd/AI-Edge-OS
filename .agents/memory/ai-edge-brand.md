---
name: AI Edge Solutions brand
description: Brand colors, logo pattern, and architecture decisions for the AI Edge Solutions marketing website.
---

# AI Edge Solutions Brand

**Colors:**
- Electric blue: `#00AEEF` (primary CTA, accents, glows)
- Cyan glow: `#00D4FF` (hover states, gradients)
- Metallic silver: `#C0C0C0` (secondary text, nav links)
- Black/dark navy: `#030612` (page background)
- Mid navy: `#0A0F1C` (card backgrounds)

**Logo:** AE monogram — `<svg>` with `<rect rx="9">` gradient fill (#00AEEF → #0077BB) + `<text>AE</text>` centered in white. Used with `filter: drop-shadow(0 0 10px rgba(0,174,239,0.45))`.

**Architecture:**
- Marketing site lives in `artifacts/ai-edge-solutions` (web artifact)
- Pages: Home, Services, Products, Case Studies, Pricing, Contact — all in `src/pages/marketing/`
- Shared Nav + Footer: `src/components/marketing/`
- Routing via wouter in `App.tsx`; marketing routes are public (no auth)
- Auth-gated dashboard routes still exist at `/dashboard`, `/sign-in`, etc.
- All marketing pages use **inline styles only** (not Tailwind classes)

**Why inline styles:** The existing Tailwind setup uses dark-mode CSS vars tuned for the dashboard. Marketing pages need full control over dark-navy theme without CSS variable conflicts.

**CTA pattern:** "Book Free Strategy Call" → routes to `/contact`. Main CTA button is `#00AEEF` with `box-shadow: 0 0 30px rgba(0,174,239,0.3)` glow on hover.
