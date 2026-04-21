"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Match = {
  id: string;
  created_at: string;
  projects: {
    titre: string;
    description: string;
    stack_souhaitee: string;
    deadline: string;
    statut: string;
  };
};

export default function DeveloperDashboard() {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [competences, setCompetences] = useState<string[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "developer") { router.push("/"); return; }

      const { data: profile } = await supabase
        .from("profiles_developer")
        .select("id, nom, competences")
        .eq("user_id", user.id)
        .single();

      if (!profile) { router.push("/onboarding"); return; }

      setNom(profile.nom ?? "");
      setCompetences(profile.competences ?? []);

      const { data: matchData } = await supabase
        .from("matches")
        .select("id, created_at, projects(titre, description, stack_souhaitee, deadline, statut)")
        .eq("developer_id", profile.id)
        .order("created_at", { ascending: false });

      setMatches((matchData as Match[]) ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-1">Linkea</p>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Bonjour, {nom || "Dev"} 👋
            </h1>
          </div>
          <button onClick={handleLogout} className="btn-ghost text-sm px-4 py-2">
            Déconnexion
          </button>
        </div>

        {/* Compétences */}
        {competences.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Mes compétences</p>
            <div className="flex flex-wrap gap-2">
              {competences.map((c) => (
                <span key={c} className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 rounded-full">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Projets matchés */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
            Mes missions ({matches.length})
          </h2>

          {matches.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-sm">Pas encore de mission assignée.</p>
              <p className="text-slate-400 text-sm mt-1">L'équipe Linkea va te contacter dès qu'un projet correspond à ton profil.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {matches.map((m) => (
                <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-900 text-base mb-2">{m.projects.titre}</h3>
                  {m.projects.description && (
                    <p className="text-slate-500 text-sm leading-relaxed mb-3 line-clamp-2">
                      {m.projects.description}
                    </p>
                  )}
                  <div className="flex gap-3 text-xs text-slate-400">
                    {m.projects.stack_souhaitee && <span>🛠 {m.projects.stack_souhaitee}</span>}
                    {m.projects.deadline && <span>📅 {m.projects.deadline}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
