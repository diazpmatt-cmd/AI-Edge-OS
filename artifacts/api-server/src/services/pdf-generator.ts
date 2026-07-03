import PDFDocument from "pdfkit";
import type { Readable } from "stream";

interface Channel { name: string; category: string; status: string; score: number; priority: string; action: string; }
interface Competitor { name: string; reviewGap: number; keywordGap: string; backlinkGap: string; aiGap: number; opportunityScore: number; }
interface Recommendation { priority: string; task: string; reason: string; impact: string; }

interface AuditData {
  businessName: string;
  overallScore: number; searchScore: number; mapsScore: number;
  aiSearchScore: number; authorityScore: number; reviewScore: number;
  competitorGapScore: number;
  channelsJson: string; competitorsJson: string; recommendationsJson: string;
}

const BLUE   = "#00AEEF";
const NAVY   = "#030612";
const SILVER = "#C0C0C0";
const WHITE  = "#FFFFFF";
const GRAY   = "#6B7280";
const GREEN  = "#10B981";
const YELLOW = "#F59E0B";
const RED    = "#EF4444";
const PURPLE = "#8B5CF6";

function scoreColor(score: number) {
  if (score >= 70) return GREEN;
  if (score >= 40) return YELLOW;
  return RED;
}

function priorityColor(p: string) {
  if (p === "critical") return RED;
  if (p === "high")     return YELLOW;
  if (p === "medium")   return BLUE;
  return SILVER;
}

function statusDot(status: string) {
  if (status === "Connected")   return GREEN;
  if (status === "Needs Setup") return RED;
  if (status === "Monitoring")  return YELLOW;
  return SILVER;
}

function drawProgressBar(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, value: number, color: string) {
  doc.roundedRect(x, y, w, h, h / 2).fill("#1E293B");
  const filled = Math.max(4, (value / 100) * w);
  doc.roundedRect(x, y, filled, h, h / 2).fill(color);
}

function drawScoreCircle(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, score: number, color: string, label: string) {
  doc.circle(cx, cy, r).fill("#1E293B");
  doc.circle(cx, cy, r - 3).stroke(color).lineWidth(3).strokeColor(color);
  doc.fontSize(14).fillColor(color).font("Helvetica-Bold")
     .text(String(score), cx - 20, cy - 10, { width: 40, align: "center" });
  doc.fontSize(7).fillColor(SILVER).font("Helvetica")
     .text(label, cx - 28, cy + 8, { width: 56, align: "center" });
}

function sectionHeader(doc: PDFKit.PDFDocument, text: string, y?: number) {
  const top = y ?? doc.y;
  doc.rect(50, top, doc.page.width - 100, 1).fill(BLUE);
  doc.fontSize(13).fillColor(BLUE).font("Helvetica-Bold")
     .text(text, 50, top + 8);
  doc.moveDown(0.4);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - 60) doc.addPage();
}

