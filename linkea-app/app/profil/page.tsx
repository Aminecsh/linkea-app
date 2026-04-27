"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
};

type Candidature = {
  id: string;
  statut: string;
  projects: {
    titre: string;
    description: string;
    stack_souhaitee: string;
    deadline: string;
  };
};

const statutProjet: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente",  color: "bg-amber-50 text-amber-600 border border-amber-200" },
  matched:  { label: "Matchée",     color: "bg-blue-50 text-blue-600 border border-blue-200" },
  en_cours: { label: "En cours",    color: "bg-green-50 text-green-600 border border-green-200" },
  livre:    { label: "Livré",       color: "bg-slate-100 text-slate-500 border border-slate-200" },
};

const statutCand: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente",  color: "bg-amber-50 text-amber-600 border border-amber-200" },
  accepted: { label: "Accepté ✓",  color: "bg-green-50 text-green-600 border border-green-200" },
  refused:  { label: "Refusé",     color: "bg-red-50 text-red-400 border border-red-200" },
};

export default function ProfilPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [ecole, setEcole] = useState("");
  const [competences, setCompetences] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const r = roleData?.role ?? null;
      setRole(r);

      if (r === "founder") {
        const { data: profile } = await supabase
          .from("profiles_founder")
          .select("id, nom, ecole, avatar_url")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!profile) { router.push("/onboarding"); return; }
        setNom(profile.nom ?? "");
        setEcole(profile.ecole ?? "");
        setAvatarUrl(profile.avatar_url ?? null);
        setProfileId(profile.id);

        const { data: projs } = await supabase
          .from("projects")
          .select("*")
          .eq("founder_id", profile.id)
          .order("created_at", { ascending: false });

        setProjects(projs ?? []);
      }

      if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer")
          .select("id, nom, ecole, competences, avatar_url")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!profile) { router.push("/onboarding"); return; }
        setNom(profile.nom ?? "");
        setEcole(profile.ecole ?? "");
        setCompetences(profile.competences ?? []);
        setAvatarUrl(profile.avatar_url ?? null);
        setProfileId(profile.id);

        const { data: cands } = await supabase
          .from("candidatures")
          .select("id, statut, projects(titre, description, stack_souhaitee, deadline)")
          .eq("developer_id", profile.id)
          .order("created_at", { ascending: false });

        setCandidatures((cands as Candidature[]) ?? []);

        // Score moyen du dev
        const { data: reviews } = await supabase
          .from("reviews")
          .select("rating")
          .eq("reviewed_id", user.id);
        if (reviews && reviews.length > 0) {
          const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
          setScore(Math.round(avg * 10) / 10);
          setReviewCount(reviews.length);
        }
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId || !profileId || !role) return;
    setUploadingAvatar(true);

    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl;

    const table = role === "founder" ? "profiles_founder" : "profiles_developer";
    await supabase.from(table).update({ avatar_url: url }).eq("id", profileId);
    setAvatarUrl(url);
    setUploadingAvatar(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  async function handleDeleteProject(projectId: string) {
    if (!confirm("Supprimer ce projet ? Cette action est irréversible.")) return;
    await supabase.from("projects").delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  async function handleLivrer(projectId: string) {
    await supabase.from("projects").update({ statut: "livre" }).eq("id", projectId);
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, statut: "livre" } : p));
    router.push(`/projets/${projectId}/review`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header profil */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="relative group">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={nom} className="w-14 h-14 rounded-full object-cover border-2 border-slate-200" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xl font-black">
                    {nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold"
                >
                  {uploadingAvatar ? "..." : "Changer"}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">{nom}</h1>
                <p className="text-sm text-slate-400">{ecole}</p>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full mt-1 inline-block ${
                  role === "founder"
                    ? "bg-pink-50 text-pink-600"
                    : "bg-blue-50 text-blue-600"
                }`}>
                  {role === "founder" ? "Founder" : "Développeur"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button onClick={handleLogout} className="btn-ghost text-sm px-4 py-2">
                Déconnexion
              </button>
            </div>
          </div>

          {role === "developer" && competences.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {competences.map((c) => (
                <span key={c} className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full">
                  {c}
                </span>
              ))}
            </div>
          )}

          {role === "developer" && score !== null && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map((star) => (
                  <span key={star} className={`text-lg ${star <= Math.round(score) ? "text-amber-400" : "text-slate-200"}`}>★</span>
                ))}
              </div>
              <span className="font-bold text-slate-900 text-sm">{score}/5</span>
              <span className="text-xs text-slate-400">({reviewCount} avis)</span>
            </div>
          )}
        </div>

        {/* Founder : ses projets */}
        {role === "founder" && (
          <>
            <button
              onClick={() => router.push("/projets/nouveau")}
              className="btn-pink w-full mb-6"
            >
              + Déposer un nouveau projet
            </button>

            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
              Mes projets ({projects.length})
            </h2>

            {projects.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-sm">Aucun projet déposé pour l'instant.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {projects.map((p) => {
                  const s = statutProjet[p.statut] ?? { label: p.statut, color: "bg-slate-100 text-slate-500" };
                  return (
                    <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-bold text-slate-900 text-base">{p.titre}</h3>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 ${s.color}`}>
                          {s.label}
                        </span>
                      </div>
                      {p.description && (
                        <p className="text-slate-500 text-sm line-clamp-2 mb-3">{p.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex gap-3 text-xs text-slate-400">
                          {p.stack_souhaitee && <span>🛠 {p.stack_souhaitee}</span>}
                          {p.deadline && <span>📅 {p.deadline}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleDeleteProject(p.id)}
                            className="text-xs font-semibold text-red-400 hover:text-red-600 transition-colors"
                          >
                            Supprimer
                          </button>
                          {(p.statut === "matched" || p.statut === "en_cours") && (
                            <button
                              onClick={() => handleLivrer(p.id)}
                              className="text-xs font-semibold text-green-600 hover:text-green-800 transition-colors"
                            >
                              ✓ Livrer
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/projets/${p.id}/candidats`)}
                            className="text-xs font-semibold text-pink-500 hover:text-pink-700 transition-colors"
                          >
                            Voir les candidats →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Developer : ses candidatures */}
        {role === "developer" && (
          <>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
              Mes candidatures ({candidatures.length})
            </h2>

            {candidatures.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-sm">Tu n'as pas encore candidaté.</p>
                <p className="text-slate-400 text-sm mt-1">Explore les projets depuis l'onglet Projets.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {candidatures.map((c) => {
                  const s = statutCand[c.statut] ?? { label: c.statut, color: "bg-slate-100 text-slate-500" };
                  return (
                    <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-bold text-slate-900 text-base">{c.projects.titre}</h3>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 ${s.color}`}>
                          {s.label}
                        </span>
                      </div>
                      {c.projects.description && (
                        <p className="text-slate-500 text-sm line-clamp-2 mb-3">{c.projects.description}</p>
                      )}
                      <div className="flex gap-3 text-xs text-slate-400">
                        {c.projects.stack_souhaitee && <span>🛠 {c.projects.stack_souhaitee}</span>}
                        {c.projects.deadline && <span>📅 {c.projects.deadline}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>
      <BottomNav />
    </div>
  );
}
