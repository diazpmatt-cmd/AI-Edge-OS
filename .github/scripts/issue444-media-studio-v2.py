from pathlib import Path

path = Path("artifacts/ai-edge-solutions/src/pages/MediaEnginePage.tsx")
text = path.read_text()

if "MEDIA_STUDIO_IMAGE_EXECUTION_V2" in text:
    print("already patched")
    raise SystemExit(0)

text = text.replace(
    'import { useState } from "react";\n',
    'import { useEffect, useRef, useState } from "react";\n',
    1,
)
text = text.replace(
    'import { useTheme } from "@/contexts/theme-context";\n',
    'import { useTheme } from "@/contexts/theme-context";\nimport { useApiFetch } from "@/lib/api";\n',
    1,
)

needle = 'function ImageStudio({ t, seed }: { t: ReturnType<typeof useTheme>["colors"]; seed?: StudioSeed }) {\n  const [format, setFormat] = useState<"social" | "ad" | "banner">(seed?.format ?? "social");\n  const [style, setStyle]   = useState(seed?.style ?? "modern");\n'
replacement = '''function ImageStudio({ t, seed }: { t: ReturnType<typeof useTheme>["colors"]; seed?: StudioSeed }) {\n  const [format, setFormat] = useState<"social" | "ad" | "banner">(seed?.format ?? "social");\n  const [style, setStyle]   = useState(seed?.style ?? "modern");\n  const apiFetch = useApiFetch();\n  const [imageReady, setImageReady] = useState(false);\n  const [generating, setGenerating] = useState(false);\n  const [generationError, setGenerationError] = useState<string | null>(null);\n  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);\n  const generationKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);\n\n  // MEDIA_STUDIO_IMAGE_EXECUTION_V2: fail closed unless the authenticated\n  // server readiness boundary proves the image provider is explicitly enabled.\n  useEffect(() => {\n    let cancelled = false;\n    apiFetch<{ readiness?: { capabilities?: { image?: boolean } } }>("/media-generation/readiness")\n      .then(result => { if (!cancelled) setImageReady(result.readiness?.capabilities?.image === true); })\n      .catch(() => { if (!cancelled) setImageReady(false); });\n    return () => { cancelled = true; };\n  }, [apiFetch]);\n'''
if needle not in text:
    raise SystemExit("ImageStudio header anchor not found")
text = text.replace(needle, replacement, 1)

copy_anchor = '''  function copyPrompt() {\n    if (!hasBuilderInput && !seed?.prompt) return;\n    navigator.clipboard.writeText(generatedPrompt).catch(() => {});\n    setCopied(true);\n    setTimeout(() => setCopied(false), 2000);\n  }\n'''
copy_replacement = copy_anchor + '''\n  async function generateImage() {\n    if (!imageReady || (!hasBuilderInput && !seed?.prompt) || generating) return;\n    setGenerating(true);\n    setGenerationError(null);\n    try {\n      const size = format === "social" ? "1024x1024" : "1536x1024";\n      const fingerprint = `${size}:${generatedPrompt}`;\n      if (!generationKeyRef.current || generationKeyRef.current.fingerprint !== fingerprint) {\n        generationKeyRef.current = {\n          fingerprint,\n          key: `media-studio:${crypto.randomUUID()}`,\n        };\n      }\n      const generated = await apiFetch<{ generationId: string }>("/auto-content/generate-image", {\n        method: "POST",\n        body: JSON.stringify({\n          prompt: generatedPrompt,\n          size,\n          idempotencyKey: generationKeyRef.current.key,\n        }),\n      });\n      const access = await apiFetch<{ signedUrl: string }>(\n        `/auto-content/generate-image/${generated.generationId}/signed-url`,\n      );\n      setGeneratedImageUrl(access.signedUrl);\n    } catch (error) {\n      setGeneratedImageUrl(null);\n      setGenerationError(error instanceof Error ? error.message : "Image generation failed");\n    } finally {\n      setGenerating(false);\n    }\n  }\n'''
if copy_anchor not in text:
    raise SystemExit("copyPrompt anchor not found")
text = text.replace(copy_anchor, copy_replacement, 1)

brand_start = '          {/* Brand kit */}\n'
export_start = '          {/* Export */}\n'
start = text.find(brand_start)
end = text.find(export_start, start)
if start == -1 or end == -1:
    raise SystemExit("brand/export anchors not found")
brand_replacement = '''          {/* Brand handling is enforced server-side from canonical tenant policy. */}\n          <Panel label="Brand Handling" accent="#00AEEF">\n            <div style={{ fontSize: 11.5, color: "#94A3B8", lineHeight: 1.6 }}>\n              Brand rules come from the active client context. Bed Bugs & Beyond receives its official overlay; other tenants stay unbranded until their own brand kit is configured.\n            </div>\n          </Panel>\n\n'''
text = text[:start] + brand_replacement + text[end:]

