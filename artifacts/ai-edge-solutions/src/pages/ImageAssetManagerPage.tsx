import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type ImageAsset = {
  id: string;
  fileUrl: string;
  fileName: string;
  topicTags: string[];
  cityTags: string[];
  category: string;
  uploadDate: string;
};

type AssetsResponse   = { assets: ImageAsset[] };
type StatsResponse    = {
  total: number; tagged: number; untagged: number; coverageScore: number;
  topicCounts: Record<string, number>; suggestions: string[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const TOPIC_OPTIONS = [
  "Bed Bugs","Roaches","Ants","Fleas","Ticks","Rats","Mice","Wasps","Spiders","Mosquitoes","Moles",
];

const CITY_OPTIONS = [
  "Foley","Gulf Shores","Orange Beach","Fairhope","Daphne","Spanish Fort",
];

const CATEGORY_OPTIONS = [
  { value: "",            label: "Uncategorized" },
  { value: "infestation", label: "Infestation" },
  { value: "prevention",  label: "Prevention" },
  { value: "treatment",   label: "Treatment" },
  { value: "warning",     label: "Warning" },
  { value: "educational", label: "Educational" },
  { value: "branding",    label: "Branding" },
  { value: "seasonal",    label: "Seasonal" },
];

const CAT_COLOR: Record<string, string> = {
  infestation: "#EF4444", prevention: "#10B981", treatment: "#6B9EFF",
  warning: "#F59E0B", educational: "#00AEEF", branding: "#C0C0C0",
  seasonal: "#A78BFA",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function imgUrl(fileUrl: string) {
  return `${BASE}/api/storage${fileUrl}`;
}

// ── Upload Modal ───────────────────────────────────────────────────────────────

type UploadState = {
  file: File | null;
  topicTags: string[];
  cityTags: string[];
  category: string;
  uploading: boolean;
  progress: string;
};

function defaultUpload(): UploadState {
  return { file: null, topicTags: [], cityTags: [], category: "", uploading: false, progress: "" };
}

function toggleArr(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

// ── Edit Tags Modal ────────────────────────────────────────────────────────────

type EditState = {
  topicTags: string[];
  cityTags: string[];
  category: string;
};

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ImageAssetManagerPage() {
  const apiFetch = useApiFetch();
  const qc = useQueryClient();

  // Filters
  const [filterTopic,    setFilterTopic]    = useState("");
  const [filterCity,     setFilterCity]     = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [searchText,     setSearchText]     = useState("");

  // Upload
  const [showUpload, setShowUpload] = useState(false);
  const [upload,     setUpload]     = useState<UploadState>(defaultUpload);

  // Edit tags
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ topicTags: [], cityTags: [], category: "" });

  // ── Queries ────────────────────────────────────────────────────────────────

  const assetsQuery = useQuery<AssetsResponse>({
    queryKey: ["image-assets"],
    queryFn: () => apiFetch("/image-assets"),
    staleTime: 30_000,
  });

  const statsQuery = useQuery<StatsResponse>({
    queryKey: ["image-assets-stats"],
    queryFn: () => apiFetch("/image-assets/stats"),
    staleTime: 30_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const patchMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EditState> }) =>
      apiFetch(`/image-assets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-assets"] });
      qc.invalidateQueries({ queryKey: ["image-assets-stats"] });
      setEditingId(null);
      toast.success("Tags updated");
    },
    onError: () => toast.error("Failed to update tags"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/image-assets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-assets"] });
      qc.invalidateQueries({ queryKey: ["image-assets-stats"] });
      toast.success("Image deleted");
    },
    onError: () => toast.error("Failed to delete image"),
  });

  // ── Upload flow ────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!upload.file) { toast.error("Select a file first"); return; }
    setUpload(u => ({ ...u, uploading: true, progress: "Requesting upload URL…" }));
    try {
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        {
          method: "POST",
          body: JSON.stringify({
            name: upload.file.name,
            size: upload.file.size,
            contentType: upload.file.type,
          }),
        },
      );

      setUpload(u => ({ ...u, progress: "Uploading to storage…" }));
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: upload.file,
        headers: { "Content-Type": upload.file.type },
      });
      if (!putRes.ok) throw new Error("GCS upload failed");

      setUpload(u => ({ ...u, progress: "Saving record…" }));
      await apiFetch("/image-assets", {
        method: "POST",
        body: JSON.stringify({
          fileUrl:   objectPath,
          fileName:  upload.file!.name,
          topicTags: upload.topicTags,
          cityTags:  upload.cityTags,
          category:  upload.category,
        }),
      });

      qc.invalidateQueries({ queryKey: ["image-assets"] });
      qc.invalidateQueries({ queryKey: ["image-assets-stats"] });
      toast.success("Image uploaded successfully");
      setShowUpload(false);
      setUpload(defaultUpload());
    } catch (err) {
      console.error(err);
      toast.error("Upload failed — please try again");
      setUpload(u => ({ ...u, uploading: false, progress: "" }));
    }
  }

  // ── Filtered assets ────────────────────────────────────────────────────────

  const allAssets = assetsQuery.data?.assets ?? [];
  const filtered  = allAssets.filter(a => {
    if (filterTopic    && !a.topicTags.includes(filterTopic))    return false;
    if (filterCity     && !a.cityTags.includes(filterCity))      return false;
    if (filterCategory && a.category !== filterCategory)         return false;
    if (searchText     && !a.fileName.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const stats = statsQuery.data;

  // ── Styles ─────────────────────────────────────────────────────────────────

  const SECTION: React.CSSProperties = {
    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16, padding: "24px 28px", marginBottom: 24,
  };
  const CARD: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, overflow: "hidden",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#475569",
    textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 8, display: "block",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#E2E8F0", fontSize: 13, outline: "none",
  };
  const pillBase: React.CSSProperties = {
    display: "inline-block", padding: "3px 10px", borderRadius: 20,
    fontSize: 10.5, fontWeight: 700, marginRight: 4, marginBottom: 4,
  };

  return (
    <AppShell>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", marginBottom: 4 }}>🖼 Image Asset Manager</div>
        <div style={{ fontSize: 14, color: "#64748B" }}>
          Centralized image library for Publishing Center + Auto Content Engine
        </div>
      </div>

      {/* ── Stats Bar ── */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Assets",    value: stats.total,         color: "#00AEEF",  icon: "🖼" },
            { label: "Tagged Assets",   value: stats.tagged,        color: "#10B981",  icon: "🏷" },
            { label: "Untagged Assets", value: stats.untagged,      color: stats.untagged > 0 ? "#F59E0B" : "#10B981", icon: "⚠" },
            { label: "Coverage Score",  value: `${stats.coverageScore}%`, color: stats.coverageScore >= 80 ? "#10B981" : stats.coverageScore >= 50 ? "#F59E0B" : "#EF4444", icon: "📊" },
          ].map(c => (
            <div key={c.label} style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>{c.icon} {c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Coverage Suggestions ── */}
      {stats && stats.suggestions.length > 0 && (
        <div style={{ ...SECTION, borderColor: "rgba(0,174,239,0.15)", marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span>🧠</span> AI Coverage Suggestions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {stats.suggestions.map((s, i) => (
              <div key={i} style={{
                fontSize: 12.5, color: "#CBD5E1", lineHeight: 1.5,
                background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.12)",
                borderRadius: 8, padding: "8px 12px",
              }}>
                <span style={{ color: "#00AEEF", fontWeight: 800, marginRight: 6 }}>→</span>{s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ ...SECTION, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          {/* Search */}
          <div style={{ flex: "1 1 180px" }}>
            <label style={labelStyle}>Search</label>
            <input
              type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="Search filename…" style={inputStyle}
            />
          </div>
          {/* Filter topic */}
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>Topic</label>
            <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">All Topics</option>
              {TOPIC_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Filter city */}
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>City</label>
            <select value={filterCity} onChange={e => setFilterCity(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">All Cities</option>
              {CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Filter category */}
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">All Categories</option>
              {CATEGORY_OPTIONS.filter(c => c.value).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {/* Clear + Upload */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            {(filterTopic || filterCity || filterCategory || searchText) && (
              <button onClick={() => { setFilterTopic(""); setFilterCity(""); setFilterCategory(""); setSearchText(""); }}
                style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>
                Clear
              </button>
            )}
            <button onClick={() => setShowUpload(true)}
              style={{
                padding: "8px 18px", borderRadius: 8,
                background: "linear-gradient(135deg, #00AEEF, #0070B8)",
                border: "none", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              }}>
              + Upload Image
            </button>
          </div>
        </div>
      </div>

      {/* ── Image Grid ── */}
      <div>
        {assetsQuery.isLoading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#475569", fontSize: 14 }}>Loading images…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🖼</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
              {allAssets.length === 0 ? "No images uploaded yet" : "No images match your filters"}
            </div>
            <div style={{ fontSize: 13, color: "#334155" }}>
              {allAssets.length === 0 ? 'Click "Upload Image" to add your first asset' : "Try clearing the filters"}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 14, fontWeight: 600 }}>
              {filtered.length} image{filtered.length !== 1 ? "s" : ""}
              {filtered.length !== allAssets.length && ` of ${allAssets.length}`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {filtered.map(asset => {
                const isEditing = editingId === asset.id;
                const catColor  = CAT_COLOR[asset.category] ?? "#64748B";
                return (
                  <div key={asset.id} style={CARD}>
                    {/* Thumbnail */}
                    <div style={{ width: "100%", height: 160, background: "rgba(0,0,0,0.4)", overflow: "hidden", position: "relative" }}>
                      <img
                        src={imgUrl(asset.fileUrl)}
                        alt={asset.fileName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                      {/* Category badge overlay */}
                      {asset.category && (
                        <span style={{
                          position: "absolute", top: 8, right: 8,
                          fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20,
                          background: `${catColor}22`, color: catColor, border: `1px solid ${catColor}44`,
                          backdropFilter: "blur(4px)",
                        }}>
                          {asset.category}
                        </span>
                      )}
                    </div>

                    {/* Card body */}
                    <div style={{ padding: "12px 14px" }}>
                      {/* Filename */}
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E2E8F0", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {asset.fileName}
                      </div>

                      {/* Tags */}
                      <div style={{ marginBottom: 10 }}>
                        {asset.topicTags.map(t => (
                          <span key={t} style={{ ...pillBase, background: "rgba(0,174,239,0.12)", color: "#00AEEF", border: "1px solid rgba(0,174,239,0.2)" }}>{t}</span>
                        ))}
                        {asset.cityTags.map(c => (
                          <span key={c} style={{ ...pillBase, background: "rgba(107,158,255,0.12)", color: "#6B9EFF", border: "1px solid rgba(107,158,255,0.2)" }}>{c}</span>
                        ))}
                        {asset.topicTags.length === 0 && asset.cityTags.length === 0 && (
                          <span style={{ ...pillBase, background: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}>Untagged</span>
                        )}
                      </div>

                      {/* Actions */}
                      {!isEditing ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => {
                              setEditingId(asset.id);
                              setEditState({ topicTags: [...asset.topicTags], cityTags: [...asset.cityTags], category: asset.category });
                            }}
                            style={{ flex: 1, padding: "6px 0", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.25)", color: "#00AEEF" }}>
                            🏷 Edit Tags
                          </button>
                          <button
                            onClick={() => { if (confirm("Delete this image?")) deleteMut.mutate(asset.id); }}
                            disabled={deleteMut.isPending}
                            style={{ padding: "6px 10px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444" }}>
                            🗑
                          </button>
                        </div>
                      ) : (
                        /* Inline tag editor */
                        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12, border: "1px solid rgba(0,174,239,0.2)" }}>
                          {/* Topics */}
                          <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Topics</label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {TOPIC_OPTIONS.map(t => {
                                const active = editState.topicTags.includes(t);
                                return (
                                  <button key={t} onClick={() => setEditState(s => ({ ...s, topicTags: toggleArr(s.topicTags, t) }))}
                                    style={{ ...pillBase, cursor: "pointer", border: `1px solid ${active ? "rgba(0,174,239,0.4)" : "rgba(255,255,255,0.1)"}`, background: active ? "rgba(0,174,239,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#00AEEF" : "#64748B", margin: 0 }}>
                                    {t}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Cities */}
                          <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Cities</label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {CITY_OPTIONS.map(c => {
                                const active = editState.cityTags.includes(c);
                                return (
                                  <button key={c} onClick={() => setEditState(s => ({ ...s, cityTags: toggleArr(s.cityTags, c) }))}
                                    style={{ ...pillBase, cursor: "pointer", border: `1px solid ${active ? "rgba(107,158,255,0.4)" : "rgba(255,255,255,0.1)"}`, background: active ? "rgba(107,158,255,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#6B9EFF" : "#64748B", margin: 0 }}>
                                    {c}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Category */}
                          <div style={{ marginBottom: 12 }}>
                            <label style={labelStyle}>Category</label>
                            <select value={editState.category} onChange={e => setEditState(s => ({ ...s, category: e.target.value }))}
                              style={{ ...inputStyle, fontSize: 12 }}>
                              {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                          {/* Save/Cancel */}
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => patchMut.mutate({ id: asset.id, data: editState })}
                              disabled={patchMut.isPending}
                              style={{ flex: 1, padding: "6px 0", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}>
                              {patchMut.isPending ? "Saving…" : "✓ Save"}
                            </button>
                            <button onClick={() => setEditingId(null)}
                              style={{ padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#64748B" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Upload Modal ── */}
      {showUpload && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: "#0B1629", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 18, padding: 32, width: "100%", maxWidth: 560,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF" }}>📤 Upload Image</div>
              <button onClick={() => { setShowUpload(false); setUpload(defaultUpload()); }}
                disabled={upload.uploading}
                style={{ background: "none", border: "none", color: "#475569", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* File picker */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Image File</label>
              <div style={{
                border: "2px dashed rgba(0,174,239,0.3)", borderRadius: 10, padding: "24px 16px",
                textAlign: "center", cursor: "pointer", position: "relative",
                background: "rgba(0,174,239,0.03)",
              }}
                onClick={() => document.getElementById("img-file-input")?.click()}
              >
                {upload.file ? (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{upload.file.name}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{(upload.file.size / 1024).toFixed(0)} KB · {upload.file.type}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 6 }}>🖼</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8" }}>Click to select image</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>PNG, JPG, WebP supported</div>
                  </div>
                )}
                <input id="img-file-input" type="file" accept="image/*"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setUpload(u => ({ ...u, file: f }));
                  }}
                />
              </div>
            </div>

            {/* Topics */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Topic Tags</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TOPIC_OPTIONS.map(t => {
                  const active = upload.topicTags.includes(t);
                  return (
                    <button key={t}
                      onClick={() => setUpload(u => ({ ...u, topicTags: toggleArr(u.topicTags, t) }))}
                      style={{ ...pillBase, cursor: "pointer", border: `1px solid ${active ? "rgba(0,174,239,0.4)" : "rgba(255,255,255,0.1)"}`, background: active ? "rgba(0,174,239,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#00AEEF" : "#64748B", margin: 0 }}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cities */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>City Tags</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CITY_OPTIONS.map(c => {
                  const active = upload.cityTags.includes(c);
                  return (
                    <button key={c}
                      onClick={() => setUpload(u => ({ ...u, cityTags: toggleArr(u.cityTags, c) }))}
                      style={{ ...pillBase, cursor: "pointer", border: `1px solid ${active ? "rgba(107,158,255,0.4)" : "rgba(255,255,255,0.1)"}`, background: active ? "rgba(107,158,255,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#6B9EFF" : "#64748B", margin: 0 }}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Category</label>
              <select value={upload.category} onChange={e => setUpload(u => ({ ...u, category: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}>
                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Progress / Upload button */}
            {upload.progress && (
              <div style={{ fontSize: 12, color: "#00AEEF", marginBottom: 12, textAlign: "center" }}>
                ⏳ {upload.progress}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!upload.file || upload.uploading}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                background: (!upload.file || upload.uploading) ? "rgba(0,174,239,0.15)" : "linear-gradient(135deg, #00AEEF, #0070B8)",
                border: "1px solid rgba(0,174,239,0.3)", color: "#fff",
                fontSize: 14, fontWeight: 800, cursor: (!upload.file || upload.uploading) ? "not-allowed" : "pointer",
              }}>
              {upload.uploading ? "Uploading…" : "Upload Image"}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
