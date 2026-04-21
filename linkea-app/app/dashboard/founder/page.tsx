"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  created_at: string;
};

const statutLabel: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente",  color: "bg-amber-50 text-amber-600 border border-amber-200" },
  matched:  { label: "Matchée",     color: "bg-blue-50 text-blue-600 border border-blue-200" },
  en_cours: { label: "En cours",    color: "bg-green-50 text-green-600 border border-green-200" },
  livre:    { label: "Livré",       color: "bg-slate-100 text-slate-500 border border-slate-200" },
};

export default function FounderDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [nom, setNom] = useState("");
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

      if (roleData?.role !== "founder") { router.push("/"); return; }

      const { data: profile } = await supabase
        .from("profiles_founder")
        .select("id, nom")
        .eq("user_id", user.id)
        .single();

      if (!profile) { router.push("/onboarding"); return; }

      setNom(profile.nom ?? "");

      const { data: projs } = await supabase
        .from("projects")
        .select("*")
        .eq("founder_id", profile.id)
        .order("created_at", { ascending: false });

      setProjects(projs ?? []);
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
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pink-500 mb-1">Linkea</p>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Bonjour, {nom || "Founder"} 👋
            </h1>
          </div>
          <button onClick={handleLogout} className="btn-ghost text-sm px-4 py-2">
            Déconnexion
          </button>
        </div>

        {/* CTA nouveau projet */}
        <button
          onClick={() => router.push("/projets/nouveau")}
          className="btn-pink w-full mb-8"
        >
          + Déposer un nouveau projet
        </button>

        {/* Liste des projets */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
            Mes projets ({projects.length})
          </h2>

          {projects.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-sm">Aucun projet déposé pour l'instant.</p>
              <p className="text-slate-400 text-sm mt-1">Clique sur le bouton ci-dessus pour commencer.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {projects.map((p) => {
                const s = statutLabel[p.statut] ?? { label: p.statut, color: "bg-slate-100 text-slate-500" };
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-bold text-slate-900 text-base leading-tight">{p.titre}</h3>
                      <span className={`label-tag text-xs px-3 py-1 rounded-full shrink-0 ${s.color}`}>
                        {s.label}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-slate-500 text-sm leading-relaxed mb-3 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="flex gap-3 text-xs text-slate-400">
                      {p.stack_souhaitee && <span>🛠 {p.stack_souhaitee}</span>}
                      {p.deadline && <span>📅 {p.deadline}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
