"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  created_at: string;
  profiles_founder: {
    nom: string;
    ecole: string;
    email: string;
    user_id: string;
  };
};

const DEADLINES = ["2 semaines", "1 mois", "2 mois", "3 mois", "Flexible"];
const STACKS = ["React", "Node.js", "Flutter", "Python", "Vue.js", "Laravel", "Swift", "Kotlin"];

export default function ProjetsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const [projects, setProjects] = useState<Project[]>([]);
  const [filtered, setFiltered] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [activeDeadline, setActiveDeadline] = useState<string | null>(null);
  const [activeStack, setActiveStack] = useState<string | null>(null);
  const [candidatures, setCandidatures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);

      if (roleData?.role === "founder") { router.push("/profil"); return; }

      if (roleData?.role === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          setDeveloperId(profile.id);
          const { data: cands } = await supabase
            .from("candidatures").select("project_id").eq("developer_id", profile.id);
          setCandidatures(new Set(cands?.map((c) => c.project_id) ?? []));
        }
      }

      const { data: projs } = await supabase
        .from("projects")
        .select("*, profiles_founder(nom, ecole, email, user_id)")
        .eq("statut", "pending")
        .order("created_at", { ascending: false });

      const p = (projs as Project[]) ?? [];
      setProjects(p);
      setFiltered(p);
      const preselected = projectParam ? p.find((proj) => proj.id === projectParam) : null;
      setSelected(preselected ?? p[0] ?? null);
      setLoading(false);
    }
    load();
  }, [router]);

  useEffect(() => {
    let result = [...projects];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.titre.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.stack_souhaitee?.toLowerCase().includes(q)
      );
    }
    if (activeDeadline) result = result.filter((p) => p.deadline === activeDeadline);
    if (activeStack) result = result.filter((p) => p.stack_souhaitee?.toLowerCase().includes(activeStack.toLowerCase()));
    setFiltered(result);
    if (result.length > 0) setSelected(result[0]);
    else setSelected(null);
  }, [search, activeDeadline, activeStack, projects]);

  async function handleCandidater(projectId: string) {
    if (!developerId) return;
    setApplying(projectId);
    await supabase.from("candidatures").insert({ project_id: projectId, developer_id: developerId, statut: "pending" });
    setCandidatures((prev) => new Set([...prev, projectId]));

    // Email au founder
    const projet = projects.find((p) => p.id === projectId);
    const { data: devProfile } = await supabase.from("profiles_developer").select("nom, email, ecole, competences").eq("id", developerId).maybeSingle();
    if (projet?.profiles_founder?.email && devProfile) {
      await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "nouvelle_candidature",
          to: projet.profiles_founder.email,
          data: {
            projetTitre: projet.titre,
            projetId: projet.id,
            devNom: devProfile.nom,
            devEcole: devProfile.ecole,
            devCompetences: devProfile.competences?.join(", "),
          },
        }),
      });
    }

    // Notification in-app au founder — lookup direct pour éviter les soucis de join
    const projRaw = projet as unknown as { founder_id?: string };
    if (projRaw?.founder_id) {
      const { data: founderData } = await supabase
        .from("profiles_founder")
        .select("user_id")
        .eq("id", projRaw.founder_id)
        .maybeSingle();
      if (founderData?.user_id) {
        const { error: notifErr } = await supabase.from("notifications").insert({
          user_id: founderData.user_id,
          type: "nouveau_candidat",
          title: "Nouveau candidat 🎉",
          body: `${devProfile?.nom ?? "Un dev"} a candidaté sur "${projet?.titre}"`,
          link: `/projets/${projectId}/candidats`,
        });
        if (notifErr) console.error("Notif error:", notifErr.message);
      }
    }

    setApplying(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-500">Linkea</p>
            <NotificationBell />
          </div>
          {/* Search bar */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1 relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Projet, stack, mot-clé..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-9 py-3 text-sm"
              />
            </div>
            {role === "founder" && (
              <button onClick={() => router.push("/projets/nouveau")} className="btn-pink px-5 py-3 text-sm whitespace-nowrap">
                + Déposer
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {/* Deadline filters */}
            {DEADLINES.map((d) => (
              <button
                key={d}
                onClick={() => setActiveDeadline(activeDeadline === d ? null : d)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  activeDeadline === d
                    ? "bg-pink-500 text-white border-pink-500"
                    : "bg-white text-slate-600 border-slate-200 hover:border-pink-300"
                }`}
              >
                📅 {d}
              </button>
            ))}
            <div className="w-px bg-slate-200 shrink-0" />
            {/* Stack filters */}
            {STACKS.map((s) => (
              <button
                key={s}
                onClick={() => setActiveStack(activeStack === s ? null : s)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  activeStack === s
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <p className="text-sm text-slate-500 mb-4 font-medium">
          {filtered.length} projet{filtered.length > 1 ? "s" : ""} disponible{filtered.length > 1 ? "s" : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-400">Aucun projet trouvé.</p>
          </div>
        ) : (
          <div className="flex gap-5 items-start">

            {/* Liste des projets */}
            <div className="w-full lg:w-[420px] shrink-0 flex flex-col gap-3">
              {filtered.map((p) => {
                const isSelected = selected?.id === p.id;
                const hasApplied = candidatures.has(p.id);
                const stacks = p.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all ${
                      isSelected ? "border-pink-400 shadow-md" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-sm font-black shrink-0">
                        {p.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm leading-snug mb-0.5">{p.titre}</h3>
                        <p className="text-xs text-slate-400">
                          {p.profiles_founder?.nom ?? "Founder"}
                          {p.profiles_founder?.ecole ? ` · ${p.profiles_founder.ecole}` : ""}
                        </p>
                      </div>
                      {hasApplied && (
                        <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">✓</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {stacks.slice(0, 3).map((s) => (
                        <span key={s} className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium">{s}</span>
                      ))}
                      {p.deadline && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">📅 {p.deadline}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Panneau détail — desktop uniquement */}
            {selected && (
              <div className="hidden lg:block flex-1 bg-white rounded-2xl border border-slate-200 p-8 sticky top-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xl font-black shrink-0">
                    {selected.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">{selected.titre}</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      {selected.profiles_founder?.nom ?? "Founder"}
                      {selected.profiles_founder?.ecole ? ` · ${selected.profiles_founder.ecole}` : ""}
                    </p>
                  </div>
                </div>

                {/* Infos clés */}
                <div className="flex gap-3 mb-6">
                  {selected.deadline && (
                    <span className="text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1.5 rounded-full">
                      📅 {selected.deadline}
                    </span>
                  )}
                  <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full">
                    En attente d'un dev
                  </span>
                </div>

                {/* Stack */}
                {selected.stack_souhaitee && (
                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Stack souhaitée</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.stack_souhaitee.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                        <span key={s} className="text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selected.description && (
                  <div className="mb-8">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Description du projet</p>
                    <p className="text-slate-600 text-sm leading-relaxed">{selected.description}</p>
                  </div>
                )}

                {/* CTA */}
                {role === "developer" && (
                  <button
                    onClick={() => { if (!candidatures.has(selected.id)) handleCandidater(selected.id); }}
                    disabled={candidatures.has(selected.id) || applying === selected.id}
                    className={`w-full py-4 rounded-xl text-sm font-bold transition-all ${
                      candidatures.has(selected.id)
                        ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
                        : "btn-pink"
                    }`}
                  >
                    {applying === selected.id ? "Envoi..." : candidatures.has(selected.id) ? "✓ Candidature envoyée" : "Candidater à ce projet"}
                  </button>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