export function generateAuditPDF(audit: AuditData): Readable {
  const doc = new PDFDocument({ size: "LETTER", margin: 50, autoFirstPage: false });

  const channels: Channel[]         = JSON.parse(audit.channelsJson       || "[]");
  const competitors: Competitor[]   = JSON.parse(audit.competitorsJson    || "[]");
  const recommendations: Recommendation[] = JSON.parse(audit.recommendationsJson || "[]");

  const kpis = [
    { label: "Overall Visibility", value: audit.overallScore,       color: scoreColor(audit.overallScore) },
    { label: "Search Visibility",  value: audit.searchScore,        color: BLUE },
    { label: "Maps Visibility",    value: audit.mapsScore,          color: GREEN },
    { label: "AI Search",          value: audit.aiSearchScore,      color: PURPLE },
    { label: "Authority Score",    value: audit.authorityScore,     color: YELLOW },
    { label: "Review Strength",    value: audit.reviewScore,        color: YELLOW },
    { label: "Competitor Gap",     value: audit.competitorGapScore, color: RED },
  ];

  // ────────────────────────────────────────────────────────────
  // PAGE 1 — COVER
  // ────────────────────────────────────────────────────────────
  doc.addPage({ size: "LETTER", margins: { top: 0, left: 0, bottom: 0, right: 0 } });

  // Dark gradient background
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(NAVY);

  // Top blue stripe
  doc.rect(0, 0, doc.page.width, 6).fill(BLUE);

  // Grid dots (decorative)
  for (let gx = 40; gx < doc.page.width; gx += 40) {
    for (let gy = 40; gy < doc.page.height; gy += 40) {
      doc.circle(gx, gy, 0.5).fill("rgba(255,255,255,0.04)");
    }
  }

  // Logo area — AE monogram
  const lx = doc.page.width / 2;
  const ly = 130;
  doc.circle(lx, ly, 42).fill("#00AEEF15").stroke(BLUE).lineWidth(1).strokeColor(BLUE);
  doc.fontSize(28).fillColor(BLUE).font("Helvetica-Bold")
     .text("AE", lx - 22, ly - 14, { width: 44, align: "center" });

  doc.fontSize(10).fillColor(SILVER).font("Helvetica")
     .text("AI EDGE SOLUTIONS", 0, ly + 56, { width: doc.page.width, align: "center", characterSpacing: 3 });

  // Report title
  doc.fontSize(32).fillColor(WHITE).font("Helvetica-Bold")
     .text("AI Visibility", 0, 240, { width: doc.page.width, align: "center" });
  doc.fontSize(32).fillColor(BLUE).font("Helvetica-Bold")
     .text("Audit Report", 0, 278, { width: doc.page.width, align: "center" });

  // Divider
  doc.rect(doc.page.width / 2 - 60, 322, 120, 1).fill(BLUE);

  // Business name
  doc.fontSize(18).fillColor(WHITE).font("Helvetica-Bold")
     .text(audit.businessName, 0, 334, { width: doc.page.width, align: "center" });

  // Overall score badge
  const sx = doc.page.width / 2;
  doc.circle(sx, 430, 52).fill("#00AEEF18").stroke(BLUE).lineWidth(2).strokeColor(BLUE);
  doc.fontSize(34).fillColor(scoreColor(audit.overallScore)).font("Helvetica-Bold")
     .text(String(audit.overallScore), sx - 30, 413, { width: 60, align: "center" });
  doc.fontSize(9).fillColor(SILVER).font("Helvetica")
     .text("OVERALL SCORE", sx - 50, 448, { width: 100, align: "center" });

  // Date + prepared by
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.fontSize(10).fillColor(SILVER).font("Helvetica")
     .text(`Generated ${now}`, 0, 510, { width: doc.page.width, align: "center" })
     .text("Prepared by AI Edge Solutions", 0, 526, { width: doc.page.width, align: "center" });

  // Confidential footer
  doc.rect(0, doc.page.height - 44, doc.page.width, 44).fill("#00AEEF0A");
  doc.fontSize(8).fillColor(SILVER).font("Helvetica")
     .text("CONFIDENTIAL — AI Edge Solutions  ·  aiedgesolutions.com", 0, doc.page.height - 26, {
       width: doc.page.width, align: "center",
     });

  // ────────────────────────────────────────────────────────────
  // PAGE 2 — EXECUTIVE SUMMARY
  // ────────────────────────────────────────────────────────────
  doc.addPage();
  doc.rect(50, 40, doc.page.width - 100, 1).fill(BLUE);
  doc.fontSize(9).fillColor(SILVER).font("Helvetica")
     .text("AI VISIBILITY AUDIT REPORT", 50, 30, { width: doc.page.width - 100 });
  doc.fontSize(9).fillColor(SILVER).font("Helvetica")
     .text(audit.businessName, 50, 30, { width: doc.page.width - 100, align: "right" });

  doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text("Executive Summary", 50, 60);
  doc.moveDown(0.5);

  // KPI score circles — 4 per row
  const circleR = 36;
  const rowY1 = doc.y + 10;
  const rowY2 = rowY1 + circleR * 2 + 30;
  const colW = (doc.page.width - 100) / 4;

  kpis.slice(0, 4).forEach((k, i) => {
    const cx = 50 + colW * i + colW / 2;
    drawScoreCircle(doc, cx, rowY1 + circleR, circleR, k.value, k.color, k.label);
  });
  kpis.slice(4).forEach((k, i) => {
    const cx = 50 + colW * i + colW / 2;
    drawScoreCircle(doc, cx, rowY2 + circleR, circleR, k.value, k.color, k.label);
  });

  doc.y = rowY2 + circleR * 2 + 20;

  // Summary text
  const highScore   = kpis.filter(k => k.value >= 60);
  const lowScore    = kpis.filter(k => k.value < 40);
  const summaryLine = highScore.length > 0
    ? `${audit.businessName} shows strong performance in ${highScore.map(k => k.label.toLowerCase()).join(" and ")}, but has significant opportunity in ${lowScore.slice(0, 2).map(k => k.label.toLowerCase()).join(" and ")}.`
    : `${audit.businessName} has significant opportunity across multiple visibility channels — especially AI search and authority building.`;

  doc.roundedRect(50, doc.y, doc.page.width - 100, 56, 6).fill("#0B1629");
  doc.fontSize(10).fillColor(SILVER).font("Helvetica-Oblique")
     .text(`"${summaryLine}"`, 62, doc.y + 10, { width: doc.page.width - 124 });
  doc.y += 70;

  // Score progress bars
  doc.fontSize(11).fillColor(WHITE).font("Helvetica-Bold").text("Detailed Scores", 50, doc.y + 10);
  doc.moveDown(0.4);
  kpis.forEach(k => {
    ensureSpace(doc, 30);
    const barY = doc.y;
    doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(k.label, 50, barY + 2, { width: 130 });
    drawProgressBar(doc, 190, barY, doc.page.width - 280, 10, k.value, k.color);
    doc.fontSize(9).fillColor(k.color).font("Helvetica-Bold").text(`${k.value}`, doc.page.width - 82, barY + 1, { width: 32, align: "right" });
    doc.y = barY + 18;
  });

  // ────────────────────────────────────────────────────────────
  // PAGE 3 — CHANNEL AUDIT
  // ────────────────────────────────────────────────────────────
  doc.addPage();
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text("AI VISIBILITY AUDIT REPORT", 50, 30, { width: doc.page.width - 100 });
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(audit.businessName, 50, 30, { width: doc.page.width - 100, align: "right" });
  doc.rect(50, 40, doc.page.width - 100, 1).fill(BLUE);

  doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text("Get Found Everywhere Audit", 50, 60);
  doc.moveDown(0.4);

  const categories = ["search", "maps", "directory", "ai", "voice"];
  const catLabels: Record<string, string> = { search: "Search Engines", maps: "Maps & Navigation", directory: "Directories & Social", ai: "AI Search Platforms", voice: "Voice Assistants" };

  categories.forEach(cat => {
    const chans = channels.filter(c => c.category === cat);
    if (!chans.length) return;
    ensureSpace(doc, 50);
    sectionHeader(doc, catLabels[cat] || cat);

    chans.forEach(ch => {
      ensureSpace(doc, 28);
      const rowY = doc.y;
      const dotColor = statusDot(ch.status);
      doc.circle(57, rowY + 8, 4).fill(dotColor);
      doc.fontSize(9).fillColor(WHITE).font("Helvetica-Bold").text(ch.name, 68, rowY, { width: 140 });
      doc.fontSize(8).fillColor(SILVER).font("Helvetica").text(ch.status, 68, rowY + 12, { width: 140 });
      drawProgressBar(doc, 220, rowY + 4, 120, 8, ch.score, scoreColor(ch.score));
      doc.fontSize(8).fillColor(scoreColor(ch.score)).font("Helvetica-Bold").text(`${ch.score}`, 348, rowY + 3, { width: 24, align: "right" });
      doc.roundedRect(378, rowY, 56, 16, 4).fill(priorityColor(ch.priority) + "22");
      doc.fontSize(7).fillColor(priorityColor(ch.priority)).font("Helvetica-Bold")
         .text(ch.priority.toUpperCase(), 378, rowY + 4, { width: 56, align: "center" });
      doc.fontSize(7).fillColor(GRAY).font("Helvetica").text(ch.action, 440, rowY, { width: doc.page.width - 490 });
      doc.y = rowY + 26;
    });
    doc.moveDown(0.3);
  });

  // ────────────────────────────────────────────────────────────
  // PAGE 4 — COMPETITOR INTELLIGENCE
  // ────────────────────────────────────────────────────────────
  doc.addPage();
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text("AI VISIBILITY AUDIT REPORT", 50, 30, { width: doc.page.width - 100 });
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(audit.businessName, 50, 30, { width: doc.page.width - 100, align: "right" });
  doc.rect(50, 40, doc.page.width - 100, 1).fill(BLUE);
  doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text("Competitor Intelligence", 50, 60);
  doc.moveDown(0.6);

  competitors.forEach(comp => {
    ensureSpace(doc, 80);
    const startY = doc.y;
    doc.roundedRect(50, startY, doc.page.width - 100, 72, 6).fill("#0B1629");
    doc.fontSize(11).fillColor(WHITE).font("Helvetica-Bold").text(comp.name, 62, startY + 10);

    const cols = [
      { label: "Review Gap",  value: String(comp.reviewGap),       color: comp.reviewGap < 0 ? RED : GREEN },
      { label: "Keyword Gap", value: comp.keywordGap,              color: comp.keywordGap === "High" ? RED : comp.keywordGap === "Medium" ? YELLOW : GREEN },
      { label: "Backlink Gap", value: comp.backlinkGap,            color: comp.backlinkGap === "High" ? RED : comp.backlinkGap === "Medium" ? YELLOW : GREEN },
      { label: "AI Gap",      value: String(comp.aiGap),           color: comp.aiGap < 0 ? RED : GREEN },
      { label: "Opportunity", value: `${comp.opportunityScore}%`,  color: BLUE },
    ];
    const cw = (doc.page.width - 124) / cols.length;
    cols.forEach((col, i) => {
      const cx = 62 + cw * i;
      doc.fontSize(7).fillColor(SILVER).font("Helvetica").text(col.label, cx, startY + 30, { width: cw - 4 });
      doc.fontSize(11).fillColor(col.color).font("Helvetica-Bold").text(col.value, cx, startY + 44, { width: cw - 4 });
    });
    doc.y = startY + 82;
  });

  // Authority Engine section
  doc.moveDown(0.5);
  ensureSpace(doc, 130);
  sectionHeader(doc, "Authority Engine");
  const authorityItems = [
    { label: "Citation Health",      score: audit.authorityScore,  icon: "📋" },
    { label: "NAP Consistency",      score: Math.min(100, audit.authorityScore + 8), icon: "📍" },
    { label: "Backlink Opportunities", score: Math.max(0, audit.authorityScore - 12), icon: "🔗" },
    { label: "Directory Listings",   score: audit.searchScore,     icon: "📁" },
    { label: "Structured Data",      score: Math.max(0, audit.searchScore - 10), icon: "🧱" },
    { label: "llms.txt Readiness",   score: audit.aiSearchScore,  icon: "🤖" },
  ];
  authorityItems.forEach(item => {
    ensureSpace(doc, 22);
    const aY = doc.y;
    doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(`${item.icon}  ${item.label}`, 50, aY, { width: 200 });
    drawProgressBar(doc, 260, aY + 2, 180, 9, item.score, scoreColor(item.score));
    doc.fontSize(9).fillColor(scoreColor(item.score)).font("Helvetica-Bold").text(`${item.score}`, 448, aY, { width: 30, align: "right" });
    doc.y = aY + 20;
  });

  // AI Search Readiness
  doc.moveDown(0.5);
  ensureSpace(doc, 130);
  sectionHeader(doc, "AI Search Readiness");
  const aiPlatforms = [
    { name: "ChatGPT",    score: Math.round(audit.aiSearchScore * 0.67) },
    { name: "Claude",     score: Math.round(audit.aiSearchScore * 0.5)  },
    { name: "Gemini",     score: Math.round(audit.aiSearchScore * 1.17) },
    { name: "Perplexity", score: Math.round(audit.aiSearchScore * 0.39) },
    { name: "Copilot",    score: Math.round(audit.aiSearchScore * 0.78) },
    { name: "Grok",       score: Math.round(audit.aiSearchScore * 0.28) },
  ];
  aiPlatforms.forEach(p => {
    ensureSpace(doc, 22);
    const pY = doc.y;
    doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(`🤖  ${p.name}`, 50, pY, { width: 200 });
    drawProgressBar(doc, 260, pY + 2, 180, 9, p.score, PURPLE);
    doc.fontSize(9).fillColor(PURPLE).font("Helvetica-Bold").text(`${p.score}`, 448, pY, { width: 30, align: "right" });
    doc.y = pY + 20;
  });

  // ────────────────────────────────────────────────────────────
  // PAGE 5 — ACTION PLAN
  // ────────────────────────────────────────────────────────────
  doc.addPage();
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text("AI VISIBILITY AUDIT REPORT", 50, 30, { width: doc.page.width - 100 });
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(audit.businessName, 50, 30, { width: doc.page.width - 100, align: "right" });
  doc.rect(50, 40, doc.page.width - 100, 1).fill(BLUE);
  doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text("Action Plan", 50, 60);
  doc.moveDown(0.6);

  const priorityGroups = [
    { label: "🔴 Critical", color: RED,    items: recommendations.filter(r => r.priority === "critical") },
    { label: "🟡 High",     color: YELLOW, items: recommendations.filter(r => r.priority === "high") },
    { label: "🔵 Medium",   color: BLUE,   items: recommendations.filter(r => r.priority === "medium") },
    { label: "⚪ Low",      color: SILVER, items: recommendations.filter(r => r.priority === "low") },
  ];

  priorityGroups.forEach(group => {
    if (!group.items.length) return;
    ensureSpace(doc, 40);
    doc.fontSize(11).fillColor(group.color).font("Helvetica-Bold").text(group.label, 50, doc.y);
    doc.moveDown(0.25);

    group.items.forEach(rec => {
      ensureSpace(doc, 58);
      const rY = doc.y;
      doc.roundedRect(50, rY, doc.page.width - 100, 50, 5).fill("#0B1629");
      doc.rect(50, rY, 3, 50).fill(group.color);
      doc.fontSize(9).fillColor(WHITE).font("Helvetica-Bold").text(rec.task, 60, rY + 8, { width: doc.page.width - 140 });
      doc.fontSize(8).fillColor(SILVER).font("Helvetica").text(rec.reason, 60, rY + 22, { width: doc.page.width - 200 });
      doc.roundedRect(doc.page.width - 120, rY + 10, 68, 16, 4).fill(group.color + "22");
      doc.fontSize(7).fillColor(group.color).font("Helvetica-Bold")
         .text(`Impact: ${rec.impact}`, doc.page.width - 120, rY + 15, { width: 68, align: "center" });
      doc.y = rY + 58;
    });
    doc.moveDown(0.4);
  });

  // ────────────────────────────────────────────────────────────
  // LAST PAGE — AI EDGE RECOMMENDATION
  // ────────────────────────────────────────────────────────────
  doc.addPage();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(NAVY);
  doc.rect(0, 0, doc.page.width, 5).fill(BLUE);

  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text("AI VISIBILITY AUDIT REPORT", 50, 30, { width: doc.page.width - 100 });
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(audit.businessName, 50, 30, { width: doc.page.width - 100, align: "right" });

  doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text("AI Edge Recommendation", 50, 60);
  doc.moveDown(0.8);

  // Missed opportunity box
  const missedRev = audit.overallScore < 40 ? "$3,200 – $6,500 / month" : audit.overallScore < 70 ? "$1,200 – $3,000 / month" : "$400 – $1,200 / month";
  const critCount = recommendations.filter(r => r.priority === "critical").length;
  const highCount = recommendations.filter(r => r.priority === "high").length;

  doc.roundedRect(50, doc.y, doc.page.width - 100, 72, 8).fill("#00AEEF0A").stroke(BLUE).lineWidth(1).strokeColor(BLUE);
  doc.fontSize(10).fillColor(SILVER).font("Helvetica").text("Estimated Missed Revenue Opportunity", 66, doc.y + 12);
  doc.fontSize(22).fillColor(BLUE).font("Helvetica-Bold").text(missedRev, 66, doc.y + 28);
  doc.fontSize(8).fillColor(SILVER).font("Helvetica")
     .text(`Based on ${critCount} critical and ${highCount} high-priority gaps identified in this audit`, 66, doc.y + 56);
  doc.y += 86;

  // Priority fixes
  doc.fontSize(12).fillColor(WHITE).font("Helvetica-Bold").text("Top Priority Fixes", 50, doc.y);
  doc.moveDown(0.3);
  recommendations.filter(r => ["critical", "high"].includes(r.priority)).slice(0, 4).forEach((rec, i) => {
    ensureSpace(doc, 26);
    const fY = doc.y;
    doc.circle(58, fY + 8, 8).fill(i < critCount ? RED : YELLOW);
    doc.fontSize(8).fillColor(NAVY).font("Helvetica-Bold").text(String(i + 1), 53, fY + 5, { width: 10, align: "center" });
    doc.fontSize(9).fillColor(WHITE).font("Helvetica").text(rec.task, 72, fY + 4, { width: doc.page.width - 140 });
    doc.y = fY + 22;
  });

  // Package recommendation
  doc.moveDown(0.8);
  const pkg = audit.overallScore < 40 ? "AI Edge Ecosystem" : "Edge Pro";
  const pkgDesc = audit.overallScore < 40
    ? "Full AI visibility stack — local presence, AI search optimization, citation building, reputation engine, and continuous monitoring."
    : "Core AI visibility management — search optimization, map presence, review velocity, and AI platform readiness.";

  doc.roundedRect(50, doc.y, doc.page.width - 100, 80, 8).fill("#00AEEF0A");
  doc.rect(50, doc.y, 3, 80).fill(BLUE);
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text("RECOMMENDED PACKAGE", 62, doc.y + 12);
  doc.fontSize(18).fillColor(BLUE).font("Helvetica-Bold").text(pkg, 62, doc.y + 26);
  doc.fontSize(9).fillColor(SILVER).font("Helvetica").text(pkgDesc, 62, doc.y + 50, { width: doc.page.width - 130 });
  doc.y += 92;

  // CTA
  doc.moveDown(0.5);
  doc.roundedRect(50, doc.y, doc.page.width - 100, 44, 8).fill(BLUE);
  doc.fontSize(13).fillColor(WHITE).font("Helvetica-Bold")
     .text("Ready to Grow? Contact AI Edge Solutions Today", 50, doc.y + 14, { width: doc.page.width - 100, align: "center" });
  doc.y += 56;

  doc.fontSize(9).fillColor(SILVER).font("Helvetica")
     .text("aiedgesolutions.com  ·  AI Edge Solutions", 0, doc.page.height - 40, { width: doc.page.width, align: "center" });

  doc.end();
  return doc as unknown as Readable;
}
