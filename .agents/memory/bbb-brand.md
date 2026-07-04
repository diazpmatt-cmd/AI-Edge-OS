---
name: Bed Bugs & Beyond brand
description: Brand colors, logo file location, and posting rules for client Bed Bugs & Beyond
---

# Bed Bugs & Beyond — Brand Reference

## Identity
- **Client name:** Bed Bugs & Beyond
- **Phone:** (251) 324-9090
- **Service area:** Baldwin County, AL (Fairhope, Gulf Shores, Orange Beach, Daphne, Spanish Fort, Foley)
- **Niche:** Pest control — coastal / residential focus

## Brand Colors
| Name | Hex |
|---|---|
| Deep Navy | #0D2B45 |
| Ocean Blue | #0077B6 |
| Light Aqua | #67D4E7 |
| Coral Orange | #F26C21 |
| White | #FFFFFF |

## Logo
- **File:** `artifacts/api-server/uploads/social-posts/bbb-brand-logo.png`
- **URL path:** `/api/uploads/social-posts/bbb-brand-logo.png` (served publicly, no auth)
- **image_assets DB record:** id `4405af48-fd27-450c-8a73-521a3e779d0d`, category=branding, all 11 topic tags

## Posting Rules
- **Every post MUST include the BB&B logo image** — set `image_data = '/api/uploads/social-posts/bbb-brand-logo.png'` when creating posts manually via SQL
- **Auto Content Engine:** V4 branding fallback in auto-content.ts ensures logo is attached when no higher-scoring specific image exists (score < 70 → uses branding category asset)
- **Fallback rule (from brand sheet):** "If no image asset is available, always use the BB&B logo on a branded background"

## How the Logo Gets Into Posts
1. **Scheduled/manual posts:** `image_data` field on `social_posts` table → read first by publish route → uploaded as photo to Facebook → fbPhotoUrl cascade → Instagram ✅
2. **Auto-generated posts:** V4 matcher scores assets → if score ≥ 70 specific image wins → else branding fallback fires → `matchedImageUrl` set → publish route reads as fallback ✅

## user_id
`user_3FKEVWfSuyNsJz3oQ9kPH5nzKDm`
