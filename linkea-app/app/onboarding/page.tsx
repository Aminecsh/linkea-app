"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Camera, ArrowRight } from "lucide-react";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF" } as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${C.hairline}`,
  background: C.surface,
  fontSize: 14,
  color: C.ink,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "1.2px",
  color: C.muted,
  marginBottom: 8,
};

export default function Onboarding() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nom: "",
    ecole: "",
    description_idee: "",
    besoin_tech: "",
    budget: "",
    linkedin: "",
    competences: "",
    dispo_heures_semaine: "",
    github: "",
  });

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data?.role) {
        setError("Rôle introuvable. Réessaie de t'inscrire.");
        setLoading(false);
        return;
      }

      setRole(data.role);
      setLoading(false);
    }
    loadRole();
  }, [router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar(userId: string): Promise<string | null> {
    if (!avatarFile) return null;
    const ext = avatarFile.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const avatarUrl = await uploadAvatar(user.id);

    if (role === "founder") {
      const { error: dbError } = await supabase.from("profiles_founder").upsert({
        user_id: user.id,
        email: user.email,
        nom: form.nom,
        ecole: form.ecole,
        description_idee: form.description_idee,
        besoin_tech: form.besoin_tech,
        budget: form.budget,
        linkedin: form.linkedin,
        avatar_url: avatarUrl,
      }, { onConflict: "user_id" });
      if (dbError) { setError(dbError.message); setSaving(false); return; }
      router.push("/profil");
    } else if (role === "developer") {
      const competencesArray = form.competences.split(",").map((c) => c.trim()).filter(Boolean);
      const { error: dbError } = await supabase.from("profiles_developer").upsert({
        user_id: user.id,
        email: user.email,
        nom: form.nom,
        ecole: form.ecole,
        competences: competencesArray,
        dispo_heures_semaine: parseInt(form.dispo_heures_semaine) || null,
        github: form.github,
        linkedin: form.linkedin,
        avatar_url: avatarUrl,
      }, { onConflict: "user_id" });
      if (dbError) { setError(dbError.message); setSaving(false); return; }
      router.push("/projets");
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${C.hairline}`, borderTopColor: C.ink, animation: "lk-spin 0.8s linear infinite" }} />
        <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const initiale = form.nom?.[0]?.toUpperCase();

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "64px 20px" }}>
      <style>{`
        @keyframes lk-spin { to { transform: rotate(360deg); } }
        .lk-input:focus { outline: 2px solid ${C.rose}; outline-offset: 1px; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* En-tête */}
        <div style={{ marginBottom: 32 }}>
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, border: `1px solid ${C.hairline}`, background: C.surface, borderRadius: 7, padding: "4px 10px", marginBottom: 16 }}>
            {role === "founder" ? "Founder" : "Développeur"}
          </span>
          <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 30, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1.15 }}>
            Complète ton profil
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
            Ces infos nous aident à trouver le meilleur match pour toi.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Avatar upload */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Aperçu"
                  style={{ width: 80, height: 80, borderRadius: 20, objectFit: "cover", border: `1px solid ${C.hairline}`, display: "block" }}
                />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: 20, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {initiale
                    ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 30, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{initiale}</span>
                    : <Camera size={24} strokeWidth={1.5} style={{ color: "rgba(255,255,255,0.75)" }} />
                  }
                </div>
              )}
              <span style={{ position: "absolute", bottom: -4, right: -4, width: 24, height: 24, background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1 }}>
                +
              </span>
            </button>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
              {avatarPreview ? "Photo sélectionnée" : "Ajouter une photo de profil"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
          </div>

          <div>
            <label style={labelStyle}>Nom complet</label>
            <input name="nom" value={form.nom} onChange={handleChange} placeholder="Jean Dupont" required className="lk-input" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>École</label>
            <input name="ecole" value={form.ecole} onChange={handleChange} placeholder="HEC, Epitech, 42..." className="lk-input" style={inputStyle} />
          </div>

          {role === "founder" && (
            <>
              <div>
                <label style={labelStyle}>Décris ton idée</label>
                <textarea
                  name="description_idee"
                  value={form.description_idee}
                  onChange={handleChange}
                  placeholder="Une plateforme qui permet de..."
                  rows={3}
                  className="lk-input"
                  style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Besoin technique</label>
                <input name="besoin_tech" value={form.besoin_tech} onChange={handleChange} placeholder="App mobile, web app, API..." className="lk-input" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Budget</label>
                <select name="budget" value={form.budget} onChange={handleChange} className="lk-input" style={{ ...inputStyle, appearance: "none" }}>
                  <option value="">Sélectionne un budget</option>
                  <option value="0-500€">0 – 500€</option>
                  <option value="500-1500€">500 – 1500€</option>
                  <option value="1500-3000€">1500 – 3000€</option>
                  <option value="3000€+">3000€ +</option>
                </select>
              </div>
            </>
          )}

          {role === "developer" && (
            <>
              <div>
                <label style={labelStyle}>Compétences <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(séparées par des virgules)</span></label>
                <input name="competences" value={form.competences} onChange={handleChange} placeholder="React, Node.js, Flutter..." className="lk-input" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Disponibilité (heures/semaine)</label>
                <input name="dispo_heures_semaine" type="number" value={form.dispo_heures_semaine} onChange={handleChange} placeholder="10" min={1} max={40} className="lk-input" style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }} />
              </div>
              <div>
                <label style={labelStyle}>GitHub</label>
                <input name="github" value={form.github} onChange={handleChange} placeholder="https://github.com/..." className="lk-input" style={inputStyle} />
              </div>
            </>
          )}

          <div>
            <label style={labelStyle}>LinkedIn</label>
            <input name="linkedin" value={form.linkedin} onChange={handleChange} placeholder="https://linkedin.com/in/..." className="lk-input" style={inputStyle} />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: C.rose, background: C.surface, border: `1px solid ${C.rose}`, padding: "12px 16px", borderRadius: 12, margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="lk-input"
            style={{ width: "100%", padding: "14px 0", borderRadius: 12, background: C.rose, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6, opacity: saving ? 0.6 : 1 }}
          >
            {saving
              ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
              : <>Accéder à mon espace <ArrowRight size={15} strokeWidth={2} /></>
            }
          </button>
        </form>
      </div>
    </div>
  );
}
