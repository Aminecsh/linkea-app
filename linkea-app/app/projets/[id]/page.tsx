"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  profiles_founder: {
    nom: string;
    ecole?: string;
  };
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      const { data: proj } = await supabase
        .from("projects")
        .select("id, titre, description, stack_souhaitee, deadline, statut, profiles_founder(nom, ecole)")
        .eq("id", id)
        .maybeSingle();

      if (!proj) { router.push("/projets"); return; }
      setProject(proj as Project);

      if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          setDeveloperId(profile.id);
          const { data: cand } = await supabase
            .from("candidatures").select("id").eq("project_id", id).eq("developer_id", profile.id).maybeSingle();
          setHasApplied(!!cand);
        }
      }

      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleCandidater() {
    if (!developerId || applying || hasApplied) return;
    setApplying(true);

    await supabase.from("candidatures").insert({
      project_id: id,
      developer_id: developerId,
      statut: "pending",
    });

    // Notif + email au founder
    const projRaw = project as unknown as { founder_id?: string };
    if (projRaw?.founder_id) {
      const { data: founderData } = await supabase
        .from("profiles_founder").select("user_id, email").eq("id", projRaw.founder_id).maybeSingle();

      if (founderData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: founderData.user_id,
          type: "nouveau_candidat",
          title: "Nouveau candidat 🎉",
          body: `Un dev a candidaté sur "${project?.titre}"`,
          link: `/projets/${id}/candidats`,
        });
      }
    }

    setHasApplied(true);
    setApplying(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!project) return null;

  const stacks = project.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm font-medium">
            ← Retour
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">

          {/* Founder */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-lg font-black shrink-0">
              {project.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-bold text-slate-900">{project.profiles_founder?.nom}</p>
              {project.profiles_founder?.ecole && (
                <p className="text-xs text-slate-400">{project.profiles_founder.ecole}</p>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-black text-slate-900 mb-2">{project.titre}</h1>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-5">
            {project.deadline && (
              <span className="text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1.5 rounded-full">
                📅 {project.deadline}
              </span>
            )}
            <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full">
              En attente d'un dev
            </span>
          </div>

          {/* Stack */}
          {stacks.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Stack souhaitée</p>
              <div className="flex flex-wrap gap-2">
                {stacks.map((s) => (
                  <span key={s} className="text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {project.description && (
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Description</p>
              <p className="text-slate-600 text-sm leading-relaxed">{project.description}</p>
            </div>
          )}

          {/* CTA */}
          {role === "developer" && (
            <button
              onClick={handleCandidater}
              disabled={hasApplied || applying}
              className={`w-full py-4 rounded-xl text-sm font-bold transition-all ${
                hasApplied
                  ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
                  : "btn-pink"
              }`}
            >
              {applying ? "Envoi..." : hasApplied ? "✓ Candidature envoyée" : "Candidater à ce projet"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
