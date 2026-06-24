"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import { Search, ArrowRight, Check, X, SlidersHorizontal, Calendar, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
    avatar_url?: string;
    founder_id?: string;
  };
};

const DEADLINES = ["2 semaines", "1 mois", "2 mois", "3 mois", "Flexible"];
const STACKS    = ["React", "Node.js", "Flutter", "Python", "Vue.js", "Laravel", "Swift", "Kotlin"];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return "À l'instant";
  if (h < 24) return `Il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `Il y a ${d} jour${d > 1 ? "s" : ""}`;
  const w = Math.floor(d / 7);
  return `Il y a ${w} semaine${w > 1 ? "s" : ""}`;
}

function matchScore(devCompetences: string[], stack: string): number {
  if (!stack || !devCompetences.length) return 0;
  const techs = stack.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!techs.length) return 0;
  const matched = techs.filter((t) => devCompetences.some((c) => c.toLowerCase().includes(t) || t.includes(c.toLowerCase())));
  return Math.round((matched.length / techs.length) * 100);
}

export default function ProjetsPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");

  const [projects,       setProjects]       = useState<Project[]>([]);
  const [filtered,       setFiltered]       = useState<Project[]>([]);
  const [search,         setSearch]         = useState("");
  const [activeDeadline, setActiveDeadline] = useState<string | null>(null);
  const [activeStack,    setActiveStack]    = useState<string | null>(null);
  const [showFilters,    setShowFilters]    = useState(false);
  const [candidatures,   setCandidatures]  = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(true);
  const [role,           setRole]           = useState<string | null>(null);
  const [developerId,    setDeveloperId]    = useState<string | null>(null);
  const [devCompetences, setDevCompetences] = useState<string[]>([]);
  const [applying,       setApplying]       = useState<string | null>(null);
  const [selected,       setSelected]       = useState<Project | null>(null);
  // Extra data for detail panel
  const [candCounts,     setCandCounts]     = useState<Record<string, number>>({});
  const [founderCounts,  setFounderCounts]  = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);
      if (roleData?.role === "founder") { router.push("/profil"); return; }

      let devId: string | null = null;
      if (roleData?.role === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id, competences").eq("user_id", user.id).maybeSingle();
        if (profile) {
          devId = profile.id;
          setDeveloperId(profile.id);
          setDevCompetences(profile.competences ?? []);
          const { data: cands } = await supabase.from("candidatures").select("project_id").eq("developer_id", profile.id);
          setCandidatures(new Set(cands?.map((c) => c.project_id) ?? []));
        }
      }

      const { data: projs } = await supabase
        .from("projects")
        .select("*, profiles_founder(nom, ecole, email, user_id, avatar_url)")
        .eq("statut", "pending")
        .order("created_at", { ascending: false });
      const p = (projs as Project[]) ?? [];
      setProjects(p);
      setFiltered(p);
      const pre = projectParam ? p.find((x) => x.id === projectParam) : null;
      setSelected(pre ?? p[0] ?? null);
      setLoading(false);

      // Candidature counts per project
      if (p.length) {
        const ids = p.map((x) => x.id);
        const { data: counts } = await supabase
          .from("candidatures").select("project_id").in("project_id", ids);
        const map: Record<string, number> = {};
        counts?.forEach((c) => { map[c.project_id] = (map[c.project_id] ?? 0) + 1; });
        setCandCounts(map);
      }

      // Founder project counts
      if (p.length) {
        const founderIds = [...new Set(p.map((x) => (x as unknown as { founder_id: string }).founder_id).filter(Boolean))];
        if (founderIds.length) {
          const { data: fProjs } = await supabase
            .from("projects").select("founder_id").in("founder_id", founderIds);
          const fmap: Record<string, number> = {};
          fProjs?.forEach((fp: { founder_id: string }) => { fmap[fp.founder_id] = (fmap[fp.founder_id] ?? 0) + 1; });
          setFounderCounts(fmap);
        }
      }

      void devId;
    }
    load();
  }, [router]);

  useEffect(() => {
    let r = [...projects];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((p) =>
        p.titre.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.stack_souhaitee?.toLowerCase().includes(q)
      );
    }
    if (activeDeadline) r = r.filter((p) => p.deadline === activeDeadline);
    if (activeStack)    r = r.filter((p) => p.stack_souhaitee?.toLowerCase().includes(activeStack.toLowerCase()));
    setFiltered(r);
    setSelected(r[0] ?? null);
  }, [search, activeDeadline, activeStack, projects]);

  async function handleCandidater(projectId: string) {
    if (!developerId) return;
    setApplying(projectId);
    await supabase.from("candidatures").insert({ project_id: projectId, developer_id: developerId, statut: "pending" });
    setCandidatures((prev) => new Set([...prev, projectId]));
    setCandCounts((prev) => ({ ...prev, [projectId]: (prev[projectId] ?? 0) + 1 }));
    const projet = projects.find((p) => p.id === projectId);
    const { data: dev } = await supabase.from("profiles_developer").select("nom,email,ecole,competences").eq("id", developerId).maybeSingle();
    if (projet?.profiles_founder?.email && dev) {
      await fetch("/api/emails", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "nouvelle_candidature", to: projet.profiles_founder.email,
          data: { projetTitre: projet.titre, projetId: projet.id, devNom: dev.nom, devEcole: dev.ecole, devCompetences: dev.competences?.join(", ") } }) });
    }
    const raw = projet as unknown as { founder_id?: string };
    if (raw?.founder_id) {
      const { data: fd } = await supabase.from("profiles_founder").select("user_id").eq("id", raw.founder_id).maybeSingle();
      if (fd?.user_id) await supabase.from("notifications").insert({
        user_id: fd.user_id, type: "nouveau_candidat", title: "Nouveau candidat",
        body: `${dev?.nom ?? "Un dev"} a candidaté sur "${projet?.titre}"`,
        link: `/projets/${projectId}/candidats`,
      });
    }
    setApplying(null);
  }

  const hasFilter = !!(activeDeadline || activeStack);

  if (loading) return (
    <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>
      <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 flex gap-4">
            <div className="skeleton w-12 h-12 rounded-2xl shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton h-3 w-56 rounded" />
            </div>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );

  const score = selected ? matchScore(devCompetences, selected.stack_souhaitee) : 0;
  const candCount = selected ? (candCounts[selected.id] ?? 0) : 0;
  const rawSelected = selected as unknown as { founder_id?: string } | null;
  const founderProjectCount = rawSelected?.founder_id ? (founderCounts[rawSelected.founder_id] ?? 1) : 1;

  return (
    <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 px-4 py-3"
        style={{
          background: "rgba(240,240,245,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
        }}>
        <div className="max-w-6xl mx-auto flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={13} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--subtle)" }} />
            <input type="text" placeholder="Chercher un projet…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-8 py-2 text-sm w-full" style={{ borderRadius: 12 }} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={12} style={{ color: "var(--subtle)" }} />
              </button>
            )}
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="btn-icon shrink-0"
            style={{ borderRadius: 12, ...(hasFilter ? { background: "var(--rose-soft)", border: "1px solid var(--rose-border)" } : {}) }}>
            <SlidersHorizontal size={14} strokeWidth={2} style={{ color: hasFilter ? "var(--rose)" : undefined }} />
          </button>
          <NotificationBell />
        </div>
        {showFilters && (
          <div className="max-w-6xl mx-auto flex flex-col gap-1.5 pt-2.5">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {DEADLINES.map((d) => (
                <button key={d} onClick={() => setActiveDeadline(activeDeadline === d ? null : d)}
                  className={cn("chip", activeDeadline === d && "chip-active-rose")}>
                  <Calendar size={10} strokeWidth={2} />{d}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {STACKS.map((s) => (
                <button key={s} onClick={() => setActiveStack(activeStack === s ? null : s)}
                  className={cn("chip", activeStack === s && "chip-active-blue")}>{s}
                </button>
              ))}
            </div>
            {hasFilter && (
              <button onClick={() => { setActiveDeadline(null); setActiveStack(null); }}
                className="self-start flex items-center gap-1 text-xs font-semibold mt-0.5" style={{ color: "var(--rose)" }}>
                <X size={11} /> Effacer
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Corps ── */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        {filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20 text-center gap-3">
            <Search size={28} strokeWidth={1.2} style={{ color: "var(--subtle)" }} />
            <div>
              <p className="font-bold text-sm mb-1" style={{ color: "var(--text-2)" }}>Aucun projet trouvé</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Essayez d&apos;autres filtres</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-5 items-start">

            {/* ── Liste ── */}
            <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-3">
              {filtered.map((p) => {
                const isSelected = selected?.id === p.id;
                const hasApplied = candidatures.has(p.id);
                const stacks     = p.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
                const sc         = matchScore(devCompetences, p.stack_souhaitee);

                return (
                  <div key={p.id} onClick={() => setSelected(p)} className="card cursor-pointer"
                    style={{
                      padding: "16px", transition: "box-shadow 0.18s, border-color 0.18s",
                      ...(isSelected ? {
                        borderColor: "rgba(244,63,94,0.3)",
                        boxShadow: "0 0 0 3px rgba(244,63,94,0.08), 0 6px 20px rgba(0,0,0,0.07)",
                      } : {}),
                    }}>
                    <div className="flex items-start gap-3.5">
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/profil/${p.profiles_founder?.user_id}`); }}
                        className="shrink-0 hover:opacity-80 transition-opacity">
                        {p.profiles_founder?.avatar_url
                          ? <img src={p.profiles_founder.avatar_url} alt={p.profiles_founder.nom} className="object-cover"
                              style={{ width: 48, height: 48, borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)" }} />
                          : <div style={{ width: 48, height: 48, borderRadius: 14,
                              background: "linear-gradient(135deg, var(--rose-soft) 0%, #f3f0ff 100%)",
                              border: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center",
                              justifyContent: "center", fontSize: 18, fontWeight: 900, color: "var(--rose)" }}>
                              {p.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                            </div>
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <h3 className="font-bold text-[14px] leading-snug" style={{ color: "var(--text)", letterSpacing: "-0.015em" }}>
                            {p.titre}
                          </h3>
                          {hasApplied
                            ? <Check size={13} strokeWidth={2.5} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
                            : sc >= 50 && <span className="text-[11px] font-bold shrink-0" style={{ color: "var(--green)", marginTop: 2 }}>{sc}%</span>
                          }
                        </div>
                        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                          {p.profiles_founder?.nom ?? "Founder"}
                          {p.profiles_founder?.ecole ? ` · ${p.profiles_founder.ecole}` : ""}
                        </p>
                        {p.description && (
                          <p className="text-xs leading-relaxed line-clamp-1 mb-2.5" style={{ color: "var(--text-2)" }}>
                            {p.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3">
                          {stacks.length > 0 && (
                            <span className="text-[11px] font-medium" style={{ color: "var(--subtle)" }}>
                              {stacks.slice(0, 3).join(" · ")}
                            </span>
                          )}
                          {p.deadline && stacks.length > 0 && <span style={{ color: "var(--border-2)", fontSize: 10 }}>·</span>}
                          {p.deadline && <span className="text-[11px]" style={{ color: "var(--subtle)" }}>{p.deadline}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Panneau détail desktop ── */}
            {selected && (
              <div className="hidden lg:block flex-1 sticky top-[60px]">
                <div className="card overflow-hidden">

                  {/* Header */}
                  <div className="p-6 pb-5" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <div className="flex items-start gap-4">
                      <button onClick={() => router.push(`/profil/${selected.profiles_founder?.user_id}`)}
                        className="shrink-0 hover:opacity-80 transition-opacity">
                        {selected.profiles_founder?.avatar_url
                          ? <img src={selected.profiles_founder.avatar_url} alt={selected.profiles_founder.nom} className="object-cover"
                              style={{ width: 56, height: 56, borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)" }} />
                          : <div style={{ width: 56, height: 56, borderRadius: 16,
                              background: "linear-gradient(135deg, var(--rose-soft) 0%, #f3f0ff 100%)",
                              border: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center",
                              justifyContent: "center", fontSize: 22, fontWeight: 900, color: "var(--rose)" }}>
                              {selected.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                            </div>
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => router.push(`/profil/${selected.profiles_founder?.user_id}`)}
                          className="text-left hover:opacity-70 transition-opacity">
                          <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{selected.profiles_founder?.nom ?? "Founder"}</p>
                          {selected.profiles_founder?.ecole && (
                            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{selected.profiles_founder.ecole}</p>
                          )}
                        </button>
                        {/* Founder stats */}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs" style={{ color: "var(--subtle)" }}>
                            {founderProjectCount} projet{founderProjectCount > 1 ? "s" : ""} sur Linkea
                          </span>
                        </div>
                      </div>
                    </div>
                    <h2 className="font-black mt-4 leading-snug"
                      style={{ fontSize: 22, letterSpacing: "-0.025em", color: "var(--text)" }}>
                      {selected.titre}
                    </h2>

                    {/* Méta rapide */}
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} strokeWidth={1.8} style={{ color: "var(--subtle)" }} />
                        <span className="text-xs" style={{ color: "var(--muted)" }}>{timeAgo(selected.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users size={12} strokeWidth={1.8} style={{ color: "var(--subtle)" }} />
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {candCount} candidat{candCount > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Score de compatibilité */}
                  {devCompetences.length > 0 && (
                    <div className="px-6 py-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>
                          COMPATIBILITÉ
                        </p>
                        <p className="text-sm font-black" style={{
                          color: score >= 75 ? "var(--green)" : score >= 40 ? "var(--amber)" : "var(--muted)"
                        }}>
                          {score}%
                        </p>
                      </div>
                      {/* Barre */}
                      <div style={{ height: 5, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 99, transition: "width 0.4s ease",
                          width: `${score}%`,
                          background: score >= 75
                            ? "linear-gradient(90deg, var(--green), #10b981)"
                            : score >= 40
                            ? "linear-gradient(90deg, var(--amber), #f59e0b)"
                            : "linear-gradient(90deg, var(--subtle), var(--muted))",
                        }} />
                      </div>
                      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                        {score >= 75
                          ? "Excellente correspondance avec tes compétences"
                          : score >= 40
                          ? "Bonne base, quelques techs à découvrir"
                          : score > 0
                          ? "Stack différente de tes compétences actuelles"
                          : "Ajoute tes compétences sur ton profil pour voir ce score"
                        }
                      </p>
                    </div>
                  )}

                  {/* Corps */}
                  <div className="p-6 flex flex-col gap-5">
                    <div className="flex flex-col gap-2.5">
                      {selected.stack_souhaitee && (
                        <div className="flex items-baseline gap-3">
                          <span className="text-[11px] font-semibold shrink-0 w-16" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>STACK</span>
                          <span className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
                            {selected.stack_souhaitee.split(",").map((s) => s.trim()).filter(Boolean).join("  ·  ")}
                          </span>
                        </div>
                      )}
                      {selected.deadline && (
                        <div className="flex items-baseline gap-3">
                          <span className="text-[11px] font-semibold shrink-0 w-16" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>DEADLINE</span>
                          <span className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{selected.deadline}</span>
                        </div>
                      )}
                    </div>

                    {selected.description && (
                      <div style={{ paddingTop: 4, borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                          {selected.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  {role === "developer" && (
                    <div className="px-6 pb-6">
                      <button
                        onClick={() => { if (!candidatures.has(selected.id)) handleCandidater(selected.id); }}
                        disabled={candidatures.has(selected.id) || applying === selected.id}
                        className={cn(
                          "w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
                          !candidatures.has(selected.id) && applying !== selected.id && "btn-primary"
                        )}
                        style={candidatures.has(selected.id) ? {
                          background: "var(--green-soft)", color: "var(--green)", border: "1px solid var(--green-border)",
                        } : undefined}
                      >
                        {applying === selected.id
                          ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                          : candidatures.has(selected.id)
                            ? <><Check size={15} strokeWidth={2.5} /> Candidature envoyée</>
                            : <>Candidater à ce projet <ArrowRight size={15} strokeWidth={2.2} /></>
                        }
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
