"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
      title: "Tu as reçu un avis ⭐",
      body: `${ratingLabel} (${rating}/5) sur le projet "${projetTitre}"`,
      link: "/profil",
    });

    router.push("/profil");
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
    </div>
  );

  if (notAllowed) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm w-full text-center">
        <p className="text-2xl mb-3">🔒</p>
        <p className="font-bold text-slate-900 mb-1">Accès non autorisé</p>
        <p className="text-slate-400 text-sm mb-6">Ce projet n'est pas encore terminé ou tu n'y es pas associé.</p>
        <button onClick={() => router.push("/profil")} className="btn-pink w-full">Retour au profil</button>
      </div>
    </div>
  );

  if (alreadyReviewed) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm w-full text-center">
        <p className="text-3xl mb-3">✅</p>
        <p className="font-bold text-slate-900 mb-1">Avis déjà soumis</p>
        <p className="text-slate-400 text-sm mb-6">Tu as déjà laissé un avis pour ce projet.</p>
        <button onClick={() => router.push("/profil")} className="btn-pink w-full">Retour au profil</button>
      </div>
    </div>
  );

  const isFounder = role === "founder";
  const targetLabel = isFounder ? "le développeur" : "le founder";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm w-full">

        <button onClick={() => router.push("/profil")} className="text-slate-400 hover:text-slate-600 text-sm font-medium mb-6 block">
          ← Retour
        </button>

        {/* En-tête */}
        <div className="mb-6">
          <span className="text-xs font-bold uppercase tracking-widest text-pink-500">Avis post-projet</span>
          <h1 className="text-xl font-black text-slate-900 mt-1">Note {targetLabel}</h1>
          <p className="text-sm text-slate-400 mt-1">Projet : <span className="font-semibold text-slate-600">{projetTitre}</span></p>
        </div>

        {/* Carte de l'autre partie */}
        {other && (
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 mb-6">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black shrink-0 ${
              isFounder ? "bg-gradient-to-br from-blue-400 to-indigo-500" : "bg-gradient-to-br from-pink-400 to-purple-500"
            }`}>
              {other.nom?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">{other.nom}</p>
              {other.ecole && <p className="text-xs text-slate-400">{other.ecole}</p>}
              <p className="text-xs font-semibold text-slate-400 mt-0.5">{isFounder ? "Développeur" : "Founder"}</p>
            </div>
          </div>
        )}

        {/* Étoiles */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Note</p>
          <div className="flex gap-2 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="text-3xl transition-transform hover:scale-110">
                <span className={star <= (hovered || rating) ? "text-amber-400" : "text-slate-200"}>★</span>
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <p className="text-sm font-semibold text-slate-600">{LABELS[hovered || rating]}</p>
          )}
        </div>

        {/* Commentaire */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Commentaire <span className="font-normal normal-case">(optionnel)</span></p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={isFounder ? "Décris ton expérience avec ce dev..." : "Décris ton expérience avec ce founder..."}
            rows={3} className="input-field text-sm resize-none w-full" />
        </div>

        <button onClick={handleSubmit} disabled={rating === 0 || submitting} className="btn-pink w-full py-3">
          {submitting ? "Envoi..." : "Envoyer l'avis"}
        </button>
      </div>
    </div>
  );
}
