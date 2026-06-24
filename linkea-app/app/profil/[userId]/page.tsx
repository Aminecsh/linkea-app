"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Experience = { id: string; titre: string; entreprise: string; date_debut: string; date_fin?: string; description?: string; };
type Formation  = { id: string; diplome: string; etablissement: string; annee?: string; description?: string; };

type DevProfile = {
  id: string; user_id: string; nom: string; ecole?: string; bio?: string;
  competences?: string[]; dispo_heures_semaine?: number;
  github?: string; linkedin?: string; avatar_url?: string;
  experiences?: Experience[]; formation?: Formation[];
};

type FounderProfile = {
  id: string; user_id: string; nom: string; ecole?: string; bio?: string; avatar_url?: string;
  experiences?: Experience[]; formation?: Formation[];
};

type Review = {
  id: string; rating: number; comment?: string | null;
  created_at: string; reviewer_id: string; project_id: string;
  project_titre?: string; reviewer_nom?: string; reviewer_role?: string;
};

type CompletedProject = {
  id: string; titre: string; statut: string;
  stack_souhaitee?: string; deadline?: string;
};

const RATING_LABEL = ["", "Décevant", "Passable", "Bien", "Très bien", "Excellent !"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <span key={s} className={`${size === "lg" ? "text-xl" : "text-sm"} ${s <= rating ? "text-amber-400" : "text-slate-200"}`}>★</span>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════════════════════════

export default function PublicProfilePage() {
  const router = useRouter();
  const { userId } = useParams<{ userId: string }>();

  const [targetRole, setTargetRole]         = useState<string | null>(null);
  const [devProfile, setDevProfile]         = useState<DevProfile | null>(null);
  const [founderProfile, setFounderProfile] = useState<FounderProfile | null>(null);
  const [reviews, setReviews]               = useState<Review[]>([]);
  const [projects, setProjects]             = useState<CompletedProject[]>([]);
  const [score, setScore]                   = useState<number | null>(null);
  const [loading, setLoading]               = useState(true);
  const [isMe, setIsMe]                     = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [convId, setConvId]                 = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      let currentUserId: string | null = null;

      if (user) {
        currentUserId = user.id;
        if (user.id === userId) setIsMe(true);
        const { data: myRole } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
        setCurrentUserRole(myRole?.role ?? null);
      }

      // Rôle de la cible
      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      if (!roleData) { router.push("/"); return; }
      setTargetRole(roleData.role);

      if (roleData.role === "developer") {
        const { data: prof } = await supabase
          .from("profiles_developer")
          .select("id, user_id, nom, ecole, bio, competences, dispo_heures_semaine, github, linkedin, avatar_url, experiences, formation")
          .eq("user_id", userId).maybeSingle();
        if (!prof) { router.push("/"); return; }
        setDevProfile(prof as DevProfile);

        // Projets réalisés
        const { data: cands } = await supabase
          .from("candidatures")
          .select("projects(id, titre, statut, stack_souhaitee, deadline)")
          .eq("developer_id", prof.id).eq("statut", "accepted");
        const done = (cands ?? [])
          .map((c) => c.projects as unknown as CompletedProject)
          .filter((p) => p && ["livre","termine","matched","en_cours"].includes(p.statut));
        setProjects(done);

        // Conversation en commun si current user est founder
        if (currentUserId) {
          const { data: myFounder } = await supabase
            .from("profiles_founder").select("id").eq("user_id", currentUserId).maybeSingle();
          if (myFounder) {
            const { data: conv } = await supabase
              .from("conversations")
              .select("id").eq("founder_id", myFounder.id).eq("developer_id", prof.id).maybeSingle();
            if (conv) setConvId(conv.id);
          }
        }

      } else if (roleData.role === "founder") {
        const { data: prof } = await supabase
          .from("profiles_founder")
          .select("id, user_id, nom, ecole, bio, avatar_url, experiences, formation")
          .eq("user_id", userId).maybeSingle();
        if (!prof) { router.push("/"); return; }
        setFounderProfile(prof as FounderProfile);

        const { data: projs } = await supabase
          .from("projects")
          .select("id, titre, statut, stack_souhaitee, deadline")
          .eq("founder_id", prof.id).order("created_at", { ascending: false });
        setProjects((projs as CompletedProject[]) ?? []);

        // Conversation en commun si current user est dev
        if (currentUserId) {
          const { data: myDev } = await supabase
            .from("profiles_developer").select("id").eq("user_id", currentUserId).maybeSingle();
          if (myDev) {
            const { data: conv } = await supabase
              .from("conversations")
              .select("id").eq("founder_id", prof.id).eq("developer_id", myDev.id).maybeSingle();
            if (conv) setConvId(conv.id);
          }
        }
      }

      // Reviews reçues
      const { data: rawReviews } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, reviewer_id, project_id")
        .eq("reviewed_id", userId).order("created_at", { ascending: false });

      if (rawReviews && rawReviews.length > 0) {
        const avg = rawReviews.reduce((s, r) => s + r.rating, 0) / rawReviews.length;
        setScore(Math.round(avg * 10) / 10);

        const reviewerIds = [...new Set(rawReviews.map((r) => r.reviewer_id))];
        const projectIds  = [...new Set(rawReviews.map((r) => r.project_id))];
        const [{ data: fProfiles }, { data: dProfiles }, { data: projs }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", reviewerIds),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", reviewerIds),
          supabase.from("projects").select("id, titre").in("id", projectIds),
        ]);
        const nameMap: Record<string, { nom: string; role: string }> = {};
        (fProfiles ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "founder" }; });
        (dProfiles ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "developer" }; });
        const projMap: Record<string, string> = {};
        (projs ?? []).forEach((p) => { projMap[p.id] = p.titre; });

        setReviews(rawReviews.map((r) => ({
          ...r,
          reviewer_nom:  nameMap[r.reviewer_id]?.nom ?? "Anonyme",
          reviewer_role: nameMap[r.reviewer_id]?.role,
          project_titre: projMap[r.project_id],
        })));
      }

      setLoading(false);
    }
    load();
  }, [userId, router]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
    </div>
  );

  const profile = devProfile ?? founderProfile;
  if (!profile) return null;

  const isFounder = targetRole === "founder";
  const activeProjects  = projects.filter((p) => ["pending","matched","en_cours"].includes(p.statut));
  const doneProjects    = projects.filter((p) => ["livre","termine"].includes(p.statut));

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">←</button>
          <span className="font-bold text-slate-900 flex-1 truncate">{profile.nom}</span>
          {isMe && (
            <button onClick={() => router.push("/profil")}
              className="text-xs font-semibold text-pink-500 border border-pink-200 px-3 py-1.5 rounded-full hover:bg-pink-50 transition-colors">
              Modifier
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">

        {/* ── Bannière + Avatar ────────────────────────────────────────── */}
        <div className="relative">
          <div className={`h-32 sm:h-44 ${isFounder
            ? "bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-500"
            : "bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-500"}`} />

          <div className="px-4 sm:px-6">
            <div className="flex items-end justify-between -mt-12 mb-4">
              {/* Avatar */}
              <div className="relative">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.nom}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
                ) : (
                  <div className={`w-24 h-24 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-white text-3xl font-black ${
                    isFounder ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"
                  }`}>
                    {profile.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>

              {/* CTA actions */}
              <div className="flex gap-2 pb-1">
                {!isMe && convId && (
                  <button onClick={() => router.push(`/messages/${convId}`)}
                    className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-full bg-white border-2 border-slate-200 text-slate-700 hover:border-pink-300 hover:text-pink-600 transition-all shadow-sm">
                    💬 Message
                  </button>
                )}
                {isMe && (
                  <button onClick={() => router.push("/profil")}
                    className="text-sm font-bold px-5 py-2.5 rounded-full bg-white border-2 border-slate-300 text-slate-700 hover:border-slate-400 transition-all shadow-sm">
                    Modifier le profil
                  </button>
                )}
              </div>
            </div>

            {/* Identité */}
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h1 className="text-2xl font-black text-slate-900 leading-tight">{profile.nom}</h1>
                {profile.ecole && <p className="text-slate-500 mt-0.5">{profile.ecole}</p>}
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full mt-2 inline-block ${
                  isFounder ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"
                }`}>{isFounder ? "Founder" : "Développeur"}</span>
              </div>

              {/* Score */}
              {score !== null && (
                <div className="text-right shrink-0">
                  <div className="text-3xl font-black text-slate-900">{score}<span className="text-lg text-slate-400">/5</span></div>
                  <StarRow rating={Math.round(score)} size="lg" />
                  <p className="text-xs text-slate-400 mt-1">{reviews.length} avis</p>
                </div>
              )}
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-slate-600 text-sm leading-relaxed mt-2 pb-4 border-b border-slate-100">{profile.bio}</p>
            )}

            {/* Dev infos inline */}
            {!isFounder && devProfile && (
              <div className="flex flex-wrap gap-3 mt-3 pb-4 border-b border-slate-100">
                {devProfile.dispo_heures_semaine && (
                  <span className="flex items-center gap-1.5 text-sm text-slate-600 font-semibold bg-slate-100 px-3 py-1.5 rounded-full">
                    ⏱ {devProfile.dispo_heures_semaine}h/sem
                  </span>
                )}
                {devProfile.github && (
                  <a href={devProfile.github} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors">
                    ⌥ GitHub ↗
                  </a>
                )}
                {devProfile.linkedin && (
                  <a href={devProfile.linkedin} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors">
                    in LinkedIn ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">

          {/* ── Stats rapides ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: projects.length, label: isFounder ? "Projets" : "Missions" },
              { val: doneProjects.length, label: "Livrés" },
              { val: reviews.length, label: "Avis" },
            ].map(({ val, label }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-black text-slate-900">{val}</p>
                <p className="text-xs text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Compétences dev ─────────────────────────────────────────── */}
          {!isFounder && devProfile?.competences && devProfile.competences.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Compétences</h2>
              <div className="flex flex-wrap gap-2">
                {devProfile.competences.map((c) => (
                  <span key={c} className="text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1.5 rounded-full">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Expériences ─────────────────────────────────────────────── */}
          {(profile.experiences ?? []).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Expériences</h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {(profile.experiences ?? []).map((exp) => (
                  <div key={exp.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${isFounder ? "bg-pink-50" : "bg-blue-50"}`}>💼</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900">{exp.titre}</p>
                      <p className="text-sm text-slate-600">{exp.entreprise}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}</p>
                      {exp.description && <p className="text-sm text-slate-500 mt-1 leading-relaxed">{exp.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Formation ───────────────────────────────────────────────── */}
          {(profile.formation ?? []).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Formation</h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {(profile.formation ?? []).map((f) => (
                  <div key={f.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 text-lg">🎓</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900">{f.diplome}</p>
                      <p className="text-sm text-slate-600">{f.etablissement}</p>
                      {f.annee && <p className="text-xs text-slate-400 mt-0.5">{f.annee}</p>}
                      {f.description && <p className="text-sm text-slate-500 mt-1">{f.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Projets actifs ──────────────────────────────────────────── */}
          {activeProjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">En cours</h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {activeProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${p.statut === "en_cours" ? "bg-green-500" : "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{p.titre}</p>
                      {p.stack_souhaitee && <p className="text-xs text-slate-400 truncate">{p.stack_souhaitee}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      p.statut === "en_cours" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                    }`}>{p.statut === "en_cours" ? "En cours" : "Matchée"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Projets terminés ────────────────────────────────────────── */}
          {doneProjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                {isFounder ? "Projets livrés" : "Missions réalisées"}
              </h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {doneProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="text-green-500 shrink-0 font-bold">✓</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{p.titre}</p>
                      {p.stack_souhaitee && <p className="text-xs text-slate-400 truncate">{p.stack_souhaitee}</p>}
                    </div>
                    {p.deadline && <span className="text-xs text-slate-400 shrink-0">{p.deadline}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Avis reçus ──────────────────────────────────────────────── */}
          {reviews.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Avis ({reviews.length})
              </h2>
              {reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <button
                      onClick={() => router.push(`/profil/${r.reviewer_id}`)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 hover:opacity-80 transition-opacity ${
                        r.reviewer_role === "founder"
                          ? "bg-gradient-to-br from-pink-400 to-purple-500"
                          : "bg-gradient-to-br from-blue-400 to-indigo-500"
                      }`}>
                      {r.reviewer_nom?.[0]?.toUpperCase() ?? "?"}
                    </button>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => router.push(`/profil/${r.reviewer_id}`)}
                        className="font-bold text-slate-900 text-sm hover:text-pink-500 transition-colors text-left">
                        {r.reviewer_nom}
                      </button>
                      <p className="text-xs text-slate-400">
                        {r.reviewer_role === "founder" ? "Founder" : "Développeur"}
                        {r.project_titre && <> · <span className="italic">{r.project_titre}</span></>}
                        {" · "}{fmtDate(r.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StarRow rating={r.rating} />
                      <p className="text-xs font-semibold text-amber-500 mt-0.5">{RATING_LABEL[r.rating]}</p>
                    </div>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-4 py-3 border-l-2 border-slate-200">
                      &ldquo;{r.comment}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-3xl mb-2">⭐</p>
              <p className="text-sm text-slate-400">Aucun avis pour l&apos;instant.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