export_block = '''          {/* Export */}\n          <Panel label="Export" accent="#00AEEF">\n            <div style={{ display: "flex", gap: 12 }}>\n              <ExportButton label="PNG" accent="#00AEEF" />\n              <ExportButton label="JPG" accent="#00AEEF" />\n              <ExportButton label="SVG" accent="#00AEEF" />\n            </div>\n          </Panel>\n'''
export_replacement = '''          {/* Export is available only for a real provider-confirmed asset. */}\n          <Panel label="Export" accent="#00AEEF">\n            {generatedImageUrl ? (\n              <a\n                href={generatedImageUrl}\n                download="ai-edge-generated-image.png"\n                style={{\n                  display: "inline-flex", alignItems: "center", justifyContent: "center",\n                  padding: "9px 14px", borderRadius: 8, textDecoration: "none",\n                  background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)",\n                  color: "#00AEEF", fontSize: 12, fontWeight: 700,\n                }}\n              >\n                Download PNG\n              </a>\n            ) : (\n              <span style={{ fontSize: 11.5, color: "#64748B" }}>Generate an image before export is available.</span>\n            )}\n          </Panel>\n'''
if export_block not in text:
    raise SystemExit("export block not found")
text = text.replace(export_block, export_replacement, 1)

preview_marker = '''              {/* Preview card */}\n              <div style={{\n'''
preview_replacement = '''              {/* Real provider result is rendered only after the signed asset URL is returned. */}\n              <div style={{\n'''
if preview_marker not in text:
    raise SystemExit("preview marker not found")
text = text.replace(preview_marker, preview_replacement, 1)

preview_inner = '''                {/* Decorative background grid */}\n                <div style={{\n'''
preview_inner_replacement = '''                {generatedImageUrl && (\n                  <img\n                    src={generatedImageUrl}\n                    alt="Generated campaign creative"\n                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 3 }}\n                  />\n                )}\n                {/* Decorative background grid */}\n                <div style={{\n'''
if preview_inner not in text:
    raise SystemExit("preview inner anchor not found")
text = text.replace(preview_inner, preview_inner_replacement, 1)

button_old = '''              <button\n                disabled\n                title="AI generation coming in next release"\n                style={{\n                  flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,\n                  padding: "10px", borderRadius: 9, cursor: "not-allowed",\n                  background: "rgba(0,174,239,0.04)", border: "1.5px solid rgba(0,174,239,0.15)",\n                  color: "#334155", fontSize: 12, fontWeight: 700,\n                }}\n              >\n                <span style={{ fontSize: 13 }}>✨</span>\n                Generate Image\n                <span style={{\n                  padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 800,\n                  background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#FBBF24",\n                }}>SOON</span>\n              </button>\n'''
button_new = '''              <button\n                onClick={() => void generateImage()}\n                disabled={!imageReady || (!hasBuilderInput && !seed?.prompt) || generating}\n                title={imageReady ? "Generate a real provider-backed image" : "Image provider is not enabled"}\n                style={{\n                  flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,\n                  padding: "10px", borderRadius: 9,\n                  cursor: imageReady && (hasBuilderInput || seed?.prompt) && !generating ? "pointer" : "not-allowed",\n                  background: imageReady ? "rgba(0,174,239,0.1)" : "rgba(0,174,239,0.04)",\n                  border: "1.5px solid rgba(0,174,239,0.2)",\n                  color: imageReady ? "#00AEEF" : "#475569", fontSize: 12, fontWeight: 700,\n                }}\n              >\n                <span style={{ fontSize: 13 }}>✨</span>\n                {generating ? "Generating…" : "Generate Image"}\n              </button>\n'''
if button_old not in text:
    raise SystemExit("generate button anchor not found")
text = text.replace(button_old, button_new, 1)

status_anchor = '''            {/* Prompt Actions row */}\n            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>\n'''
status_replacement = '''            {generationError && (\n              <div style={{ marginTop: 10, fontSize: 11, color: "#FCA5A5", lineHeight: 1.5 }}>\n                Generation blocked or failed: {generationError}\n              </div>\n            )}\n            {!imageReady && (\n              <div style={{ marginTop: 10, fontSize: 11, color: "#FBBF24", lineHeight: 1.5 }}>\n                Image generation remains disabled until the server-side provider gate is explicitly enabled.\n              </div>\n            )}\n\n            {/* Prompt Actions row */}\n            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>\n'''
if status_anchor not in text:
    raise SystemExit("status anchor not found")
text = text.replace(status_anchor, status_replacement, 1)

# Remove the misleading Coming Soon badge from the image output card only.
badge = '''              {/* Coming Soon badge */}\n              <div style={{\n                position: "absolute", top: 12, right: 12, zIndex: 2,\n                padding: "4px 10px", borderRadius: 6, fontSize: 9, fontWeight: 800, letterSpacing: "0.6px",\n                background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24",\n              }}>\n                COMING SOON\n              </div>\n\n'''
if badge not in text:
    raise SystemExit("coming soon badge not found")
text = text.replace(badge, "", 1)

path.write_text(text)
print("patched MediaEnginePage.tsx")
