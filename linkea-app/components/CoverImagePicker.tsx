"use client";

// Photo de couverture d'un projet — utilisé par le dépôt (/projets/nouveau) et la
// modification (/projets/[id]/modifier). Valide, envoie dans le bucket public
// `project-covers` (voir sql/003_project_cover.sql) et remonte l'URL publique.

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { validateCoverImage } from "@/lib/fileUpload";
import { ImagePlus, RefreshCw, Trash2, AlertCircle } from "lucide-react";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7" } as const;

export default function CoverImagePicker({ value, onChange, folder }: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string; // préfixe du chemin dans le bucket (id du porteur ou du projet)
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const check = validateCoverImage(file);
    if (!check.ok) { setError(check.error); return; }
    setUploading(true);
    const path = `${folder}/${crypto.randomUUID()}.${check.ext}`;
    const { error: upErr } = await supabase.storage.from("project-covers").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setError("Envoi impossible. Réessaie dans un instant.");
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("project-covers").getPublicUrl(path);
    onChange(publicUrl);
    setUploading(false);
  }

  const openPicker = () => inputRef.current?.click();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />

      {value ? (
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${C.hairline}`, background: C.canvas, aspectRatio: "16 / 9" }}>
          <img src={value} alt="Photo de couverture du projet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", gap: 6 }}>
            <button type="button" onClick={openPicker} disabled={uploading}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, border: "none", background: "rgba(255,255,255,0.94)", color: C.ink, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
              <RefreshCw size={12} strokeWidth={2} style={{ animation: uploading ? "lk-cover-spin 0.8s linear infinite" : "none" }} /> Changer
            </button>
            <button type="button" onClick={() => onChange(null)} disabled={uploading} aria-label="Retirer la photo"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.94)", color: C.rose, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={uploading}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
          className="lk-cover-drop"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 124, padding: "20px 16px", borderRadius: 14, border: `1.5px dashed ${C.hairline}`, background: "#fff", cursor: uploading ? "wait" : "pointer", color: C.ink, textAlign: "center" }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 12, background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {uploading
              ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #E5E5EA", borderTopColor: C.ink, animation: "lk-cover-spin 0.8s linear infinite" }} />
              : <ImagePlus size={18} strokeWidth={1.8} style={{ color: C.ink }} />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{uploading ? "Envoi en cours…" : "Ajouter une photo de couverture"}</span>
          <span style={{ fontSize: 11.5, color: C.muted }}>Optionnel · JPG, PNG ou WebP · 8 Mo max · elle illustre ton projet dans le feed des devs</span>
        </button>
      )}

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.rose }}>
          <AlertCircle size={13} strokeWidth={2} /> {error}
        </div>
      )}
      <style>{`
        @keyframes lk-cover-spin { to { transform: rotate(360deg); } }
        .lk-cover-drop:hover:not(:disabled) { border-color: ${C.ink} !important; }
        .lk-cover-drop:focus-visible { outline: 2px solid ${C.rose}; outline-offset: 2px; }
      `}</style>
    </div>
  );
}
