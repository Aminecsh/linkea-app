"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Lock, Check } from "lucide-react";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF" } as const;

type OtherParty = { nom: string; ecole?: string; user_id: string; };

const LABELS = ["", "Décevant", "Passable", "Bien", "Très bien", "Excellent !"];

export default function ReviewPage() {
  const router = useRouter();
  const { id: projectId } = useParams<{ id: string }>();

  const [role, setRole]                 = useState<string | null>(null);
  const [userId, setUserId]             = useState<string | null>(null);
  const [projetTitre, setProjetTitre]   = useState("");
  const [other, setOther]               = useState<OtherParty | null>(null);
  const [rating, setRating]             = useState(0);
  const [hovered, setHovered]           = useState(0);
  const [comment, setComment]           = useState("");
  const [loading, setLoading]           = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [notAllowed, setNotAllowed]     = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      const { data: proj } = await supabase
        .from("projects")
        .select("titre, statut, founder_id")
        .eq("id", projectId)
        .maybeSingle();

      if (!proj) { router.push("/profil"); return; }
      setProjetTitre(proj.titre);

      // Vérifier que le projet est terminé/livré
      if (!["livre", "termine"].includes(proj.statut)) {
        setNotAllowed(true); setLoading(false); return;
      }

      // Vérifier si déjà reviewé
      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("project_id", projectId)
        .eq("reviewer_id", user.id)
        .maybeSingle();

      if (existing) { setAlreadyReviewed(true); setLoading(false); return; }

      if (r === "founder") {
        // Founder → évalue le dev
        const { data: cand } = await supabase
          .from("candidatures")
          .select("profiles_developer(nom, ecole, user_id)")
          .eq("project_id", projectId)
          .eq("statut", "accepted")
          .maybeSingle();

        if (cand?.profiles_developer) {
          setOther(cand.profiles_developer as unknown as OtherParty);
        }
      } else if (r === "developer") {
        // Dev → évalue le founder
        // Vérifier que ce dev est bien sur ce projet
        const { data: devProfile } = await supabase
          .from("profiles_developer")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        const { data: cand } = await supabase
          .from("candidatures")
          .select("id")
          .eq("project_id", projectId)
          .eq("developer_id", devProfile?.id)
          .eq("statut", "accepted")
          .maybeSingle();

        if (!cand) { setNotAllowed(true); setLoading(false); return; }

        // Trouver les infos du founder
        const { data: founderProfile } = await supabase
          .from("profiles_founder")
          .select("nom, ecole, user_id")
          .eq("id", proj.founder_id)
          .maybeSingle();

        if (founderProfile) setOther(founderProfile as OtherParty);
      } else {
        setNotAllowed(true);
      }

      setLoading(false);
    }
    load();
  }, [projectId, router]);

  async function handleSubmit() {
    if (rating === 0 || !other || !userId) return;
    setSubmitting(true);

    await supabase.from("reviews").insert({
      project_id: projectId,
      reviewer_id: userId,
      reviewed_id: other.user_id,
      rating,
      comment: comment.trim() || null,
    });

    const ratingLabel = LABELS[rating];
    await supabase.from("notifications").insert({
      user_id: other.user_id,
      type: "nouvelle_review",
      title: "Tu as reçu un avis",
      body: `${ratingLabel} (${rating}/5) sur le projet "${projetTitre}"`,
      link: "/profil",
    });

    router.push("/profil");
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${C.hairline}`, borderTopColor: C.ink, animation: "lk-spin 0.8s linear infinite" }} />
      <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (notAllowed) return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
      <div className="max-w-sm w-full text-center" style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 32 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${C.hairline}`, background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Lock size={20} strokeWidth={1.5} style={{ color: C.muted }} />
        </div>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>Accès non autorisé</p>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px" }}>Ce projet n&apos;est pas encore terminé ou tu n&apos;y es pas associé.</p>
        <button onClick={() => router.push("/profil")} style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: C.rose, color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Retour au profil</button>
      </div>
    </div>
  );

  if (alreadyReviewed) return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
      <div className="max-w-sm w-full text-center" style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 32 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, border: `1px solid ${C.hairline}`, background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Check size={20} strokeWidth={2} style={{ color: C.ink }} />
        </div>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>Avis déjà soumis</p>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px" }}>Tu as déjà laissé un avis pour ce projet.</p>
        <button onClick={() => router.push("/profil")} style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: C.rose, color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Retour au profil</button>
      </div>
    </div>
  );

  const isFounder = role === "founder";
  const targetLabel = isFounder ? "le développeur" : "le founder";

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
      <div className="max-w-sm w-full" style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 32 }}>

        <button onClick={() => router.push("/profil")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.muted, padding: 0, marginBottom: 24 }}>
          <ArrowLeft size={14} strokeWidth={2} /> Retour
        </button>

        {/* En-tête */}
        <div className="mb-6">
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted }}>Avis post-projet</span>
          <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 700, color: C.ink, margin: "6px 0 0" }}>Note {targetLabel}</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0" }}>Projet : <span style={{ fontWeight: 600, color: C.ink }}>{projetTitre}</span></p>
        </div>

        {/* Carte de l'autre partie */}
        {other && (
          <div className="flex items-center gap-3 mb-6" style={{ background: C.canvas, borderRadius: 12, border: `1px solid ${C.hairline}`, padding: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{other.nom?.[0]?.toUpperCase() ?? "?"}</span>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>{other.nom}</p>
              {other.ecole && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{other.ecole}</p>}
              <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, margin: "2px 0 0" }}>{isFounder ? "Développeur" : "Founder"}</p>
            </div>
          </div>
        )}

        {/* Étoiles */}
        <div className="mb-6">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: "0 0 12px" }}>Note</p>
          <div className="flex gap-2 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="transition-transform hover:scale-110"
                style={{ fontSize: 30, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>
                <span style={{ color: star <= (hovered || rating) ? C.ink : C.hairline }}>★</span>
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <p style={{ fontSize: 13, fontWeight: 600, color: C.muted, margin: 0 }}>{LABELS[hovered || rating]}</p>
          )}
        </div>

        {/* Commentaire */}
        <div className="mb-6">
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: "0 0 8px" }}>Commentaire <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optionnel)</span></p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={isFounder ? "Décris ton expérience avec ce dev..." : "Décris ton expérience avec ce founder..."}
            rows={3}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.surface, fontSize: 13, color: C.ink, outline: "none", resize: "none", lineHeight: 1.5 }} />
        </div>

        <button onClick={handleSubmit} disabled={rating === 0 || submitting}
          style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: C.rose, color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: (rating === 0 || submitting) ? 0.4 : 1 }}>
          {submitting ? "Envoi..." : "Envoyer l'avis"}
        </button>
      </div>
    </div>
  );
}
