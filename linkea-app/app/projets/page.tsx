"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  created_at: string;
  profiles_founder: {
    nom: string;
    ecole: string;
  };
};

export default function ProjetsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filtered, setFiltered] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [candidatures, setCandidatures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      setRole(roleData?.role ?? null);

      if (roleData?.role === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile) {
          setDeveloperId(profile.id);
          const { data: cands } = await supabase
            .from("candidatures")
            .select("project_id")
            .eq("developer_id", profile.id);
          setCandidatures(new Set(cands?.map((c) => c.project_id) ?? []));
        }
      }

      const { data: projs } = await supabase
        .from("projects")
        .select("*, profiles_founder(nom, ecole)")
        .eq("statut", "pending")
        .order("created_at", { ascending: false });

      setProjects((projs as Project[]) ?? []);
      setFiltered((projs as Project[]) ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  useEffect(() => {
    if (!search.trim()) { setFiltered(projects); return; }
    const q = search.toLowerCase();
    setFiltered(projects.filter((p) =>
      p.titre.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.stack_souhaitee?.toLowerCase().includes(q)
    ));
  }, [search, projects]);

  async function handleCandidater(projectId: string) {
    if (!developerId) return;
    setApplying(projectId);

    await supabase.from("candidatures").insert({
      project_id: projectId,
      developer_id: developerId,
      statut: "pending",
    });

    setCandidatures((prev) => new Set([...prev, projectId]));
    setApplying(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <input
            type="text"
            placeholder="Rechercher un projet, une stack..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field py-2.5 text-sm"
          />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Projets disponibles</h1>
            <p className="text-slate-400 text-sm mt-1">{filtered.length} projet{filtered.length > 1 ? "s" : ""} en attente d'un dev</p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-400">Aucun projet trouvé.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((p) => {
              const hasApplied = candidatures.has(p.id);
              const stacks = p.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => router.push(`/projets/${p.id}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">

                      {/* Founder info */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {p.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 leading-none">{p.profiles_founder?.nom ?? "Founder"}</p>
                          {p.profiles_founder?.ecole && (
                            <p className="text-xs text-slate-400 mt-0.5">{p.profiles_founder.ecole}</p>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h2 className="text-base font-bold text-slate-900 mb-2 leading-snug">{p.titre}</h2>

                      {/* Description */}
                      {p.description && (
                        <p className="text-sm text-slate-500 leading-relaxed mb-3 line-clamp-2">{p.description}</p>
                      )}

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2">
                        {stacks.map((s) => (
                          <span key={s} className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1 rounded-full">
                            {s}
                          </span>
                        ))}
                        {p.deadline && (
                          <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">
                            📅 {p.deadline}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bouton candidater */}
                    {role === "developer" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!hasApplied) handleCandidater(p.id); }}
                        disabled={hasApplied || applying === p.id}
                        className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          hasApplied
                            ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
                            : "btn-pink"
                        }`}
                      >
                        {applying === p.id ? "..." : hasApplied ? "✓ Candidaté" : "Candidater"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
