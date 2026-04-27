"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Candidature = {
  id: string;
  statut: string;
  created_at: string;
  profiles_developer: {
    id: string;
    nom: string;
    ecole: string;
    competences: string[];
    github: string;
    linkedin: string;
    dispo_heures_semaine: number;
    avatar_url?: string;
  };
};

type Project = {
  id: string;
  titre: string;
  statut: string;
};

export default function CandidatsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [founderId, setFounderId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "founder") { router.push("/projets"); return; }

      const { data: profile } = await supabase
        .from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
      if (!profile) { router.push("/onboarding"); return; }
      setFounderId(profile.id);

      const { data: proj } = await supabase
        .from("projects")
        .select("id, titre, statut")
        .eq("id", id)
        .eq("founder_id", profile.id)
        .maybeSingle();

      if (!proj) { router.push("/profil"); return; }
      setProject(proj);

      const { data: cands } = await supabase
        .from("candidatures")
        .select("id, statut, created_at, profiles_developer(id, nom, ecole, competences, github, linkedin, dispo_heures_semaine, avatar_url)")
        .eq("project_id", id)
        .order("created_at", { ascending: true });

      setCandidatures((cands as Candidature[]) ?? []);
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleAccept(candidatureId: string, developerId: string) {
    setActing(candidatureId);

    await supabase.from("candidatures").update({ statut: "accepted" }).eq("id", candidatureId);
    await supabase.from("candidatures").update({ statut: "refused" }).eq("project_id", id).neq("id", candidatureId);
    await supabase.from("projects").update({ statut: "matched" }).eq("id", id);

    // Créer la conversation
    const fId = founderId ?? (await supabase.from("profiles_founder").select("id").eq("user_id", (await supabase.auth.getUser()).data.user!.id).maybeSingle()).data?.id;
    if (fId) {
      const { error: convError } = await supabase.from("conversations").insert({
        project_id: id,
        founder_id: fId,
        developer_id: developerId,
      });
      if (convError) console.error("Conversation error:", convError.message);
    }

    // Notification in-app au dev accepté
    const { data: devUser } = await supabase.from("profiles_developer").select("user_id").eq("id", developerId).maybeSingle();
    if (devUser?.user_id) {
      await supabase.from("notifications").insert({
        user_id: devUser.user_id,
        type: "candidature_acceptee",
        title: "Candidature acceptée ✓",
        body: `Tu as été sélectionné pour "${project?.titre}"`,
        link: "/messages",
      });
    }

    // Email au dev accepté
    const { data: devProfile } = await supabase.from("profiles_developer").select("email").eq("id", developerId).maybeSingle();
    if (devProfile?.email && project) {
      await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "candidature_acceptee", to: devProfile.email, data: { projetTitre: project.titre } }),
      });
    }

    // Emails aux devs refusés
    const refusedCands = candidatures.filter((c) => c.id !== candidatureId && c.statut === "pending");
    for (const c of refusedCands) {
      const { data: refDevProfile } = await supabase.from("profiles_developer").select("email").eq("id", c.profiles_developer.id).maybeSingle();
      if (refDevProfile?.email && project) {
        await fetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "candidature_refusee", to: refDevProfile.email, data: { projetTitre: project.titre } }),
        });
      }
    }

    const { data: cands } = await supabase
      .from("candidatures")
      .select("id, statut, created_at, profiles_developer(id, nom, ecole, competences, github, linkedin, dispo_heures_semaine)")
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    setCandidatures((cands as Candidature[]) ?? []);
    setProject((prev) => prev ? { ...prev, statut: "matched" } : prev);
    setActing(null);
  }

  async function handleRefuse(candidatureId: string) {
    setActing(candidatureId);
    await supabase.from("candidatures").update({ statut: "refused" }).eq("id", candidatureId);

    // Notification in-app + email au dev refusé
    const cand = candidatures.find((c) => c.id === candidatureId);
    if (cand && project) {
      const { data: devUserRef } = await supabase.from("profiles_developer").select("user_id, email").eq("id", cand.profiles_developer.id).maybeSingle();
      if (devUserRef?.user_id) {
        await supabase.from("notifications").insert({
          user_id: devUserRef.user_id,
          type: "candidature_refusee",
          title: "Candidature non retenue",
          body: `Ta candidature pour "${project.titre}" n'a pas été retenue`,
          link: "/projets",
        });
      }
      if (devUserRef?.email) {
        await fetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "candidature_refusee", to: devUserRef.email, data: { projetTitre: project.titre } }),
        });
      }
    }
    setCandidatures((prev) => prev.map((c) => c.id === candidatureId ? { ...c, statut: "refused" } : c));
    setActing(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  const pending = candidatures.filter((c) => c.statut === "pending");
  const accepted = candidatures.filter((c) => c.statut === "accepted");
  const refused = candidatures.filter((c) => c.statut === "refused");

  return (
    <div className="min-h-screen bg-slate-50 pb-10">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push("/profil")} className="text-slate-400 hover:text-slate-600 text-sm font-medium">
            ← Retour
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-slate-900 text-base truncate">{project?.titre}</h1>
            <p className="text-xs text-slate-400">{candidatures.length} candidature{candidatures.length > 1 ? "s" : ""}</p>
          </div>
          {project?.statut === "matched" && (
            <span className="text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1 rounded-full shrink-0">
              ✓ Matchée
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">

        {candidatures.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-400 text-sm">Aucune candidature pour l'instant.</p>
            <p className="text-slate-400 text-sm mt-1">Les devs intéressés apparaîtront ici.</p>
          </div>
        )}

        {/* Candidatures en attente */}
        {pending.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              En attente ({pending.length})
            </p>
            <div className="flex flex-col gap-3">
              {pending.map((c) => (
                <CandidatCard
                  key={c.id}
                  c={c}
                  acting={acting}
                  onAccept={() => handleAccept(c.id, c.profiles_developer.id)}
                  onRefuse={() => handleRefuse(c.id)}
                  showActions={project?.statut !== "matched"}
                />
              ))}
            </div>
          </div>
        )}

        {/* Candidature acceptée */}
        {accepted.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-green-500 mb-3">
              Dev sélectionné ✓
            </p>
            <div className="flex flex-col gap-3">
              {accepted.map((c) => (
                <CandidatCard key={c.id} c={c} acting={acting} showActions={false} />
              ))}
            </div>
          </div>
        )}

        {/* Candidatures refusées */}
        {refused.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-3">
              Refusés ({refused.length})
            </p>
            <div className="flex flex-col gap-3 opacity-50">
              {refused.map((c) => (
                <CandidatCard key={c.id} c={c} acting={acting} showActions={false} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function CandidatCard({
  c,
  acting,
  onAccept,
  onRefuse,
  showActions,
}: {
  c: Candidature;
  acting: string | null;
  onAccept?: () => void;
  onRefuse?: () => void;
  showActions: boolean;
}) {
  const dev = c.profiles_developer;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start gap-4">
        {dev.avatar_url ? (
          <img src={dev.avatar_url} alt={dev.nom} className="w-11 h-11 rounded-full object-cover shrink-0 border border-slate-200" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-black shrink-0">
            {dev.nom?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-base">{dev.nom}</h3>
          {dev.ecole && <p className="text-xs text-slate-400 mb-2">{dev.ecole}</p>}

          {dev.competences?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {dev.competences.map((comp) => (
                <span key={comp} className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                  {comp}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-4 text-xs text-slate-400 mb-4">
            {dev.dispo_heures_semaine && <span>⏱ {dev.dispo_heures_semaine}h/semaine</span>}
            {dev.github && (
              <a href={dev.github} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                GitHub ↗
              </a>
            )}
            {dev.linkedin && (
              <a href={dev.linkedin} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                LinkedIn ↗
              </a>
            )}
          </div>

          {showActions && (
            <div className="flex gap-2">
              <button
                onClick={onAccept}
                disabled={acting === c.id}
                className="btn-pink px-5 py-2 text-sm"
              >
                {acting === c.id ? "..." : "✓ Accepter"}
              </button>
              <button
                onClick={onRefuse}
                disabled={acting === c.id}
                className="btn-ghost px-5 py-2 text-sm"
              >
                Refuser
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
