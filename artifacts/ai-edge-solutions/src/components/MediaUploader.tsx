import { useRef, useState, useCallback } from "react";
import { useAuth } from "@clerk/react";
import {
  validateMediaFile,
  buildAcceptAttr,
  resolvePreviewUrl,
  formatBytes,
  formatMaxSize,
  type MediaKind,
} from "@/lib/media-config";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface MediaAttachment {
  objectPath:  string;
  kind:        MediaKind;
  mimeType:    string;
  filename:    string;
  byteSize:    number;
}

export interface MediaUploaderProps {
  value:    MediaAttachment | null;
  onChange: (v: MediaAttachment | null) => void;
  accept?:  MediaKind[];          // defaults to all three kinds
  disabled?: boolean;
  style?:   React.CSSProperties;
}

const KIND_ICON: Record<MediaKind, string> = {
  image: "🖼",
  video: "▶",
  audio: "🎵",
};

export function MediaUploader({
  value,
  onChange,
  accept = ["image", "video", "audio"],
  disabled = false,
  style,
}: MediaUploaderProps) {
  const { getToken } = useAuth();
  const fileRef      = useRef<HTMLInputElement>(null);

  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState(0);   // 0–100
  const [error,      setError]      = useState<string | null>(null);

  const acceptAttr = buildAcceptAttr(accept);

  const previewUrl = value
    ? resolvePreviewUrl(value.objectPath, BASE)
    : null;

  const upload = useCallback(async (file: File) => {
    setError(null);

    const validation = validateMediaFile(file.type, file.name, file.size);
    if (!validation.ok) {
      setError(validation.error!);
      return;
    }
    if (!accept.includes(validation.kind!)) {
      setError(`${validation.kind} files are not accepted here.`);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const token = await getToken().catch(() => null);

      // Step 1: request signed PUT URL
      const metaRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const metaData = await metaRes.json() as any;
      if (!metaRes.ok) throw new Error(metaData.error ?? "Failed to get upload URL");

      const { uploadURL, objectPath } = metaData as { uploadURL: string; objectPath: string };

      // Step 2: PUT to object storage with XHR (for progress)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      onChange({
        objectPath,
        kind:     validation.kind!,
        mimeType: file.type,
        filename: file.name,
        byteSize: file.size,
      });
    } catch (e: any) {
      setError(e.message ?? "Upload failed. Try again.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [accept, getToken, onChange]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && !disabled) upload(file);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  const remove = () => {
    onChange(null);
    setError(null);
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const dropZone: React.CSSProperties = {
    border: "2px dashed rgba(0,174,239,0.25)", borderRadius: 12,
    padding: "36px 20px", textAlign: "center", cursor: disabled ? "not-allowed" : "pointer",
    background: "rgba(0,174,239,0.03)",
    transition: "border-color 0.15s",
    ...style,
  };
  const errorBox: React.CSSProperties = {
    marginBottom: 10, padding: "8px 12px", borderRadius: 8,
    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
    color: "#EF4444", fontSize: 12,
  };
  const btn: React.CSSProperties = {
    marginTop: 8, width: "100%", padding: "7px",
    borderRadius: 8, background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8",
    fontSize: 12, cursor: "pointer",
  };
  const progressBar: React.CSSProperties = {
    height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)",
    marginTop: 8, overflow: "hidden",
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {error && <div style={errorBox}>⚠ {error}</div>}

      {uploading && (
        <div style={{ border: "2px dashed rgba(0,174,239,0.3)", borderRadius: 12, padding: "32px 20px", textAlign: "center", background: "rgba(0,174,239,0.04)" }}>
          <div style={{ fontSize: 12, color: "#00AEEF", fontWeight: 600, marginBottom: 8 }}>
            ⏳ Uploading… {progress}%
          </div>
          <div style={progressBar}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#00AEEF", transition: "width 0.2s" }} />
          </div>
        </div>
      )}

      {!uploading && value && (
        <div style={{ position: "relative" }}>
          {value.kind === "image" && previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 260, display: "block" }}
            />
          )}
          {value.kind === "video" && previewUrl && (
            <video
              src={previewUrl}
              controls
              preload="metadata"
              style={{ width: "100%", borderRadius: 10, maxHeight: 260, display: "block", background: "#000" }}
            />
          )}
          {value.kind === "audio" && previewUrl && (
            <div style={{ padding: "16px", background: "rgba(0,174,239,0.06)", borderRadius: 10, border: "1px solid rgba(0,174,239,0.15)" }}>
              <div style={{ fontSize: 28, marginBottom: 6, textAlign: "center" }}>🎵</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8, textAlign: "center", wordBreak: "break-all" }}>{value.filename}</div>
              <audio src={previewUrl} controls preload="metadata" style={{ width: "100%", display: "block" }} />
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6, textAlign: "center" }}>{formatBytes(value.byteSize)}</div>
            </div>
          )}

          <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
            {KIND_ICON[value.kind]} {value.filename} · {formatBytes(value.byteSize)}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => fileRef.current?.click()} style={btn} disabled={disabled}>Replace</button>
            <button onClick={remove} style={{ ...btn, color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }} disabled={disabled}>Remove</button>
          </div>
        </div>
      )}

      {!uploading && !value && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => !disabled && fileRef.current?.click()}
          style={dropZone}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>
            Drop file here or click to browse
          </div>
          <div style={{ fontSize: 11, color: "#475569" }}>
            {accept.includes("image") && "JPG, PNG, WEBP, GIF"}
            {accept.includes("image") && accept.includes("video") && " · "}
            {accept.includes("video") && "MP4 (max " + formatMaxSize("video/mp4") + ")"}
            {(accept.includes("image") || accept.includes("video")) && accept.includes("audio") && " · "}
            {accept.includes("audio") && "MP3 (max " + formatMaxSize("audio/mpeg") + ")"}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={acceptAttr}
        style={{ display: "none" }}
        onChange={handleInput}
        disabled={disabled}
      />
    </div>
  );
}
