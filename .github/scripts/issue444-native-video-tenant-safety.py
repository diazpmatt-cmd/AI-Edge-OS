from pathlib import Path

route = Path("artifacts/api-server/src/routes/auto-content.ts")
text = route.read_text()

import_anchor = 'import { buildTenantImagePrompt, resolveImageBrandPolicy } from "../lib/image-generation-brand-policy.js";\n'
import_replacement = import_anchor + 'import { buildTenantSafeVideoTitle, resolveNativeVideoTenantPolicy } from "../lib/video-generation-tenant-policy.js";\n'
if import_replacement not in text:
    if import_anchor not in text:
        raise SystemExit("route import anchor not found")
    text = text.replace(import_anchor, import_replacement, 1)

post_guard = '''  if (!post) { res.status(404).json({ error: "Post not found" }); return; }\n  if (post.user_id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }\n'''
post_guard_replacement = post_guard + '''\n  const videoTenantPolicy = resolveNativeVideoTenantPolicy(resolved.client.slug);\n  if (!videoTenantPolicy.allowed || !videoTenantPolicy.brandProfile || !videoTenantPolicy.phoneNumber) {\n    res.status(422).json({\n      error: videoTenantPolicy.reason ?? "tenant_video_branding_not_configured",\n      message: "Native video generation is blocked until this client has a tenant-owned video brand profile.",\n    });\n    return;\n  }\n'''
if "const videoTenantPolicy = resolveNativeVideoTenantPolicy" not in text:
    if post_guard not in text:
        raise SystemExit("route post guard anchor not found")
    text = text.replace(post_guard, post_guard_replacement, 1)

old_title = '  const title = (post.youtube_title?.trim() || `${post.ai_topic ?? "Local Pest Control"} | ${resolved.context.clientName}`).slice(0, 100);\n'
new_title = '''  const title = buildTenantSafeVideoTitle({\n    explicitTitle: post.youtube_title,\n    topic: post.ai_topic,\n    industryLabel: resolved.context.industryLabel,\n    clientName: resolved.context.clientName,\n  });\n'''
if old_title in text:
    text = text.replace(old_title, new_title, 1)
elif new_title not in text:
    raise SystemExit("route title anchor not found")

old_error = '      message: "The video script referenced a service Bed Bugs & Beyond does not offer. The video was not generated.",\n'
new_error = '      message: "The video script referenced a service that is not enabled for this client. The video was not generated.",\n'
if old_error in text:
    text = text.replace(old_error, new_error, 1)
elif new_error not in text:
    raise SystemExit("route narration error anchor not found")

old_mode = '    const requestedVideoMode = req.body?.videoMode === "pest-story" ? "pest-story" : "professional";\n'
new_mode = '''    const requestedVideoMode =\n      req.body?.videoMode === "pest-story" && videoTenantPolicy.allowPestStoryMode\n        ? "pest-story"\n        : "professional";\n'''
if old_mode in text:
    text = text.replace(old_mode, new_mode, 1)
elif new_mode not in text:
    raise SystemExit("route mode anchor not found")

old_phone = '      phoneNumber: "(251) 324-9090",\n      videoMode: requestedVideoMode,\n'
new_phone = '      brandProfile: videoTenantPolicy.brandProfile,\n      phoneNumber: videoTenantPolicy.phoneNumber,\n      videoMode: requestedVideoMode,\n'
if old_phone in text:
    text = text.replace(old_phone, new_phone, 1)
elif new_phone not in text:
    raise SystemExit("route phone anchor not found")

route.write_text(text)

renderer = Path("artifacts/api-server/src/lib/native-video-renderer.ts")
text = renderer.read_text()

old_type = '''  clientName: string;\n  cta: string;\n  openAiBaseUrl: string;\n  openAiApiKey: string;\n  phoneNumber?: string;\n  videoMode?: "professional" | "pest-story";\n'''
new_type = '''  clientName: string;\n  cta: string;\n  openAiBaseUrl: string;\n  openAiApiKey: string;\n  brandProfile: "bed-bugs-and-beyond-v1";\n  phoneNumber: string;\n  videoMode?: "professional" | "pest-story";\n'''
if old_type in text:
    text = text.replace(old_type, new_type, 1)
elif new_type not in text:
    raise SystemExit("renderer type anchor not found")

storage_guard = '''  if (!localMediaDir && !privateDir) throw new Error("storage_not_configured");\n  if (!input.openAiApiKey) throw new Error("tts_provider_not_configured");\n'''
storage_replacement = storage_guard + '''  if (input.brandProfile !== "bed-bugs-and-beyond-v1") throw new Error("unsupported_video_brand_profile");\n  if (!input.phoneNumber.trim()) throw new Error("video_phone_number_required");\n'''
if "unsupported_video_brand_profile" not in text:
    if storage_guard not in text:
        raise SystemExit("renderer storage guard anchor not found")
    text = text.replace(storage_guard, storage_replacement, 1)

old_phone_default = '    const phoneNumber = input.phoneNumber?.trim() || "(251) 324-9090";\n'
new_phone_required = '    const phoneNumber = input.phoneNumber.trim();\n'
if old_phone_default in text:
    text = text.replace(old_phone_default, new_phone_required, 1)
elif new_phone_required not in text:
    raise SystemExit("renderer phone anchor not found")

renderer.write_text(text)
print("patched tenant-safe native video boundary")
