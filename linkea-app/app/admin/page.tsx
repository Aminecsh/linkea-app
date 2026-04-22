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
  profiles_founder: { nom: string; ecole: string };
};

type Founder = {
  id: string;
  nom: string;
  email: string;
  ecole: string;
  linkedin: string;
  budget: string;
  created_at: string;
};

type Developer = {
  id: string;
  nom: string;
  email: string;
  ecole: string;
  competences: string[];
  dispo_heures_semaine: number;
  github: string;
  linkedin: string;
  created_at: string;
};

type Match = {
  id: string;
  statut: string;
  created_at: string;
  projects: { titre: string; statut: string };
  profiles_developer: { nom: string; ecole: string };
};

const STATUTS = ["pending", "matched", "en_cours", "livre", "suspendu"];
const statutColors: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-600 border-amber-200",
  matched:   "bg-blue-50 text-blue-600 border-blue-200",
  en_cours:  "bg-green-50 text-green-600 border-green-200",
  livre:     "bg-slate-100 text-slate-500 border-slate-200",
  suspendu:  "bg-red-50 text-red-500 border-red-200",
};
const statutLabels: Record<string, string> = {
  pending: "En attente", matched: "Matchée", en_cours: "En cours", livre: "Livré", suspendu: "Suspendu",
};

type Tab = "projets" | "founders" | "developers" | "matchings";

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("projets");
  const [projects, setProjects] = useState<Project[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") { router.push("/projets"); return; }

      const [{ data: projs }, { data: founds }, { data: devs }, { data: matchData }] = await Promise.all([
        supabase.from("projects").select("*, profiles_founder(nom, ecole)").order("created_at", { ascending: false }),
        supabase.from("profiles_founder").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles_developer").select("*").order("created_at", { ascending: false }),
        supabase.from("candidatures").select("id, statut, created_at, projects(titre, statut), profiles_developer(nom, ecole)").eq("statut", "accepted").order("created_at", { ascending: false }),
      ]);

      setProjects((projs as Project[]) ?? []);
      setFounders((founds as Founder[]) ?? []);
      setDevelopers((devs as Developer[]) ?? []);
      setMatches((matchData as Match[]) ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function updateProjectStatut(projectId: string, statut: string) {
    setUpdatingId(projectId);
    await supabase.from("projects").update({ statut }).eq("id", projectId);
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, statut } : p));
    setUpdatingId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "projets",    label: "Projets",     count: projects.length },
    { key: "founders",   label: "Founders",    count: founders.length },
    { key: "developers", label: "Developers",  count: developers.length },
    { key: "matchings",  label: "Matchings",   count: matches.length },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-0.5">Linkea · Admin</p>
            <h1 className="text-xl font-black text-slate-900">Dashboard</h1>
          </div>
          <button onClick={handleLogout} className="btn-ghost text-sm px-4 py-2">Déconnexion</button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Projets", val: projects.length, color: "text-pink-500" },
            { label: "Founders", val: founders.length, color: "text-purple-500" },
            { label: "Developers", val: developers.length, color: "text-blue-500" },
            { label: "Matchings", val: matches.length, color: "text-green-500" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
              <p className={`text-3xl font-black ${s.color}`}>{s.val}</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs font-bold ${tab === t.key ? "text-indigo-500" : "text-slate-400"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Projets */}
        {tab === "projets" && (
          <div className="flex flex-col gap-3">
            {projects.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-base mb-0.5">{p.titre}</h3>
                    <p className="text-xs text-slate-400 mb-2">
                      {p.profiles_founder?.nom ?? "—"} · {p.profiles_founder?.ecole ?? "—"}
                    </p>
                    {p.description && (
                      <p className="text-sm text-slate-500 line-clamp-2 mb-3">{p.description}</p>
                    )}
                    <div className="flex gap-3 text-xs text-slate-400">
                      {p.stack_souhaitee && <span>🛠 {p.stack_souhaitee}</span>}
                      {p.deadline && <span>📅 {p.deadline}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <select
                      value={p.statut}
                      onChange={(e) => updateProjectStatut(p.id, e.target.value)}
                      disabled={updatingId === p.id}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${statutColors[p.statut] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}
                    >
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>{statutLabels[s] ?? s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Founders */}
        {tab === "founders" && (
          <div className="flex flex-col gap-3">
            {founders.map((f) => (
              <div key={f.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-black shrink-0">
                  {f.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{f.nom}</p>
                  <p className="text-xs text-slate-400">{f.email} · {f.ecole}</p>
                  {f.budget && <p className="text-xs text-slate-400 mt-0.5">Budget : {f.budget}</p>}
                </div>
                {f.linkedin && (
                  <a href={f.linkedin} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline shrink-0">
                    LinkedIn ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Developers */}
        {tab === "developers" && (
          <div className="flex flex-col gap-3">
            {developers.map((d) => (
              <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-black shrink-0">
                  {d.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{d.nom}</p>
                  <p className="text-xs text-slate-400 mb-2">{d.email} · {d.ecole} · {d.dispo_heures_semaine}h/sem</p>
                  {d.competences?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.competences.map((c) => (
                        <span key={c} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {d.github && <a href={d.github} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">GitHub ↗</a>}
                  {d.linkedin && <a href={d.linkedin} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">LinkedIn ↗</a>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Matchings */}
        {tab === "matchings" && (
          <div className="flex flex-col gap-3">
            {matches.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400">Aucun matching actif pour l'instant.</p>
              </div>
            ) : matches.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-bold text-slate-900 text-sm">{m.projects?.titre ?? "—"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Dev : {m.profiles_developer?.nom ?? "—"} · {m.profiles_developer?.ecole ?? "—"}</p>
                </div>
                <span className="text-xs font-semibold bg-green-50 text-green-600 border border-green-200 px-3 py-1 rounded-full shrink-0">
                  ✓ Matchée
                </span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
