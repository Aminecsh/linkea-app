"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import { Search, Calendar, Check, ArrowRight, Sparkles, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  budget: number | null;
  created_at: string;
  profiles_founder: {
    nom: string;
    ecole: string;
    email: string;
    user_id: string;
    avatar_url?: string;
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
        .select("*, budget, profiles_founder(nom, ecole, email, user_id, avatar_url)")
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

    const projRaw = projet as unknown as { founder_id?: string };
    if (projRaw?.founder_id) {
      const { data: founderData } = await supabase
        .from("profiles_founder").select("user_id").eq("id", projRaw.founder_id).maybeSingle();
      if (founderData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: founderData.user_id,
          type: "nouveau_candidat",
          title: "Nouveau candidat",
          body: `${devProfile?.nom ?? "Un dev"} a candidaté sur "${projet?.titre}"`,
          link: `/projets/${projectId}/candidats`,
        });
      }
    }

    setApplying(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>
        {/* Header skeleton */}
        <div className="page-header px-4 py-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="skeleton w-16 h-4" />
              <div className="skeleton w-9 h-9 rounded-xl" />
            </div>
            <div className="skeleton w-full h-11 rounded-xl mb-3" />
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton w-20 h-7 rounded-full" />)}
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-6 flex gap-5">
          <div className="w-full lg:w-[420px] flex flex-col gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="page-header px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} strokeWidth={2} style={{ color: "var(--rose)" }} />
              <span className="label" style={{ color: "var(--rose)" }}>Linkea</span>
            </div>
            <NotificationBell />
          </div>

          {/* Search */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <Search
                size={15}
                strokeWidth={2}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--subtle)" }}
              />
              <input
                type="text"
                placeholder="Projet, stack, mot-clé..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-9 py-2.5 text-sm"
              />
            </div>
            {role === "founder" && (
              <button onClick={() => router.push("/projets/nouveau")} className="btn-primary text-sm" style={{ padding: "0 18px" }}>
                + Déposer
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {DEADLINES.map((d) => (
              <button
                key={d}
                onClick={() => setActiveDeadline(activeDeadline === d ? null : d)}
                className={cn("chip", activeDeadline === d && "chip-active-rose")}
              >
                <Calendar size={11} strokeWidth={2} />
                {d}
              </button>
            ))}
            <div className="w-px shrink-0 my-1" style={{ background: "var(--border-2)" }} />
            {STACKS.map((s) => (
              <button
                key={s}
                onClick={() => setActiveStack(activeStack === s ? null : s)}
                className={cn("chip", activeStack === s && "chip-active-blue")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        <p className="text-xs font-semibold mb-4" style={{ color: "var(--muted)" }}>
          {filtered.length} projet{filtered.length > 1 ? "s" : ""} disponible{filtered.length > 1 ? "s" : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20 text-center">
            <Search size={32} strokeWidth={1.2} className="mb-3" style={{ color: "var(--subtle)" }} />
            <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-2)" }}>Aucun projet trouvé</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Essayez d&apos;autres filtres</p>
          </div>
        ) : (
          <div className="flex gap-5 items-start">

            {/* Liste des projets */}
            <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-2.5">
              {filtered.map((p) => {
                const isSelected = selected?.id === p.id;
                const hasApplied = candidatures.has(p.id);
                const stacks = p.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={cn("card cursor-pointer p-4", isSelected && "card-selected")}
                    style={isSelected ? {
                      borderColor: "rgba(244,63,94,0.25)",
                      boxShadow: "var(--shadow-sm), 0 0 0 1px rgba(244,63,94,0.15)",
                    } : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/profil/${p.profiles_founder?.user_id}`); }}
                        className="shrink-0 hover:opacity-80 transition-opacity"
                      >
                        {p.profiles_founder?.avatar_url ? (
                          <img src={p.profiles_founder.avatar_url} alt={p.profiles_founder.nom} className="avatar w-9 h-9" />
                        ) : (
                          <div className="avatar-placeholder w-9 h-9 text-sm">
                            {p.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm leading-snug mb-0.5 truncate" style={{ color: "var(--text)" }}>
                          {p.titre}
                        </h3>
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/profil/${p.profiles_founder?.user_id}`); }}
                          className="text-xs transition-colors text-left hover:opacity-70"
                          style={{ color: "var(--muted)" }}
                        >
                          {p.profiles_founder?.nom ?? "Founder"}
                          {p.profiles_founder?.ecole ? ` · ${p.profiles_founder.ecole}` : ""}
                        </button>
                      </div>
                      {hasApplied && (
                        <span className="tag tag-green shrink-0">
                          <Check size={10} strokeWidth={2.5} />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {stacks.slice(0, 3).map((s) => (
                        <span key={s} className="tag tag-blue">{s}</span>
                      ))}
                      {p.deadline && (
                        <span className="tag tag-amber">
                          <Calendar size={10} strokeWidth={2} />
                          {p.deadline}
                        </span>
                      )}
                      {p.budget && (
                        <span className="tag tag-green">
                          <Banknote size={10} strokeWidth={2} />
                          {(p.budget * 0.9).toFixed(0)}€
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Panneau détail — desktop */}
            {selected && (
              <div
                className="hidden lg:block flex-1 sticky top-[132px]"
                style={{
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 24,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.07), 0 8px 32px rgba(0,0,0,0.04)",
                  padding: 32,
                }}
              >
                {/* Header projet */}
                <div className="flex items-start gap-4 mb-6">
                  <button
                    onClick={() => router.push(`/profil/${selected.profiles_founder?.user_id}`)}
                    className="shrink-0 hover:opacity-80 transition-opacity"
                  >
                    {selected.profiles_founder?.avatar_url ? (
                      <img src={selected.profiles_founder.avatar_url} alt={selected.profiles_founder.nom} className="avatar w-14 h-14" />
                    ) : (
                      <div className="avatar-placeholder w-14 h-14 text-xl">
                        {selected.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-black leading-tight mb-1" style={{ color: "var(--text)" }}>
                      {selected.titre}
                    </h2>
                    <button
                      onClick={() => router.push(`/profil/${selected.profiles_founder?.user_id}`)}
                      className="text-sm transition-colors hover:opacity-70 text-left"
                      style={{ color: "var(--muted)" }}
                    >
                      {selected.profiles_founder?.nom ?? "Founder"}
                      {selected.profiles_founder?.ecole ? ` · ${selected.profiles_founder.ecole}` : ""}
                    </button>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {selected.deadline && (
                    <span className="tag tag-amber">
                      <Calendar size={11} strokeWidth={2} />
                      {selected.deadline}
                    </span>
                  )}
                  <span className="tag tag-gray">En attente d&apos;un dev</span>
                </div>

                {/* Budget */}
                {selected.budget && (
                  <div className="mb-6 rounded-2xl p-4 flex items-center gap-3"
                    style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)" }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(16,185,129,0.12)" }}>
                      <Banknote size={17} style={{ color: "#10b981" }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "#059669" }}>Rémunération</p>
                      <p className="text-lg font-black" style={{ color: "#065f46" }}>
                        {(selected.budget * 0.9).toFixed(0)}€
                      </p>
                    </div>
                  </div>
                )}

                {/* Stack */}
                {selected.stack_souhaitee && (
                  <div className="mb-6">
                    <p className="label mb-2">Stack souhaitée</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.stack_souhaitee.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                        <span key={s} className="tag tag-blue" style={{ fontSize: 13, padding: "5px 12px" }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selected.description && (
                  <div className="mb-8">
                    <p className="label mb-2">Description du projet</p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                      {selected.description}
                    </p>
                  </div>
                )}

                {/* CTA */}
                {role === "developer" && (
                  <button
                    onClick={() => { if (!candidatures.has(selected.id)) handleCandidater(selected.id); }}
                    disabled={candidatures.has(selected.id) || applying === selected.id}
                    className={cn(
                      "w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                      candidatures.has(selected.id)
                        ? "cursor-default"
                        : "btn-primary"
                    )}
                    style={candidatures.has(selected.id) ? {
                      background: "var(--green-soft)",
                      color: "var(--green)",
                      border: "1px solid var(--green-border)",
                    } : undefined}
                  >
                    {applying === selected.id ? (
                      <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    ) : candidatures.has(selected.id) ? (
                      <><Check size={15} strokeWidth={2.5} /> Candidature envoyée</>
                    ) : (
                      <>Candidater à ce projet <ArrowRight size={15} strokeWidth={2.2} /></>
                    )}
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
