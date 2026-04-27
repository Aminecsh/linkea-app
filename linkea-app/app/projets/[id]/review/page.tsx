"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type DevInfo = {
  nom: string;
  ecole?: string;
  user_id: string;
};

export default function ReviewPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [dev, setDev] = useState<DevInfo | null>(null);
  const [projetTitre, setProjetTitre] = useState("");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "founder") { router.push("/profil"); return; }

      const { data: proj } = await supabase
        .from("projects").select("titre").eq("id", id).maybeSingle();
      if (!proj) { router.push("/profil"); return; }
      setProjetTitre(proj.titre);

      // Vérifie si review déjà soumise
      const { data: existing } = await supabase
        .from("reviews").select("id").eq("project_id", id).eq("reviewer_id", user.id).maybeSingle();
      if (existing) { setAlreadyReviewed(true); setLoading(false); return; }

      // Trouve le dev accepté
      const { data: cand } = await supabase
        .from("candidatures")
        .select("profiles_developer(nom, ecole, user_id)")
        .eq("project_id", id)
        .eq("statut", "accepted")
        .maybeSingle();

      if (cand?.profiles_developer) {
        setDev(cand.profiles_developer as unknown as DevInfo);
      }

      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSubmit() {
    if (rating === 0 || !dev || !userId) return;
    setSubmitting(true);

    await supabase.from("reviews").insert({
      project_id: id,
      reviewer_id: userId,
      reviewed_id: dev.user_id,
      rating,
      comment: comment.trim() || null,
    });

    await supabase.from("notifications").insert({
      user_id: dev.user_id,
      type: "nouvelle_review",
      title: "Tu as reçu un avis ⭐",
      body: `${["", "Décevant", "Passable", "Bien", "Très bien", "Excellent !"][rating]} — ${rating}/5 sur "${projetTitre}"`,
      link: "/profil",
    });

    router.push("/profil");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (alreadyReviewed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm w-full text-center">
          <p className="text-2xl mb-3">✓</p>
          <p className="font-bold text-slate-900 mb-1">Avis déjà soumis</p>
          <p className="text-slate-400 text-sm mb-6">Tu as déjà noté ce projet.</p>
          <button onClick={() => router.push("/profil")} className="btn-pink w-full">
            Retour au profil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm w-full">

        <button onClick={() => router.push("/profil")} className="text-slate-400 hover:text-slate-600 text-sm font-medium mb-6 block">
          ← Retour
        </button>

        <p className="text-xs font-bold uppercase tracking-widest text-pink-500 mb-2">Review</p>
        <h1 className="text-xl font-black text-slate-900 mb-1">Note le dev</h1>
        <p className="text-sm text-slate-400 mb-6">Projet : <span className="font-semibold text-slate-600">{projetTitre}</span></p>

        {dev && (
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-black shrink-0">
              {dev.nom?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">{dev.nom}</p>
              {dev.ecole && <p className="text-xs text-slate-400">{dev.ecole}</p>}
            </div>
          </div>
        )}

        {/* Étoiles */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Note</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="text-3xl transition-transform hover:scale-110"
              >
                <span className={star <= (hovered || rating) ? "text-amber-400" : "text-slate-200"}>★</span>
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-slate-400 mt-2">
              {["", "Décevant", "Passable", "Bien", "Très bien", "Excellent !"][rating]}
            </p>
          )}
        </div>

        {/* Commentaire */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Commentaire (optionnel)</p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Décris ton expérience avec ce dev..."
            rows={3}
            className="input-field text-sm resize-none w-full"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="btn-pink w-full py-3"
        >
          {submitting ? "Envoi..." : "Envoyer l'avis"}
        </button>
      </div>
    </div>
  );
}
