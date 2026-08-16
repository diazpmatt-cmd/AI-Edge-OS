from pathlib import Path

path = Path("artifacts/ai-edge-solutions/src/pages/MediaEnginePage.tsx")
text = path.read_text()
old = '''const DEFAULT_VIDEO_SCENES: VideoScene[] = [
  {
    id: "hook",
    title: "Hook",
    visual: "Pest infestation close-up — quick cuts, high energy",
    onscreen: "Are pests taking over your home?",
    voiceover: "Bed bugs, roaches, rodents — they don't sleep, and neither should your protection.",
  },
  {
    id: "problem",
    title: "Problem",
    visual: "Worried homeowner inspecting walls and furniture",
    onscreen: "Don't let pests ruin your peace of mind.",
    voiceover: "Every day you wait, the problem gets worse. Baldwin County homeowners trust one name.",
  },
  {
    id: "solution",
    title: "Solution",
    visual: "BB&B technician treating home, logo visible, professional uniform",
    onscreen: "Bed Bugs & Beyond — Guaranteed Results.",
    voiceover: "Bed Bugs and Beyond delivers fast, effective, guaranteed pest control. Licensed, local, and here for you.",
  },
  {
    id: "cta",
    title: "Call to Action",
    visual: "Happy family in clean, pest-free home — bright, warm lighting",
    onscreen: "Call Today — Free Inspection!",
    voiceover: "Call Bed Bugs and Beyond today for your free inspection. Your pest-free life starts now.",
  },
];
'''
new = '''const DEFAULT_VIDEO_SCENES: VideoScene[] = [
  {
    id: "hook",
    title: "Hook",
    visual: "Show the customer's problem in a clear, respectful local-service scenario",
    onscreen: "Need help with a problem at home or work?",
    voiceover: "Start with the problem your customer wants solved and why it matters now.",
  },
  {
    id: "problem",
    title: "Problem",
    visual: "Show the real-world impact of the problem without exaggeration or unsupported claims",
    onscreen: "A small problem can become a bigger interruption.",
    voiceover: "Explain the customer's challenge using only facts that are true for this business and service.",
  },
  {
    id: "solution",
    title: "Solution",
    visual: "Show the service process, team, equipment, or approved brand visuals",
    onscreen: "Professional local service, built around your needs.",
    voiceover: "Describe how the business helps, using the selected service and approved client information.",
  },
  {
    id: "cta",
    title: "Call to Action",
    visual: "Show an approved call-to-action screen using the client's configured contact details",
    onscreen: "Ready for the next step?",
    voiceover: "Use the client's configured call to action. Do not invent discounts, guarantees, free offers, or contact details.",
  },
];
'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("default video scenes anchor not found")

anchor = '''          {/* Video Brief Builder */}\n          <Panel label="Video Brief Builder" accent="#A78BFA">\n'''
notice = '''          <div style={{\n            padding: "10px 12px", borderRadius: 9,\n            background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.16)",\n            color: "#94A3B8", fontSize: 11, lineHeight: 1.55,\n          }}>\n            Scene text is a neutral drafting template, not a factual claim about the active client. Replace it with verified service, offer, location, review, and CTA details before approval or generation.\n          </div>\n\n'''
if notice not in text:
    if anchor not in text:
        raise SystemExit("video brief anchor not found")
    text = text.replace(anchor, notice + anchor, 1)

replacements = {
    'ph: "e.g. Homeowners in Baldwin County, AL aged 30–60"': 'ph: "e.g. Homeowners in the verified service area"',
    'ph: "e.g. Free inspection + 20% off first treatment"': 'ph: "e.g. Enter a verified current offer, or leave blank"',
    'ph: "e.g. Bed bug extermination, pest control service"': 'ph: "e.g. Select or enter an enabled client service"',
    'ph: "e.g. Baldwin County, Gulf Shores, Foley AL"': 'ph: "e.g. Enter a verified city or service area"',
    'ph: "e.g. Call Today, Book Now, Get a Free Quote"': 'ph: "e.g. Enter the client-approved call to action"',
}
for source, target in replacements.items():
    if source in text:
        text = text.replace(source, target, 1)

path.write_text(text)
print("patched neutral Video Studio defaults")
