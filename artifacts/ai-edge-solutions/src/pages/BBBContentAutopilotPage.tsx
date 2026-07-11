// ── BB&B Content Autopilot V2 ────────────────────────────────────────────────
// V2: queue posts as real backend drafts via POST /api/social-posts.
// WorkflowNav connects this page into the full BB&B Growth OS workflow.

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { WorkflowNav } from "@/components/WorkflowNav";
import { PlatformStateChip, resolvePlatformUIState } from "@/components/PlatformStateChip";
import { SOCIAL_PROVIDERS, QUEUEABLE_PROVIDERS, type SocialProviderId } from "@/lib/social-providers";

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = {
  navy:      "#030612",
  panel:     "#080E1F",
  panel2:    "#0A1228",
  border:    "rgba(255,255,255,0.07)",
  blue:      "#00AEEF",
  sky:       "#38BDF8",
  emerald:   "#10B981",
  green:     "#22C55E",
  gold:      "#FBBF24",
  orange:    "#F97316",
  purple:    "#A78BFA",
  red:       "#EF4444",
  silver:    "#94A3B8",
  dim:       "#64748B",
  white:     "#F1F5F9",
  bbbDark:   "#0D2B45",
  bbbMid:    "#0077B6",
  bbbOrange: "#F26C21",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type PlatformStatus = "not-queued" | "ready" | "success" | "failed";

interface ContentTemplate {
  topic:     string;
  facebook:  string;
  instagram: string;
  gbp:       string;
  youtube:   string;
  tiktok:    string;
  linkedin:  string;
  pinterest: string;
  nextdoor:  string;
  imageIdea: string;
  cta:       string;
}

type MediaType = "image" | "video" | "carousel" | "text" | "pin" | "article";

interface ContentProfile {
  mediaType:    MediaType;
  maxLength:    string;
  bestFormat:   string;
  frequency:    string;
  ctaTip:       string;
  hashtagCount: string;
  note:         string;
}

interface QueuedPost {
  id:        string;
  platform:  SocialProviderId;
  caption:   string;
  imageIdea: string;
  cta:       string;
  topic:     string;
  queuedAt:  string;
}

interface ActivityEntry {
  id:       string;
  ts:       string;
  platform: SocialProviderId;
  action:   string;
  status:   PlatformStatus;
}

// ── 6 rotating BB&B content templates (no termite content) ───────────────────
const TEMPLATES: ContentTemplate[] = [
  {
    topic: "Early Warning Signs",
    facebook:
      "🐛 Waking up with mysterious bites? Seeing tiny rust-colored spots on your sheets? These could be early warning signs of bed bugs.\n\nBed Bugs & Beyond serves all of Baldwin County — Foley, Gulf Shores, Orange Beach, Fairhope, and more. Call us before it gets worse. Free phone consultation.\n\n📞 #BedBugs #BaldwinCounty #PestControl #FoleyAL",
    instagram:
      "🚨 Early bed bug signs:\n• Small bites in a line or cluster\n• Rust-colored spots on sheets\n• Musty odor near the bed\n\nDon't wait — they spread fast. Serving Baldwin County, AL 🐛\n\n#BedBugs #BaldwinCountyAL #PestControlAL #HomePestControl #GulfShores #Foley #OrangeBeach",
    gbp:
      "Noticing mysterious bites or spots on your sheets? Bed Bugs & Beyond offers same-week inspections across all of Baldwin County. Call or message us today for a free phone consultation — fast, discreet, and professional.",
    youtube:
      "🐛 Early Warning Signs of Bed Bugs — What to Look For | Bed Bugs & Beyond\n\nAre you waking up with mysterious bites? Noticing tiny rust-colored spots on your sheets? In this video we walk you through the exact warning signs of a bed bug infestation — and what to do the moment you spot them.\n\n🔍 What we cover:\n00:00 What bed bug bites look like\n00:45 Rust-colored stains on sheets & mattresses\n01:20 The musty odor sign most people miss\n02:00 When to call a professional\n\n📍 Serving all of Baldwin County, AL — Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort\n📞 Free phone consultation — call or message us today!\n\n#BedBugs #EarlyWarningSigns #BaldwinCounty #PestControl #BedBugInspection",
    tiktok:
      "🐛 3 early bed bug signs you NEED to know 😱\n\n1️⃣ Rust-colored spots on your sheets\n2️⃣ Bites in a line or cluster\n3️⃣ Musty smell near your bed\n\nSpot any of these? Call Bed Bugs & Beyond NOW 📞\nServing Baldwin County, AL\n\n#BedBugs #PestControl #HomeHacks #BaldwinCountyAL #FYP #PestAlert #BedBugSigns",
    linkedin:
      "Did you know bed bug infestations in vacation rentals and commercial properties can surface through early, easy-to-miss signs?\n\nRust-colored stains on bedding, unexplained bite patterns, and a faint musty odor are the first indicators — and acting fast prevents a small problem from becoming a major liability.\n\nBed Bugs & Beyond specializes in fast, discreet treatment for property managers, vacation rental hosts, and HOAs across Baldwin County, AL. Free consultations available.\n\n#BedBugs #PropertyManagement #VacationRental #PestControl #BaldwinCountyAL",
    pinterest:
      "🐛 Know the Early Warning Signs of Bed Bugs | Bed Bugs & Beyond, Baldwin County AL — Rust-colored spots on sheets, bite clusters, musty odor. Catch them early before they spread! Professional pest control serving Foley, Gulf Shores, Orange Beach & all of Baldwin County. Free phone consultation. #BedBugs #PestControl #HomeTips #BaldwinCounty #BedBugWarning",
    nextdoor:
      "Hey neighbors! 👋 Are you noticing mysterious bites in the morning, or tiny rust-colored spots on your sheets? These are early warning signs of bed bugs and they spread fast.\n\nI'm the owner of Bed Bugs & Beyond — your local Baldwin County bed bug specialist. We offer same-week inspections across Foley, Gulf Shores, Orange Beach, Fairhope, and surrounding areas. Fast, discreet, and professional.\n\nFree phone consultation — just reach out! 📞",
    imageIdea: "Close-up of bed bug warning signs: rust-colored stains on white sheets with BB&B logo and orange brand accent overlay",
    cta:       "Call now for a free phone consultation",
  },
  {
    topic: "Before & After Treatment",
    facebook:
      "✅ Another Baldwin County home — bed bug free!\n\nOur treatment process is thorough, discreet, and effective. We serve Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, and all of Baldwin County.\n\nIf you're dealing with bed bugs, you don't have to fight it alone. 📞\n\n#BedBugTreatment #BaldwinCountyAL #PestControl #GulfShores",
    instagram:
      "Before: sleepless nights 😓\nAfter: peace of mind ✅\n\nBed Bugs & Beyond — trusted pest control across Baldwin County, AL.\nFast. Discreet. Guaranteed.\n\n#BedBugFree #BaldwinCounty #PestControl #BeforeAndAfter #GulfShoresAL #FoleyAL",
    gbp:
      "Recent treatment success in Gulf Shores, AL. Our professional bed bug treatment eliminates infestations at the source — no shortcuts. Serving all of Baldwin County. Fast response and thorough results.",
    youtube:
      "✅ Before & After Bed Bug Treatment — Real Results | Bed Bugs & Beyond Baldwin County\n\nWatch what our professional bed bug treatment process actually looks like — from the initial inspection to a fully treated, certified-clean home. No guesswork, no shortcuts.\n\n🏠 This treatment was completed in Gulf Shores, AL.\n\n🔍 What we cover:\n00:00 What the home looked like before treatment\n01:10 Our inspection and assessment process\n02:30 Treatment walkthrough\n04:00 Post-treatment certification\n\n📍 Serving all of Baldwin County — Foley, Gulf Shores, Orange Beach, Fairhope, Daphne\n📞 Book your inspection today!\n\n#BedBugTreatment #BeforeAndAfter #BaldwinCounty #PestControl #BedBugFree",
    tiktok:
      "Before 😩 vs After ✅ — bed bug treatment transformation!\n\nSleepless nights → full nights of rest 😴\nInfested home → certified clean 🏠\n\nBed Bugs & Beyond | Baldwin County, AL 🐛\nFast. Discreet. Guaranteed.\n\n#BedBugFree #BeforeAndAfter #PestControl #BaldwinCounty #HomeTransformation #FYP",
    linkedin:
      "Property manager or vacation rental host in Baldwin County? Here's what a single untreated bed bug report can cost:\n\n• Immediate negative reviews\n• Emergency rebook cancellations\n• Potential liability exposure\n\nBed Bugs & Beyond delivers fast, discreet treatment with before/after documentation for your records. We work with short-term rental properties, hotels, and residential managers across the Gulf Coast.\n\nReady to protect your property and your reviews? Let's talk.\n\n#VacationRental #PropertyManagement #BedBugTreatment #GulfCoast #BaldwinCountyAL",
    pinterest:
      "✅ Real Before & After Bed Bug Treatment Results | Bed Bugs & Beyond, Baldwin County AL — Professional bed bug elimination: from infestation to certified clean. Serving Foley, Gulf Shores, Orange Beach & all of Baldwin County. Fast, discreet, guaranteed results. Book your inspection today! #BedBugTreatment #BeforeAndAfter #PestControl #HomeCare #BaldwinCounty",
    nextdoor:
      "Neighbors — we just completed another successful bed bug treatment right here in Baldwin County! 🎉\n\nIf you or anyone you know is dealing with bed bugs, we offer fast, discreet service with guaranteed results. No judgment, no drama — just professional pest control.\n\nBed Bugs & Beyond serves all of Baldwin County including our local neighborhoods. Same-week appointments available.\n\nFeel free to message me directly or call for a free consultation! 📞",
    imageIdea: "Side-by-side before/after: messy infested bedroom vs. clean treated room, BB&B logo centered below",
    cta:       "Book your inspection today",
  },
  {
    topic: "Summer Travel Prevention Tips",
    facebook:
      "🧳 Traveling this summer? Bed bugs hitchhike in luggage. Here's how to protect your Baldwin County home:\n\n✅ Inspect hotel mattresses and headboards\n✅ Keep luggage off the floor (use the rack)\n✅ Wash all clothes on HIGH HEAT when you return\n\nAlready found something suspicious? Call Bed Bugs & Beyond.\n\n#TravelTips #BedBugs #BaldwinCounty #SummerTravel",
    instagram:
      "Summer travel = bed bug risk 🧳\n\n3 quick protection tips:\n1. Inspect before sleeping\n2. Luggage on racks, not floors\n3. Wash everything on high heat 🔥\n\nBed Bugs & Beyond — Baldwin County, AL 🐛\n\n#TravelTips #BedBugs #BaldwinCountyAL #PestPrevention #SummerTravel",
    gbp:
      "Traveling this summer? Protect your Baldwin County home from bed bugs with simple prevention habits. Bed Bugs & Beyond offers fast inspections for returning travelers. Call for same-week availability.",
    youtube:
      "🧳 How to Avoid Bringing Bed Bugs Home From Your Summer Vacation | Bed Bugs & Beyond\n\nEvery year, Baldwin County residents unknowingly bring bed bugs home from hotels, vacation rentals, and road trips. In this video, we show you exactly how to protect yourself — and what to do if you think you've already been exposed.\n\n🔍 What we cover:\n00:00 How bed bugs hitchhike in luggage\n01:00 Hotel room inspection checklist\n02:15 Where to store your luggage safely\n03:00 The HIGH HEAT laundry method\n04:20 When to call a professional\n\n📍 Serving all of Baldwin County, AL\n📞 Just returned from a trip and concerned? Call us for a same-week inspection!\n\n#TravelTips #BedBugs #SummerTravel #BaldwinCounty #PestPrevention",
    tiktok:
      "🧳 Traveling this summer? Watch this FIRST 🚨\n\nBed bugs hitchhike in your luggage!\n\n✅ Inspect hotel mattress seams\n✅ Use luggage racks — never the floor\n✅ Wash everything on HIGH HEAT when home 🔥\n\nServing Baldwin County, AL 🐛 | Bed Bugs & Beyond\n\n#TravelHacks #BedBugs #SummerTravel #PestPrevention #HotelTips #FYP",
    linkedin:
      "Summer travel season is the #1 driver of bed bug calls across Baldwin County, AL.\n\nFor property managers and short-term rental hosts: guests who travel frequently are the most common vector. A quick post-checkout inspection protocol can prevent a single guest from turning into a 1-star review crisis.\n\nBed Bugs & Beyond offers standing service agreements for vacation rental hosts — fast turnaround, discreet treatment, and documentation you can share with future guests.\n\nReaching out is free. 📞\n\n#ShortTermRental #VacationRental #BedBugs #PropertyManagement #BaldwinCountyAL #SummerSeason",
    pinterest:
      "🧳 Summer Travel Bed Bug Prevention Checklist | Bed Bugs & Beyond, Baldwin County AL — 3 essential steps: inspect hotel mattresses, keep luggage on racks, wash clothes on high heat. Share this before your next trip! Professional bed bug treatment across Gulf Shores, Foley & Baldwin County. #TravelTips #BedBugs #PestPrevention #SummerTravel #HomeTips",
    nextdoor:
      "Summer travel tip for Baldwin County neighbors! 🧳\n\nBed bugs are expert hitchhikers — they latch onto luggage at hotels, rentals, and airports. When you get home:\n\n✅ Check your luggage before bringing it inside\n✅ Wash everything on high heat immediately\n✅ Inspect your bed if you notice any bites within a week\n\nIf you find anything suspicious, I'm your local bed bug specialist at Bed Bugs & Beyond. Same-week inspections across the whole county. Free phone consultation!",
    imageIdea: "Clean infographic: 3-step travel checklist styled with BB&B navy/orange branding, luggage icon with bug warning badge",
    cta:       "Returning from a trip? Schedule an inspection",
  },
  {
    topic: "Gulf Shores Service Spotlight",
    facebook:
      "🌊 Serving Gulf Shores & Orange Beach homeowners — and vacation rentals!\n\nBed Bugs & Beyond provides discreet, professional bed bug treatment for short-term rental properties, hotels, and family homes. Protect your property and your reviews.\n\n📞 Fast response. Proven results.\n\n#GulfShores #OrangeBeach #VacationRental #BedBugs #BaldwinCounty",
    instagram:
      "Gulf Shores & Orange Beach — we've got you covered 🌊🐛\n\nSpecializing in:\n✅ Vacation rental treatment\n✅ Single-family homes\n✅ Discreet, fast service\n\nBed Bugs & Beyond — Baldwin County, AL\n\n#GulfShores #OrangeBeachAL #VacationRental #BedBugTreatment #BaldwinCountyAL",
    gbp:
      "Serving Gulf Shores and Orange Beach property owners and vacation rental hosts. Fast response, discreet treatment, and guaranteed results. One call covers your whole property. Contact Bed Bugs & Beyond today.",
    youtube:
      "🌊 Gulf Shores & Orange Beach Bed Bug Treatment — Bed Bugs & Beyond\n\nBed bug season hits harder on the Gulf Coast. With thousands of vacation rental turnovers every week, the risk for homeowners and property managers in Gulf Shores and Orange Beach is real — and it's growing.\n\nIn this video, we cover why the Gulf Shores area sees elevated bed bug activity, and how Bed Bugs & Beyond protects both homeowners and rental properties fast.\n\n🔍 What we cover:\n00:00 Why coastal vacation rentals are higher risk\n01:30 What our treatment process looks like for rentals\n03:00 Turnaround times and availability for Gulf Shores\n04:15 How to book a same-day inspection\n\n📍 Bed Bugs & Beyond — Baldwin County, AL\n📞 Call for vacation rental inspection pricing!\n\n#GulfShores #OrangeBeach #VacationRental #BedBugs #BaldwinCounty",
    tiktok:
      "🌊 Gulf Shores vacation rental owners — this is for YOU 📢\n\nBed bugs are the #1 review killer for Gulf Coast rentals.\n\nBed Bugs & Beyond:\n✅ Fast inspections\n✅ Discreet treatment\n✅ Same-week availability\n\nProtect your property & your 5 stars ⭐\n\n#GulfShores #OrangeBeach #VacationRental #BedBugs #BaldwinCounty #FYP #BeachRental",
    linkedin:
      "Gulf Shores and Orange Beach are among the highest-traffic vacation rental markets on the Gulf Coast — which also makes them among the highest bed bug risk areas in Alabama.\n\nFor property management companies operating in Baldwin County: a proactive inspection schedule is the most cost-effective way to protect your portfolio and your reviews.\n\nBed Bugs & Beyond offers standing service contracts for vacation rental management companies. Fast turnaround, discreet service, and results you can document for guest communications.\n\nLet's connect. 📞\n\n#VacationRental #PropertyManagement #GulfShores #OrangeBeach #BaldwinCounty #BedBugs",
    pinterest:
      "🌊 Gulf Shores & Orange Beach Vacation Rental Pest Control | Bed Bugs & Beyond — Discreet, fast bed bug treatment for Gulf Coast vacation rentals and homeowners. Protect your property and your reviews. Serving Baldwin County, AL. #GulfShores #VacationRental #BedBugs #BeachRental #PestControl #OrangeBeach",
    nextdoor:
      "Gulf Shores & Orange Beach neighbors — a heads up heading into peak season! 🌊\n\nVacation rental turnovers dramatically increase bed bug risk along the coast every summer. If you rent out your property OR you've had guests staying with you, it's worth a quick inspection.\n\nBed Bugs & Beyond serves Gulf Shores, Orange Beach, and all surrounding areas with fast, discreet treatment. I personally handle every job.\n\nFeel free to message me here or call for a free consultation. Protect your home before peak season hits! 📞",
    imageIdea: "Gulf Shores beach scene background with BB&B branded service badge overlay — clean, professional, coastal feel",
    cta:       "Call for vacation rental inspection pricing",
  },
  {
    topic: "5-Star Review Spotlight",
    facebook:
      "⭐⭐⭐⭐⭐ \"Professional, thorough, and fast. I'd highly recommend Bed Bugs & Beyond for anyone in Baldwin County dealing with bed bugs.\" — Recent customer\n\nThank you for trusting us! Ready to experience 5-star service?\n\n📞 We serve all of Baldwin County.\n\n#5Stars #BaldwinCounty #BedBugs #CustomerReview #PestControl",
    instagram:
      "⭐⭐⭐⭐⭐ Another 5-star review!\n\n\"Professional, thorough, and fast.\"\n\nThank you Baldwin County! 🙏\nBed Bugs & Beyond — your trusted local pest control.\n\n#5Stars #BaldwinCountyAL #BedBugsAL #CustomerLove #PestControl #LocalBusiness",
    gbp:
      "Thank you to our latest 5-star reviewer! Bed Bugs & Beyond is proud to serve Baldwin County with professional, thorough pest control. Browse our Google reviews and book your inspection today.",
    youtube:
      "⭐ Why Baldwin County Homeowners Trust Bed Bugs & Beyond — Real Reviews\n\nDon't take our word for it. In this video, we share real customer feedback from homeowners and property managers across Baldwin County who trusted Bed Bugs & Beyond to solve their bed bug problem — fast.\n\n🔍 What you'll hear:\n00:00 Introduction — why trust matters in pest control\n01:00 Customer story: Gulf Shores homeowner\n02:30 Customer story: Foley vacation rental host\n04:00 Customer story: Fairhope family\n05:30 How to book your inspection\n\n📍 Serving all of Baldwin County, AL\n📞 Hundreds of satisfied customers — let's add your name to the list!\n\n#CustomerReviews #BaldwinCounty #BedBugs #PestControl #TrustedLocal",
    tiktok:
      "⭐⭐⭐⭐⭐ Our latest Baldwin County review just dropped! 🙌\n\n\"Professional, thorough, and fast.\"\n\nThat's the Bed Bugs & Beyond way 🐛✅\nServing Gulf Shores, Foley, Fairhope & all of Baldwin County\n\n#CustomerLove #5Stars #BedBugs #PestControl #BaldwinCounty #FYP #LocalBusiness",
    linkedin:
      "\"Professional, thorough, and fast.\" — Baldwin County customer, 5-star review\n\nThat's the standard we hold ourselves to at Bed Bugs & Beyond for every residential, commercial, and vacation rental job across Baldwin County, AL.\n\nIf you manage properties in the Gulf Coast area and need a reliable, discreet pest control partner, I'd love to connect. Our track record speaks for itself.\n\n#PestControl #5Stars #VacationRental #PropertyManagement #BaldwinCounty #GulfCoast",
    pinterest:
      "⭐⭐⭐⭐⭐ 5-Star Bed Bug Treatment Reviews | Bed Bugs & Beyond, Baldwin County AL — \"Professional, thorough, and fast.\" Trusted by homeowners and vacation rental hosts across Gulf Shores, Foley & Baldwin County. Read our reviews and book your inspection today! #CustomerReviews #BedBugs #PestControl #5Stars #BaldwinCounty",
    nextdoor:
      "Sharing a recent review from a neighbor here in Baldwin County ⭐⭐⭐⭐⭐\n\n\"Professional, thorough, and fast. I'd highly recommend Bed Bugs & Beyond for anyone in Baldwin County dealing with bed bugs.\"\n\nThank you! 🙏 If you or a neighbor ever needs fast, discreet bed bug treatment, don't hesitate to reach out. Serving all of Baldwin County — same-week appointments available.\n\nFree phone consultation! 📞",
    imageIdea: "Review card graphic: 5 orange stars, quote text, BB&B logo on dark navy — screenshot-style social proof format",
    cta:       "Read our reviews — then book your inspection",
  },
  {
    topic: "Summer Bed Bug Season Alert",
    facebook:
      "☀️ Summer is peak season for bed bugs in Baldwin County.\n\nMore travel, more hotel stays, more risk at home. Bed Bugs & Beyond offers fast inspections and effective treatment throughout Foley, Gulf Shores, Fairhope, Daphne, Spanish Fort, and the whole county.\n\nDon't let pests ruin your summer. 📞\n\n#SummerPests #BaldwinCounty #BedBugs #PestControl #FoleyAL",
    instagram:
      "☀️ Summer = bed bug season in Baldwin County\n\nMore travel → more risk 🐛\n\nBed Bugs & Beyond is ready:\n✅ Same-week inspections\n✅ All Baldwin County areas\n✅ Fast and discreet\n\n#SummerPests #BaldwinCountyAL #BedBugs #GulfShores #Foley #PestControl",
    gbp:
      "Summer is here — and so is bed bug season in Baldwin County. Bed Bugs & Beyond offers fast inspections and professional treatment from Foley to Gulf Shores. Call today for a same-week appointment.",
    youtube:
      "☀️ Summer Bed Bug Season in Baldwin County — What You Need to Know | Bed Bugs & Beyond\n\nSummer is the busiest season for bed bug calls in Baldwin County — and it's not a coincidence. More travel, more vacation rentals, more risk. In this video, we explain exactly why summer spikes bed bug activity and how to protect your home right now.\n\n🔍 What we cover:\n00:00 Why summer is peak bed bug season\n01:15 High-risk activities during summer (travel, guests, rentals)\n02:45 What to do if you think you're exposed\n04:00 Same-week inspection availability — Baldwin County, AL\n\n📍 Serving all of Baldwin County — Foley, Gulf Shores, Fairhope, Daphne, Orange Beach, Spanish Fort\n📞 Don't wait — summer books fast. Call today!\n\n#SummerPests #BedBugs #BaldwinCounty #PestSeason #PestControl",
    tiktok:
      "☀️ Summer = PEAK bed bug season 🐛🚨\n\nMore travel = more risk for YOUR home!\n\nBed Bugs & Beyond is ready:\n✅ Same-week inspections\n✅ All of Baldwin County\n✅ Fast & discreet\n\nDon't let pests ruin your summer ☀️📞\n\n#SummerPests #BedBugs #BaldwinCounty #PestAlert #PestControl #FYP #GulfShores",
    linkedin:
      "Summer is the most active season for bed bug infestations in Baldwin County, AL — and that directly impacts commercial properties, short-term rentals, and hospitality businesses along the Gulf Coast.\n\nWith peak travel season underway, now is the time to review your inspection protocols and ensure your properties are protected before a guest complaint becomes a public review.\n\nBed Bugs & Beyond offers standing service agreements and priority response for commercial clients throughout the summer season. Reach out to discuss a proactive plan.\n\n#SummerSeason #BedBugs #CommercialPestControl #VacationRental #BaldwinCounty #GulfCoast",
    pinterest:
      "☀️ Summer Bed Bug Season Alert — Baldwin County, AL | Bed Bugs & Beyond — Peak season is here! More travel = more risk. Same-week inspections available across Gulf Shores, Foley, Fairhope & all of Baldwin County. Don't wait — call before it spreads! #SummerPests #BedBugs #PestControl #BaldwinCounty #SeasonalPest",
    nextdoor:
      "Heads up, Baldwin County neighbors — summer is peak bed bug season! 🌞\n\nMore travel, more vacation rental guests, more risk. I want to make sure our community knows: if you're noticing any suspicious bites or spots on your bedding after travel or having guests, reach out early — the sooner we catch it, the easier and faster the fix.\n\nBed Bugs & Beyond serves all of Baldwin County. Same-week inspections, fast and discreet. Free phone consultation — just message me here or call! 📞",
    imageIdea: "Summer-themed branded graphic: sun icon + bed bug alert badge, BB&B orange/navy colors, text: 'Peak Season — Act Fast'",
    cta:       "Schedule a same-week inspection today",
  },
];

const INITIAL_STATUS: Partial<Record<SocialProviderId, PlatformStatus>> = Object.fromEntries(
  QUEUEABLE_PROVIDERS.map(p => [p.id, "not-queued" as PlatformStatus]),
);

// Context-specific display notes shown in the caption panel for pending platforms.
// These are UX strings — not registry metadata.
const PLATFORM_NOTE: Partial<Record<SocialProviderId, string>> = {
  youtube:   "YouTube content is saved as a video description draft. Publishing requires a video file — upload your video in the Publishing Center to auto-publish.",
  tiktok:    "Content saved as draft. Auto-publishing activates once TikTok Business app approval is complete.",
  linkedin:  "Content saved as draft. LinkedIn auto-publish handler is in progress — copy content to post manually in the meantime.",
  pinterest: "Content saved as draft. Pinterest API connection coming soon — copy and post manually to your Pinterest Business account.",
  nextdoor:  "Content saved as draft. Nextdoor API integration coming soon — copy and post manually to your Nextdoor Business page.",
};

// ── Content Profiles — per-platform media + format guidance ────────────────────────────────────────────
const CONTENT_PROFILES: Record<SocialProviderId, ContentProfile> = {
  facebook: {
    mediaType: "image", maxLength: "400–500 chars", bestFormat: "Photo + text post",
    frequency: "3–5x/week", ctaTip: "Include a direct phone number or link every time",
    hashtagCount: "3–5", note: "Photos outperform text-only. Respond to comments within 24h.",
  },
  instagram: {
    mediaType: "image", maxLength: "125–220 chars", bestFormat: "Square photo + caption",
    frequency: "3–5x/week", ctaTip: "Use 5–15 local hashtags and tag your city",
    hashtagCount: "5–15", note: "Before/after photos perform best. Post Stories daily for reach.",
  },
  google_business: {
    mediaType: "image", maxLength: "1,500 chars", bestFormat: "Photo + update post",
    frequency: "1–2x/week", ctaTip: "Include service-area cities in every post",
    hashtagCount: "0–2", note: "Add a photo to every post. Use keywords like 'bed bug treatment Baldwin County'.",
  },
  youtube: {
    mediaType: "video", maxLength: "4,000 chars", bestFormat: "Video + description",
    frequency: "1–2x/month", ctaTip: "End every video with a clear phone number CTA",
    hashtagCount: "5–8", note: "Use as full video description. Add timestamps and local keywords for SEO.",
  },
  tiktok: {
    mediaType: "video", maxLength: "100–150 chars", bestFormat: "Short-form video + caption",
    frequency: "3–7x/week", ctaTip: "Hook viewers in the first second; keep CTAs short",
    hashtagCount: "3–5 trending", note: "Keep captions punchy. Use trending + niche hashtags.",
  },
  linkedin: {
    mediaType: "article", maxLength: "1,500 chars", bestFormat: "Text post or article",
    frequency: "2–3x/week", ctaTip: "Target property managers and vacation rental hosts",
    hashtagCount: "3–5", note: "Professional tone. Data-driven content performs best. Connect with rental networks.",
  },
  pinterest: {
    mediaType: "pin", maxLength: "500 chars", bestFormat: "Vertical image (2:3) + description",
    frequency: "5–10 pins/week", ctaTip: "Keyword-rich descriptions; link pins to your website",
    hashtagCount: "3–5", note: "Vertical images (2:3 ratio) perform best. Create a 'Pest Prevention Tips' board.",
  },
  nextdoor: {
    mediaType: "text", maxLength: "300 chars", bestFormat: "Conversational update",
    frequency: "1–2x/week", ctaTip: "Neighbor-to-neighbor tone; no hard sell",
    hashtagCount: "0", note: "Avoid hard-sell language. Share seasonal alerts & local tips. Respond quickly.",
  },
};

const MEDIA_ICON: Record<MediaType, string> = {
  image: "🖼️", video: "🎬", carousel: "🖼️", text: "📝", pin: "📌", article: "📄",
};

const SELECTION_STORAGE_KEY = "ai-edge:autopilot-selection:v1";

const STATUS_META: Record<PlatformStatus, { dot: string; label: string; color: string }> = {
  "not-queued": { dot: "#475569", label: "Not queued",        color: "#64748B" },
  "ready":      { dot: "#FBBF24", label: "Ready for review",  color: "#FBBF24" },
  "success":    { dot: "#22C55E", label: "Published",         color: "#22C55E" },
  "failed":     { dot: "#EF4444", label: "Failed",            color: "#EF4444" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function weekLabel(): string {
  const d = new Date();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `Week of ${monday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function captionFor(t: ContentTemplate, p: SocialProviderId): string {
  if (p === "facebook")        return t.facebook;
  if (p === "instagram")       return t.instagram;
  if (p === "google_business") return t.gbp;
  if (p === "youtube")         return t.youtube;
  if (p === "tiktok")          return t.tiktok;
  if (p === "linkedin")        return t.linkedin;
  if (p === "pinterest")       return t.pinterest;
  if (p === "nextdoor")        return t.nextdoor;
  return "";
}

function nowTs(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BBBContentAutopilotPage() {
  const [templateIdx,     setTemplateIdx]     = useState<number | null>(null);
  const [activeTab,       setActiveTab]       = useState<SocialProviderId>("facebook");
  const [queue,           setQueue]           = useState<QueuedPost[]>([]);
  const [copiedKey,       setCopiedKey]       = useState<string | null>(null);
  const [justQueued,      setJustQueued]      = useState<string[]>([]);
  const [platformStatus,  setPlatformStatus]  = useState<Partial<Record<SocialProviderId, PlatformStatus>>>({ ...INITIAL_STATUS });
  const [activityLog,     setActivityLog]     = useState<ActivityEntry[]>([]);
  const [draftsSaved,     setDraftsSaved]     = useState<Set<string>>(new Set());

  // Platform selection — persisted in localStorage
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<SocialProviderId>>(() => {
    try {
      const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const valid = parsed.filter((id): id is SocialProviderId =>
          QUEUEABLE_PROVIDERS.some(p => p.id === id),
        );
        if (valid.length > 0) return new Set(valid);
      }
    } catch { /* ignore corrupt storage */ }
    return new Set(QUEUEABLE_PROVIDERS.map(p => p.id));
  });

  // V2: real backend draft creation
  const authFetch   = useApiFetch();
  const createDraft = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      authFetch<{ id: number }>("/social-posts", { method: "POST", body: JSON.stringify(data) }),
  });

  // Live social connections — used to derive connected/disconnected state per provider
  const { data: connections = [] } = useQuery<Array<{ id: string; provider: string; accountName: string | null }>>({
    queryKey: ["social_connections"],
    queryFn:  () => authFetch<Array<{ id: string; provider: string; accountName: string | null }>>("/social-connections"),
    staleTime: 60 * 1000,
  });
  const connectedProviders = new Set(connections.map(c => c.provider));

  const generated = templateIdx !== null ? TEMPLATES[templateIdx] : null;

  // ── Selection helpers ──────────────────────────────────────────────────────────────────────────────
  const isSelected = (id: SocialProviderId) => selectedPlatforms.has(id);
  const togglePlatform = (id: SocialProviderId) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedPlatforms(new Set(QUEUEABLE_PROVIDERS.map(p => p.id)));
  const deselectAll = () => setSelectedPlatforms(new Set());

  // Persist selection changes to localStorage
  useEffect(() => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify([...selectedPlatforms]));
  }, [selectedPlatforms]);

  // ── Derived status values (SELECTED platforms only) ──
  const selectedQueueable = QUEUEABLE_PROVIDERS.filter(p => selectedPlatforms.has(p.id));
  const anyReady   = selectedQueueable.some(p => platformStatus[p.id] === "ready");
  const anyFailed  = selectedQueueable.some(p => platformStatus[p.id] === "failed");
  const allReady   = selectedQueueable.length > 0 && selectedQueueable.every(p => platformStatus[p.id] === "ready");
  const noneQueued = selectedQueueable.every(p => platformStatus[p.id] === "not-queued");

  const banner = anyFailed
    ? { color: B.red,    bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.3)",   icon: "🔴", text: "Some platforms need attention"   }
    : allReady
    ? { color: B.green,  bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.3)",   icon: "🟢", text: "All platforms ready for review"  }
    : anyReady
    ? { color: B.gold,   bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.3)",  icon: "🟡", text: "Posts ready for review"          }
    : { color: B.dim,    bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.2)", icon: "⚪", text: "No posts queued yet"              };

  function handleGenerate() {
    if (selectedQueueable.length === 0) return; // nothing to generate
    setTemplateIdx(prev => prev === null ? 0 : (prev + 1) % TEMPLATES.length);
    // Default active tab to the first selected platform
    const firstSelected = QUEUEABLE_PROVIDERS.find(p => selectedPlatforms.has(p.id));
    setActiveTab(firstSelected?.id ?? "facebook");
    setJustQueued([]);
    setPlatformStatus({ ...INITIAL_STATUS });
  }

  function queuePost(platform: SocialProviderId) {
    if (!generated) return;
    if (!selectedPlatforms.has(platform)) return; // skip unselected
    const post: QueuedPost = {
      id:        uid(),
      platform,
      caption:   captionFor(generated, platform),
      imageIdea: generated.imageIdea,
      cta:       generated.cta,
      topic:     generated.topic,
      queuedAt:  nowTs(),
    };
    setQueue(q => [post, ...q]);
    setJustQueued(prev => [...new Set([...prev, platform])]);
    setPlatformStatus(s => ({ ...s, [platform]: "ready" }));
    setActivityLog(prev => [{
      id:       uid(),
      ts:       nowTs(),
      platform,
      action:   `"${generated.topic}" added to review queue`,
      status:   "ready",
    }, ...prev]);

    // V2: save to backend as a real draft in the Publishing Center
    // Backend expects "google" (page-local alias), not "google_business" (registry ID)
    const platformKey = platform === "google_business" ? "google" : platform;
    createDraft.mutate({
      caption:         captionFor(generated, "instagram"),
      captionFacebook: captionFor(generated, "facebook"),
      captionGoogle:   captionFor(generated, "google_business"),
      platforms:       [platformKey],
      status:          "draft",
    }, {
      onSuccess: () => setDraftsSaved(prev => new Set([...prev, post.id])),
    });
  }

  function queueAll() {
    if (!generated) return;
    selectedQueueable.forEach(p => { if (!justQueued.includes(p.id)) queuePost(p.id); });
  }

  function removeFromQueue(id: string) {
    const post = queue.find(p => p.id === id);
    if (post) {
      const stillQueued = queue.filter(p => p.id !== id && p.platform === post.platform).length > 0;
      if (!stillQueued) setPlatformStatus(s => ({ ...s, [post.platform]: "not-queued" }));
      setActivityLog(prev => [{
        id:       uid(),
        ts:       nowTs(),
        platform: post.platform,
        action:   "Removed from queue",
        status:   "not-queued",
      }, ...prev]);
    }
    setQueue(q => q.filter(p => p.id !== id));
    setJustQueued(prev => {
      if (!post) return prev;
      const remaining = queue.filter(p => p.id !== id && p.platform === post.platform);
      return remaining.length === 0 ? prev.filter(pl => pl !== post.platform) : prev;
    });
  }

  function copyText(text: string, key: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }).catch(() => {});
    }
  }

  const currentCaption = generated ? captionFor(generated, activeTab) : "";
  const isInfoTab      = !QUEUEABLE_PROVIDERS.some(p => p.id === activeTab);
  const activeProvider = SOCIAL_PROVIDERS.find(p => p.id === activeTab) ?? SOCIAL_PROVIDERS[0];
  const allQueued      = selectedQueueable.length > 0 && selectedQueueable.every(p => justQueued.includes(p.id));

  return (
    <div style={{ minHeight: "100vh", background: B.navy, color: B.white, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Workflow Navigator ── */}
      <div style={{ padding: "14px 36px 0" }}>
        <WorkflowNav />
      </div>

      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${B.bbbDark} 0%, #0A1A2E 60%, ${B.navy} 100%)`,
        borderBottom: `1px solid ${B.border}`, padding: "26px 36px 22px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const,
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, rgba(242,108,33,0.3) 0%, rgba(0,119,182,0.2) 100%)`,
          border: `1px solid rgba(242,108,33,0.4)`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
        }}>⚡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: B.white, letterSpacing: "-0.3px" }}>
            Content Autopilot V1
          </div>
          <div style={{ fontSize: 12, color: B.dim, marginTop: 3 }}>
            Bed Bugs &amp; Beyond · Baldwin County, AL — Generate &amp; queue posts across all connected platforms in one click
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: "rgba(242,108,33,0.12)", border: `1px solid rgba(242,108,33,0.3)`,
            color: B.bbbOrange, borderRadius: 8, padding: "4px 12px",
          }}>
            {weekLabel()}
          </span>
          {!noneQueued && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: banner.bg, border: `1px solid ${banner.border}`,
              color: banner.color, borderRadius: 8, padding: "4px 12px",
            }}>
              {banner.icon} {banner.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "28px 36px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Generate card ── */}
        <div style={{
          background: `linear-gradient(135deg, ${B.bbbDark} 0%, #0A1E35 60%, ${B.panel} 100%)`,
          border: `1px solid rgba(242,108,33,0.3)`, borderRadius: 18,
          padding: "28px 32px", marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap" as const, gap: 20,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: B.bbbOrange, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
              ⚡ Weekly Content Plan
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: B.white, letterSpacing: "-0.5px", marginBottom: 8 }}>
              {generated ? generated.topic : "Ready to generate this week's content"}
            </div>
            <div style={{ fontSize: 13, color: B.silver, maxWidth: 520 }}>
              {generated
                ? "Captions for all connected platforms — ready to copy or queue."
                : "One click builds weekly content from the template library: platform-specific captions, an image idea, and a call-to-action for each selected channel."}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <button
              onClick={handleGenerate}
              disabled={selectedQueueable.length === 0}
              style={{
                flexShrink: 0,
                background: selectedQueueable.length === 0
                  ? `linear-gradient(135deg, rgba(242,108,33,0.08) 0%, rgba(0,119,182,0.05) 100%)`
                  : `linear-gradient(135deg, rgba(242,108,33,0.2) 0%, rgba(0,119,182,0.15) 100%)`,
                border: selectedQueueable.length === 0
                  ? `1.5px solid rgba(242,108,33,0.15)`
                  : `1.5px solid rgba(242,108,33,0.5)`,
                borderRadius: 12, padding: "14px 28px",
                fontSize: 14, fontWeight: 800,
                color: selectedQueueable.length === 0 ? B.dim : B.white,
                cursor: selectedQueueable.length === 0 ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 10,
              }}
              onMouseEnter={e => {
                if (selectedQueueable.length === 0) return;
                (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.35) 0%, rgba(0,119,182,0.25) 100%)";
              }}
              onMouseLeave={e => {
                if (selectedQueueable.length === 0) return;
                (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.2) 0%, rgba(0,119,182,0.15) 100%)";
              }}
            >
              <span style={{ fontSize: 20 }}>⚡</span>
              {generated ? "Generate Next Week →" : "Generate Weekly Content"}
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: "rgba(0,0,0,0.2)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6, padding: "2px 8px",
                color: B.silver,
              }}>
                {selectedQueueable.length} {selectedQueueable.length === 1 ? "platform" : "platforms"}
              </span>
            </button>
            {selectedQueueable.length === 0 && (
              <div style={{ fontSize: 11, color: B.dim, textAlign: "center" }}>
                Select at least one platform to generate content.
              </div>
            )}
          </div>
        </div>

        {/* ── Publishing Status Bar ── */}
        <div style={{
          background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16,
          padding: "16px 20px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const,
        }}>
          {/* Overall banner */}
          <div style={{
            flex: 1, minWidth: 180,
            background: banner.bg, border: `1px solid ${banner.border}`,
            borderRadius: 10, padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>{banner.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: banner.color }}>{banner.text}</div>
              <div style={{ fontSize: 10, color: B.dim, marginTop: 2 }}>
                {noneQueued ? "Generate content and queue posts to begin" : "Posts are held for review — nothing publishes automatically"}
              </div>
            </div>
          </div>

          {/* Platform status — all providers from registry */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {SOCIAL_PROVIDERS.map(p => {
              const isQueueable = QUEUEABLE_PROVIDERS.some(q => q.id === p.id);
              if (isQueueable) {
                const sState = platformStatus[p.id] ?? "not-queued";
                const sMeta  = STATUS_META[sState];
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: `${p.color}08`,
                    border: `1px solid ${sState !== "not-queued" ? `${sMeta.dot}40` : `${p.color}20`}`,
                    borderRadius: 10, padding: "8px 12px", minWidth: 110,
                    transition: "all 0.3s",
                  }}>
                    <div style={{
                      width: 11, height: 11, borderRadius: "50%", flexShrink: 0,
                      background: sMeta.dot,
                      boxShadow: sState !== "not-queued" ? `0 0 7px ${sMeta.dot}` : "none",
                      transition: "all 0.3s",
                    }} />
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: B.white }}>
                        {p.icon} {p.abbreviation}
                      </div>
                      <div style={{ fontSize: 9, color: sMeta.color, fontWeight: 600, marginTop: 1 }}>
                        {sMeta.label}
                      </div>
                    </div>
                  </div>
                );
              } else {
                const uiState = resolvePlatformUIState(p, connectedProviders.has(p.id));
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    background: `${p.color}04`,
                    border: `1px solid ${p.color}15`,
                    borderRadius: 10, padding: "8px 12px", minWidth: 110,
                    opacity: 0.6,
                  }}>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: B.dim }}>
                        {p.icon} {p.abbreviation}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <PlatformStateChip state={uiState} size="xs" />
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* ── Generated content ── */}
        {generated && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

            {/* ── Platform captions ── */}
            <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: B.bbbOrange, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                📝 Platform Captions
              </div>

              {/* Platform tabs — all providers from registry */}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                {SOCIAL_PROVIDERS.map(provider => {
                  const isQueueable = QUEUEABLE_PROVIDERS.some(q => q.id === provider.id);
                  const isActive    = activeTab === provider.id;
                  const sState      = isQueueable ? (platformStatus[provider.id] ?? "not-queued") : null;
                  const sMeta       = sState ? STATUS_META[sState] : null;
                  return (
                    <button
                      key={provider.id}
                      onClick={() => setActiveTab(provider.id)}
                      title={!isQueueable && PLATFORM_NOTE[provider.id] ? PLATFORM_NOTE[provider.id] : undefined}
                      style={{
                        flex: "1 1 auto",
                        background: isActive ? `${provider.color}20` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${isActive ? `${provider.color}55` : "rgba(255,255,255,0.07)"}`,
                        borderRadius: 8, padding: "7px 4px",
                        fontSize: 10, fontWeight: 700,
                        color: isActive ? provider.color : isQueueable ? B.dim : "#374151",
                        cursor: "pointer", transition: "all 0.15s",
                        position: "relative" as const,
                        opacity: isQueueable ? 1 : 0.65,
                      }}
                    >
                      {provider.icon} {provider.abbreviation}
                      {sState && sState !== "not-queued" && sMeta && (
                        <span style={{
                          position: "absolute" as const, top: -5, right: -5,
                          width: 10, height: 10, borderRadius: "50%",
                          background: sMeta.dot, border: `2px solid ${B.panel}`,
                        }} />
                      )}
                      {!isQueueable && (
                        <span style={{
                          position: "absolute" as const, top: -5, right: -5,
                          width: 10, height: 10, borderRadius: "50%",
                          background: provider.status === "coming_soon" ? "#475569" : "#F59E0B",
                          border: `2px solid ${B.panel}`,
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Caption */}
              <div style={{ position: "relative" as const, flex: 1 }}>
                {isInfoTab ? (
                  /* Informational platform — no static template content */
                  <div style={{
                    width: "100%", boxSizing: "border-box" as const,
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${activeProvider.color}30`,
                    borderRadius: 10, padding: "20px 16px",
                    fontSize: 12, color: B.dim, lineHeight: 1.7,
                    textAlign: "center" as const, minHeight: 148,
                    display: "flex", flexDirection: "column" as const,
                    alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 22, opacity: 0.4 }}>{activeProvider.icon}</span>
                    <div style={{ fontWeight: 700, color: B.silver, fontSize: 12 }}>
                      {activeProvider.status === "coming_soon"      ? "Coming Soon"
                        : activeProvider.status === "pending_approval" ? "Pending Approval"
                        : connectedProviders.has(activeProvider.id)    ? "Connected — Not available in Autopilot"
                        : "Not Connected"}
                    </div>
                    <div style={{ fontSize: 11, color: B.dim, maxWidth: 280 }}>
                      {PLATFORM_NOTE[activeProvider.id] ?? `${activeProvider.label} is not yet available in Content Autopilot.`}
                    </div>
                    <PlatformStateChip
                      state={resolvePlatformUIState(activeProvider, connectedProviders.has(activeProvider.id))}
                      size="sm"
                    />
                  </div>
                ) : (
                  <textarea
                    readOnly
                    value={currentCaption}
                    rows={9}
                    style={{
                      width: "100%", boxSizing: "border-box" as const,
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${activeProvider.color}30`,
                      borderRadius: 10, padding: "12px 14px",
                      fontSize: 12, color: B.white, lineHeight: 1.7,
                      fontFamily: "inherit", resize: "none", outline: "none",
                    }}
                  />
                )}
                {!isInfoTab && (
                  <button
                    onClick={() => copyText(currentCaption, `caption-${activeTab}`)}
                    style={{
                      position: "absolute" as const, top: 8, right: 8,
                      background: copiedKey === `caption-${activeTab}` ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${copiedKey === `caption-${activeTab}` ? "rgba(16,185,129,0.4)" : B.border}`,
                      borderRadius: 6, padding: "3px 10px",
                      fontSize: 10, fontWeight: 700,
                      color: copiedKey === `caption-${activeTab}` ? B.emerald : B.silver,
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    {copiedKey === `caption-${activeTab}` ? "✓ Copied" : "📋 Copy"}
                  </button>
                )}
              </div>

              <div style={{ fontSize: 10, color: B.dim, marginTop: -8 }}>
                {activeTab === "facebook"        && "Facebook: ~400–500 chars recommended · include a CTA"}
                {activeTab === "instagram"       && "Instagram: 5–15 hashtags · tag your city · emoji-friendly"}
                {activeTab === "google_business" && "GBP: 1,500 char max · include your service area cities"}
                {activeTab === "youtube"         && "YouTube: use as video description · include timestamps & local keywords"}
                {activeTab === "tiktok"          && "TikTok: short & punchy · use trending hashtags · under 150 chars ideal"}
                {activeTab === "linkedin"        && "LinkedIn: professional tone · target property managers & rental hosts"}
                {activeTab === "pinterest"       && "Pinterest: keyword-rich · describe the image · add your location"}
                {activeTab === "nextdoor"        && "Nextdoor: conversational · use neighbor-to-neighbor tone · no hard sell"}
              </div>
            </div>

            {/* ── Right column ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Image idea */}
              <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: B.purple, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
                  🎨 Suggested Image / Video
                </div>
                <div style={{ fontSize: 12.5, color: B.white, lineHeight: 1.6 }}>{generated.imageIdea}</div>
              </div>

              {/* CTA */}
              <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: B.gold, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
                  📣 Call to Action
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: B.white,
                    background: "rgba(251,191,36,0.08)", border: `1px solid rgba(251,191,36,0.25)`,
                    borderRadius: 8, padding: "8px 14px", flex: 1,
                  }}>
                    {generated.cta}
                  </div>
                  <button
                    onClick={() => copyText(generated.cta, "cta")}
                    style={{
                      background: copiedKey === "cta" ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${copiedKey === "cta" ? "rgba(16,185,129,0.35)" : B.border}`,
                      borderRadius: 7, padding: "6px 12px",
                      fontSize: 10, fontWeight: 700,
                      color: copiedKey === "cta" ? B.emerald : B.silver,
                      cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                    }}
                  >
                    {copiedKey === "cta" ? "✓" : "📋"}
                  </button>
                </div>
              </div>

              {/* Queue buttons */}
              <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px", flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: B.sky, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>✅ Select Platforms ({selectedQueueable.length}/{QUEUEABLE_PROVIDERS.length})</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={selectAll}
                      style={{ fontSize: 9, padding: "3px 8px", borderRadius: 6, border: `1px solid ${B.border}`, background: "transparent", color: B.silver, cursor: "pointer" }}
                    >All</button>
                    <button
                      onClick={deselectAll}
                      style={{ fontSize: 9, padding: "3px 8px", borderRadius: 6, border: `1px solid ${B.border}`, background: "transparent", color: B.silver, cursor: "pointer" }}
                    >None</button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Platform selection cards — one per queueable platform */}
                  {QUEUEABLE_PROVIDERS.map(p => {
                    const sel    = selectedPlatforms.has(p.id);
                    const prof   = CONTENT_PROFILES[p.id];
                    const uiState = resolvePlatformUIState(p, connectedProviders.has(p.id));
                    return (
                      <div
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        style={{
                          background: sel ? `${p.color}10` : "transparent",
                          border: `1.5px solid ${sel ? `${p.color}55` : `${p.color}18`}`,
                          borderRadius: 10, padding: "10px 14px",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          display: "flex", alignItems: "center", gap: 10,
                          opacity: sel ? 1 : 0.55,
                        }}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: 18, height: 18, borderRadius: 5,
                          border: `1.5px solid ${sel ? p.color : "#475569"}`,
                          background: sel ? p.color : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {sel && <span style={{ color: B.navy, fontSize: 10, fontWeight: 800 }}>✓</span>}
                        </div>
                        {/* Icon + label */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: sel ? p.color : B.silver }}>
                            <span>{p.icon}</span> {p.label}
                          </div>
                          <div style={{ fontSize: 9, color: B.dim, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span>{MEDIA_ICON[prof.mediaType]} {prof.mediaType}</span>
                            <span>• {prof.maxLength}</span>
                            <span>• {prof.frequency}</span>
                          </div>
                        </div>
                        {/* Status chip */}
                        <div style={{ flexShrink: 0 }}>
                          <PlatformStateChip state={uiState} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Non-queueable platforms — from registry: shown with live state chip (at bottom of selection list) */}
                  {SOCIAL_PROVIDERS.filter(p => !QUEUEABLE_PROVIDERS.some(q => q.id === p.id)).map(p => {
                    const uiState = resolvePlatformUIState(p, connectedProviders.has(p.id));
                    return (
                      <div
                        key={p.id}
                        title={PLATFORM_NOTE[p.id]}
                        style={{
                          background: `${p.color}06`,
                          border: `1px dashed ${p.color}20`,
                          borderRadius: 10, padding: "8px 14px",
                          fontSize: 11, fontWeight: 700,
                          color: "#374151",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          cursor: "default",
                        }}
                      >
                        <span style={{ color: p.color, opacity: 0.4 }}>{p.icon}</span>
                        <span style={{ flex: 1, marginLeft: 8 }}>{p.abbreviation} — Not available in Autopilot</span>
                        <PlatformStateChip state={uiState} />
                      </div>
                    );
                  })}

                  <button
                    onClick={queueAll}
                    disabled={allQueued || selectedQueueable.length === 0}
                    style={{
                      marginTop: 4,
                      background: allQueued
                        ? "rgba(34,197,94,0.12)"
                        : `linear-gradient(135deg, rgba(242,108,33,0.18) 0%, rgba(0,174,239,0.12) 100%)`,
                      border: `1.5px solid ${allQueued ? "rgba(34,197,94,0.4)" : "rgba(242,108,33,0.45)"}`,
                      borderRadius: 10, padding: "12px 14px",
                      fontSize: 13, fontWeight: 800,
                      color: allQueued ? B.green : B.white,
                      cursor: allQueued ? "default" : "pointer", transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { if (!allQueued) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.30) 0%, rgba(0,174,239,0.20) 100%)"; }}
                    onMouseLeave={e => { if (!allQueued) (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.18) 0%, rgba(0,174,239,0.12) 100%)"; }}
                  >
                    {selectedQueueable.length === 0
                      ? "❌ No Platforms Selected"
                      : allQueued
                        ? `🟢 All ${selectedQueueable.length} Selected Platforms Ready`
                        : `⚡ Queue All ${selectedQueueable.length} Selected Platforms`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!generated && (
          <div style={{
            background: B.panel, border: `1px solid ${B.border}`,
            borderRadius: 16, padding: "48px 32px",
            textAlign: "center" as const, marginBottom: 20,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: B.white, marginBottom: 8 }}>
              No content generated yet
            </div>
            <div style={{ fontSize: 13, color: B.dim, maxWidth: 400, margin: "0 auto" }}>
              Click "Generate Weekly Content" above to create this week's Facebook, Instagram, and Google Business Profile posts for Bed Bugs &amp; Beyond.
            </div>
          </div>
        )}

        {/* ── Ready-to-Queue list ── */}
        {queue.length > 0 && (
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px", marginBottom: 20 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: B.green, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                📋 Ready to Queue — {queue.length} post{queue.length !== 1 ? "s" : ""}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, color: B.dim,
                background: "rgba(255,255,255,0.04)", border: `1px solid ${B.border}`,
                borderRadius: 6, padding: "3px 10px",
              }}>
                Not published — review before sending
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {queue.map(post => {
                const prov   = SOCIAL_PROVIDERS.find(p => p.id === post.platform);
                const pColor = prov?.color ?? "#64748B";
                const pIcon  = prov?.icon ?? "?";
                const pAbbr  = prov?.abbreviation ?? post.platform;
                const sState = platformStatus[post.platform] ?? "not-queued";
                const sMeta  = STATUS_META[sState];
                return (
                  <div key={post.id} style={{
                    background: `${pColor}08`, border: `1px solid ${pColor}25`,
                    borderRadius: 12, padding: "14px 16px",
                    display: "flex", gap: 14, alignItems: "flex-start",
                  }}>
                    <div style={{
                      flexShrink: 0, width: 40, height: 40, borderRadius: 10,
                      background: `${pColor}18`, border: `1px solid ${pColor}35`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                    }}>
                      {pIcon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pColor }}>{pAbbr}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: sMeta.color,
                          background: `${sMeta.dot}18`, border: `1px solid ${sMeta.dot}40`,
                          borderRadius: 4, padding: "1px 6px", textTransform: "uppercase" as const, letterSpacing: "0.5px",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: sMeta.dot, display: "inline-block" }} />
                          {sMeta.label}
                        </span>
                        <span style={{ fontSize: 10, color: B.dim }}>· {post.topic} · {post.queuedAt}</span>
                        {draftsSaved.has(post.id) && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: B.emerald, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 5, padding: "2px 6px" }}>
                            📨 Draft in Publishing Center
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11.5, color: B.silver, lineHeight: 1.55,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                      }}>
                        {post.caption}
                      </div>
                      <div style={{ fontSize: 10, color: B.dim, marginTop: 5 }}>📣 CTA: {post.cta}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => copyText(post.caption, `queue-${post.id}`)}
                        style={{
                          background: copiedKey === `queue-${post.id}` ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                          border: `1px solid ${copiedKey === `queue-${post.id}` ? "rgba(16,185,129,0.35)" : B.border}`,
                          borderRadius: 7, padding: "5px 12px", fontSize: 10, fontWeight: 700,
                          color: copiedKey === `queue-${post.id}` ? B.emerald : B.silver,
                          cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const,
                        }}
                      >
                        {copiedKey === `queue-${post.id}` ? "✓ Copied" : "📋 Copy"}
                      </button>
                      <button
                        onClick={() => removeFromQueue(post.id)}
                        style={{
                          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
                          borderRadius: 7, padding: "5px 12px", fontSize: 10, fontWeight: 700,
                          color: "#F87171", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: 16,
              background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 11, color: B.silver, lineHeight: 1.6,
            }}>
              💡 Posts are held here for your review. Use the Publishing Center to send them live, or copy each caption to post manually.
              Nothing is published automatically.
            </div>
          </div>
        )}

        {/* ── Activity Log ── */}
        {activityLog.length > 0 && (
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.blue, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>
              🕐 Activity Log
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activityLog.slice(0, 12).map(entry => {
                const prov   = SOCIAL_PROVIDERS.find(p => p.id === entry.platform);
                const pColor = prov?.color ?? "#64748B";
                const pIcon  = prov?.icon ?? "?";
                const pAbbr  = prov?.abbreviation ?? entry.platform;
                const sMeta  = STATUS_META[entry.status];
                return (
                  <div key={entry.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "8px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid rgba(255,255,255,0.04)`,
                  }}>
                    <span style={{ fontSize: 10, color: B.dim, flexShrink: 0, width: 76, fontFamily: "monospace" }}>
                      {entry.ts}
                    </span>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{pIcon}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: pColor, flexShrink: 0, minWidth: 64 }}>
                      {pAbbr}
                    </span>
                    <span style={{ fontSize: 11, color: B.silver, flex: 1 }}>{entry.action}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: sMeta.color,
                      background: `${sMeta.dot}15`, border: `1px solid ${sMeta.dot}35`,
                      borderRadius: 4, padding: "2px 8px", flexShrink: 0,
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sMeta.dot, display: "inline-block" }} />
                      {sMeta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Platform posting tips — sourced from CONTENT_PROFILES registry ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {QUEUEABLE_PROVIDERS.map(p => {
            const prof = CONTENT_PROFILES[p.id];
            const tips = [prof.note, prof.ctaTip, `${prof.frequency} recommended`, `${prof.hashtagCount} hashtags`];
            const isSelected = selectedPlatforms.has(p.id);
            const uiState = resolvePlatformUIState(p, connectedProviders.has(p.id));
            return (
              <div key={p.id} style={{
                background: isSelected ? `${p.color}08` : B.panel,
                border: `1.5px solid ${isSelected ? `${p.color}40` : `${p.color}20`}`,
                borderRadius: 14, padding: "16px 18px",
                opacity: isSelected ? 1 : 0.6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                  <span style={{ fontSize: 12 }}>{p.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: p.color, letterSpacing: "1.5px", textTransform: "uppercase" as const }}>
                    {p.shortLabel}
                  </span>
                  <PlatformStateChip state={uiState} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 9, background: `${p.color}12`, color: p.color, borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>{MEDIA_ICON[prof.mediaType]} {prof.mediaType}</span>
                  <span style={{ fontSize: 9, background: `${p.color}12`, color: p.color, borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>{prof.maxLength}</span>
                  <span style={{ fontSize: 9, background: `${p.color}12`, color: p.color, borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>{prof.bestFormat}</span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {tips.map((tip, i) => (
                    <li key={i} style={{ fontSize: 10, color: B.dim, display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span style={{ color: p.color, flexShrink: 0, fontSize: 8 }}>●</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
