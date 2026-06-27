"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import {
  Search, Clock, Star, Check, AlertTriangle,
  ArrowRight, GitBranch, Link2, ExternalLink,
  Pin, Sparkles, X, TrendingUp, Zap, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Dev = {
  id: string;
  nom: string;
  ecole?: string;
  competences?: string[];
  dispo_heures_semaine?: number;
  github?: string;
  linkedin?: string;
  user_id: string;
  avatar_url?: string;
  score?: number;
  reviewCount?: number;
  created_at?: string;
};

type Project = {
  id: string;
  titre: string;
  statut: string;
  stack_souhaitee?: string;
};

type SortMode = "pertinence" | "note" | "dispo" | "recent";

const STACKS = ["React", "Node.js", "Flutter", "Python", "Vue.js", "Laravel", "Swift", "Kotlin", "Next.js", "TypeScript"];
const DISPOS = [
  { label: "5h+/sem",  min: 5  },
  { label: "10h+/sem", min: 10 },
  { label: "20h+/sem", min: 20 },
];
const SORTS: { key: SortMode; label: string; icon: React.ReactNode }[] = [
  { key: "pertinence", label: "Pertinence", icon: <Sparkles size={10} strokeWidth={2} /> },
  { key: "note",       label: "Note",        icon: <Star      size={10} strokeWidth={2} /> },
  { key: "dispo",      label: "Dispo",       icon: <Zap       size={10} strokeWidth={2} /> },
  { key: "recent",     label: "Récents",     icon: <CalendarClock size={10} strokeWidth={2} /> },
];

const NEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function getMatchedStacks(dev: Dev, project: Project | undefined): Set<string> {
  if (!project?.stack_souhaitee) return new Set();
  const projectStacks = project.stack_souhaitee.split(",").map((s) => s.trim().toLowerCase());
  const matched = new Set<string>();
  (dev.competences ?? []).forEach((c) => {
    const cLow = c.toLowerCase();
    if (projectStacks.some((ps) => cLow.includes(ps) || ps.includes(cLow))) matched.add(c);
  });
  return matched;
}

function matchScore(dev: Dev, project: Project | undefined): number {
  return getMatchedStacks(dev, project).size;
}

function dispoStyle(h: number): { color: string; bg: string; border: string } {
  if (h >= 20) return { color: "var(--green)",  bg: "var(--green-soft)",  border: "var(--green-border)"  };
  if (h >= 10) return { color: "var(--blue)",   bg: "var(--blue-soft)",   border: "var(--blue-border)"   };
  return              { color: "var(--amber)",  bg: "var(--amber-soft)",  border: "var(--amber-border)"  };
}

export default function DevsPage() {
  const router = useRouter();
  const [devs, setDevs]               = useState<Dev[]>([]);
  const [filtered, setFiltered]       = useState<Dev[]>([]);
  const [search, setSearch]           = useState("");
  const [activeStack, setActiveStack] = useState<string | null>(null);
  const [activeDispo, setActiveDispo] = useState<number | null>(null);
  const [sortMode, setSortMode]       = useState<SortMode>("pertinence");
  const [projects, setProjects]       = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pinsMap, setPinsMap]         = useState<Record<string, Set<string>>>({});
  const [applicantsSet, setApplicantsSet] = useState<Set<string>>(new Set());
  const [founderId, setFounderId]     = useState<string | null>(null);
  const [pinning, setPinning]         = useState(false);
  const [confirmDev, setConfirmDev]   = useState<Dev | null>(null);
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [aiScores, setAiScores]       = useState<Record<string, { score: number; reason: string; strengths: string[]; concern: string | null }>>({});
  const [aiLoading, setAiLoading]     = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "founder") { router.push("/projets"); return; }

      const { data: profile } = await supabase
        .from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
      if (!profile) { setLoading(false); return; }
      setFounderId(profile.id);

      // Projets pending pour le sélecteur de pin
      const { data: projs } = await supabase
        .from("projects")
        .select("id, titre, statut, stack_souhaitee")
        .eq("founder_id", profile.id)
        .eq("statut", "pending")
        .order("created_at", { ascending: false });
      const projList = (projs as Project[]) ?? [];
      setProjects(projList);
      if (projList.length > 0) setSelectedProjectId(projList[0].id);

      // Pins de tous les projets pending
      if (projList.length > 0) {
        const { data: allPins } = await supabase
          .from("pins").select("project_id, developer_id")
          .in("project_id", projList.map((p) => p.id));
        const map: Record<string, Set<string>> = {};
        (allPins ?? []).forEach((pin) => {
          if (!map[pin.project_id]) map[pin.project_id] = new Set();
          map[pin.project_id].add(pin.developer_id);
        });
        setPinsMap(map);
      }

      // Tous les projets du founder (tous statuts) pour détecter les candidats
      const { data: allProjs } = await supabase
        .from("projects").select("id").eq("founder_id", profile.id);
      const allProjIds = (allProjs ?? []).map((p) => p.id);
      if (allProjIds.length > 0) {
        const { data: cands } = await supabase
          .from("candidatures").select("developer_id")
          .in("project_id", allProjIds);
        setApplicantsSet(new Set((cands ?? []).map((c) => c.developer_id)));
      }

      // Devs
      const { data: devsData } = await supabase
        .from("profiles_developer")
        .select("id, nom, ecole, competences, dispo_heures_semaine, github, linkedin, user_id, avatar_url, created_at")
        .order("created_at", { ascending: false });

      const devsWithScore = await Promise.all((devsData ?? []).map(async (d) => {
        const { data: reviews } = await supabase
          .from("reviews").select("rating").eq("reviewed_id", d.user_id);
        const score = reviews && reviews.length > 0
          ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10
          : undefined;
        return { ...d, score, reviewCount: reviews?.length ?? 0 };
      }));

      setDevs(devsWithScore);
      setFiltered(devsWithScore);
      setLoading(false);
    }
    load();
  }, [router]);

  // Filtrage
  useEffect(() => {
    let result = [...devs];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        d.nom.toLowerCase().includes(q) ||
        d.ecole?.toLowerCase().includes(q) ||
        d.competences?.some((c) => c.toLowerCase().includes(q))
      );
    }
    if (activeStack) {
      result = result.filter((d) =>
        d.competences?.some((c) => c.toLowerCase().includes(activeStack.toLowerCase()))
      );
    }
    if (activeDispo !== null) {
      result = result.filter((d) => (d.dispo_heures_semaine ?? 0) >= activeDispo);
    }
    setFiltered(result);
  }, [search, activeStack, activeDispo, devs]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const sortedDevs = useMemo(() => {
    const result = [...filtered];
    switch (sortMode) {
      case "pertinence":
        if (!selectedProject?.stack_souhaitee) return result;
        return result.sort((a, b) => {
          const diff = matchScore(b, selectedProject) - matchScore(a, selectedProject);
          return diff !== 0 ? diff : (b.score ?? 0) - (a.score ?? 0);
        });
      case "note":
        return result.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      case "dispo":
        return result.sort((a, b) => (b.dispo_heures_semaine ?? 0) - (a.dispo_heures_semaine ?? 0));
      case "recent":
        return result.sort((a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        );
    }
  }, [filtered, selectedProject, sortMode]);

  async function confirmPin() {
    if (!confirmDev || !modalProjectId || !founderId || pinning) return;
    setPinning(true);
    const dev     = confirmDev;
    const projId  = modalProjectId;
    const proj    = projects.find((p) => p.id === projId);
    setConfirmDev(null);

    const { error } = await supabase.from("pins").insert({
      project_id: projId,
      founder_id: founderId,
      developer_id: dev.id,
    });

    if (!error) {
      setPinsMap((prev) => {
        const updated  = { ...prev };
        const existing = new Set(updated[projId] ?? []);
        existing.add(dev.id);
        updated[projId] = existing;
        return updated;
      });
      await supabase.from("notifications").insert({
        user_id: dev.user_id,
        type: "pin",
        title: "Un founder s'intéresse à toi",
        body: `Pour le projet "${proj?.titre}" — candidate si ça t'intéresse !`,
        link: `/projets/${projId}`,
      });
    }
    setPinning(false);
  }

  async function runAiMatching() {
    if (!selectedProjectId || aiLoading || sortedDevs.length === 0) return;
    setAiLoading(true);
    setAiScores({});
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/ai/matching", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          projectId: selectedProjectId,
          devs: sortedDevs.slice(0, 15).map((d) => ({
            id: d.id,
            nom: d.nom,
            competences: d.competences,
            ecole: d.ecole,
            dispo_heures_semaine: d.dispo_heures_semaine,
            score: d.score,
            reviewCount: d.reviewCount,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { console.error("[AI Matching]", data.error); return; }
      const map: typeof aiScores = {};
      for (const s of data.scores ?? []) map[s.devId] = s;
      setAiScores(map);
    } catch (e) {
      console.error("[AI Matching]", e);
    } finally {
      setAiLoading(false);
    }
  }

  const currentPins = pinsMap[selectedProjectId ?? ""] ?? new Set<string>();
  const pinCount    = currentPins.size;
  const pinsLeft    = 3 - pinCount;

  if (loading) {
    return (
      <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>
        <div className="page-header px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="skeleton w-16 h-4" />
              <div className="skeleton w-9 h-9 rounded-xl" />
            </div>
            <div className="skeleton w-full h-10 rounded-xl mb-3" />
            <div className="flex gap-2">
              {[...Array(5)].map((_, i) => <div key={i} className="skeleton w-16 h-7 rounded-full" />)}
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>

      {/* ── Modal pin ── */}
      {confirmDev && (
        <div
          className="fixed inset-0 flex items-end justify-center px-4"
          style={{ zIndex: 60, background: "rgba(0,0,0,0.40)", backdropFilter: "blur(4px)", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
          onClick={() => setConfirmDev(null)}
        >
          <div
            className="w-full max-w-sm flex flex-col"
            style={{ background: "#fff", borderRadius: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", maxHeight: "70vh", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3">
              <div className="w-8 h-1 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }} />
            </div>

            <div className="overflow-y-auto px-5 pt-4 pb-5" style={{ flex: 1 }}>
              {/* Dev row */}
              <div className="flex items-center gap-3 mb-4">
                {confirmDev.avatar_url ? (
                  <img src={confirmDev.avatar_url} alt={confirmDev.nom} className="avatar w-11 h-11 shrink-0" />
                ) : (
                  <div className="avatar-placeholder w-11 h-11 text-base shrink-0" style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}>
                    {confirmDev.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-base leading-tight" style={{ color: "var(--text)" }}>{confirmDev.nom}</p>
                  {confirmDev.ecole && <p className="text-xs" style={{ color: "var(--muted)" }}>{confirmDev.ecole}</p>}
                </div>
                <button onClick={() => setConfirmDev(null)} className="btn-icon w-8 h-8 shrink-0">
                  <X size={13} strokeWidth={2} />
                </button>
              </div>

              {/* Sélecteur de projet */}
              {projects.length > 1 && (
                <p className="label mb-2 block">Sur quel projet ?</p>
              )}
              <div className="flex flex-col gap-1.5 mb-4">
                {projects.map((p) => {
                  const pPins    = pinsMap[p.id] ?? new Set();
                  const pLeft    = 3 - pPins.size;
                  const isPinned = pPins.has(confirmDev.id);
                  const active   = modalProjectId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => !isPinned && pLeft > 0 && setModalProjectId(p.id)}
                      disabled={isPinned || pLeft === 0}
                      className="flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all"
                      style={isPinned ? {
                        background: "var(--green-soft)", border: "1px solid var(--green-border)",
                        cursor: "default", opacity: 0.7,
                      } : pLeft === 0 ? {
                        background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
                        cursor: "not-allowed", opacity: 0.5,
                      } : active ? {
                        background: "var(--rose-soft)", border: "1.5px solid var(--rose-border)",
                      } : {
                        background: "var(--bg)", border: "1px solid rgba(0,0,0,0.07)",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate" style={{ color: isPinned ? "var(--green)" : "var(--text)" }}>
                          {p.titre}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                          {isPinned ? "Déjà pinné" : pLeft === 0 ? "Limite atteinte" : `${pLeft} pin${pLeft > 1 ? "s" : ""} restant${pLeft > 1 ? "s" : ""}`}
                        </p>
                      </div>
                      {/* Pin dots */}
                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        {isPinned
                          ? <Check size={13} strokeWidth={2.5} style={{ color: "var(--green)" }} />
                          : [0,1,2].map((i) => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full"
                                style={{ background: i < pPins.size ? "var(--rose)" : "rgba(0,0,0,0.12)" }} />
                            ))
                        }
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pins restants après action */}
              {modalProjectId && (() => {
                const mp = pinsMap[modalProjectId] ?? new Set();
                const after = 3 - mp.size - 1;
                return after >= 0 ? (
                  <p className="text-xs text-center mb-4" style={{ color: "var(--muted)" }}>
                    Il te restera <strong style={{ color: "var(--text)" }}>{after} pin{after > 1 ? "s" : ""}</strong> après ça
                  </p>
                ) : null;
              })()}

            </div>
            {/* Bouton fixe en bas du modal */}
            <div className="px-5 pb-5 pt-3 shrink-0" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
              <button
                onClick={confirmPin}
                disabled={pinning || !modalProjectId}
                className="btn-primary w-full"
                style={{ padding: "13px 0", fontSize: 14 }}
              >
                {pinning
                  ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  : <><Pin size={13} strokeWidth={2} /> Pinner ce dev</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header sticky ── */}
      <div className="page-header px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto">

          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={2} style={{ color: "var(--rose)" }} />
              <span className="label" style={{ color: "var(--rose)" }}>Trouver un dev</span>
            </div>
            <NotificationBell />
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} strokeWidth={2} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--subtle)" }} />
            <input
              type="text"
              placeholder="Nom, école, compétence..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm"
              style={{ paddingLeft: 38, paddingTop: 10, paddingBottom: 10 }}
            />
          </div>

          {/* Filtres stack + dispo */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide mb-3">
            {STACKS.map((s) => (
              <button
                key={s}
                onClick={() => setActiveStack(activeStack === s ? null : s)}
                className={cn("chip", activeStack === s && "chip-active-blue")}
              >
                {s}
              </button>
            ))}
            <div className="w-px shrink-0 mx-0.5" style={{ background: "var(--border-2)" }} />
            {DISPOS.map((d) => (
              <button
                key={d.label}
                onClick={() => setActiveDispo(activeDispo === d.min ? null : d.min)}
                className={cn("chip", activeDispo === d.min && "chip-active-rose")}
              >
                <Clock size={10} strokeWidth={2} />
                {d.label}
              </button>
            ))}
          </div>

          {/* Sélecteur projet + pin counter */}
          {projects.length === 0 ? (
            <div
              className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-medium"
              style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-border)", color: "var(--amber)" }}
            >
              <AlertTriangle size={15} strokeWidth={2} />
              Aucun projet en attente — dépose un nouveau projet pour pinner des devs.
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1">
                {projects.map((p) => {
                  const pPins  = pinsMap[p.id] ?? new Set();
                  const active = selectedProjectId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
                      style={active ? {
                        background: "var(--text)", color: "#fff", boxShadow: "var(--shadow-xs)",
                      } : {
                        background: "#fff", color: "var(--muted)", border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      <span className="truncate max-w-[100px]">{p.titre}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full transition-all"
                            style={{
                              background: i < pPins.size
                                ? "var(--rose)"
                                : active ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.12)",
                            }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={runAiMatching}
                  disabled={aiLoading || !selectedProjectId}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", boxShadow: "0 2px 8px rgba(124,58,237,0.3)" }}
                  title="Scorer les devs avec l'IA"
                >
                  {aiLoading
                    ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <span className="text-sm leading-none">✦</span>
                  }
                  {Object.keys(aiScores).length > 0 ? "Rescorer" : "IA"}
                </button>
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
                  style={pinsLeft === 0 ? {
                    background: "rgba(0,0,0,0.04)", color: "var(--subtle)", border: "1px solid rgba(0,0,0,0.06)",
                  } : {
                    background: "var(--rose-soft)", color: "var(--rose-hover)", border: "1px solid var(--rose-border)",
                  }}
                >
                  <Pin size={11} strokeWidth={2} />
                  <span>{pinsLeft} restant{pinsLeft > 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-4 py-4">

        {/* Barre tri + compteur */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
            {sortedDevs.length} développeur{sortedDevs.length > 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortMode(s.key)}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all"
                style={sortMode === s.key ? {
                  background: "var(--text)", color: "#fff",
                } : {
                  background: "transparent", color: "var(--subtle)",
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {sortedDevs.length === 0 && (
          <div className="card flex flex-col items-center py-16 text-center">
            <Search size={32} strokeWidth={1.2} className="mb-3" style={{ color: "var(--subtle)" }} />
            <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-2)" }}>Aucun développeur trouvé</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Essaie d'autres filtres</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {sortedDevs.map((dev) => {
            const isPinned     = currentPins.has(dev.id);
            const canPin       = !isPinned && pinsLeft > 0 && projects.length > 0;
            const hasApplied   = applicantsSet.has(dev.id);
            const isNew        = dev.created_at
              ? Date.now() - new Date(dev.created_at).getTime() < NEW_THRESHOLD_MS
              : false;
            const matchedSet   = getMatchedStacks(dev, selectedProject);
            const hasMatch     = matchedSet.size > 0;
            const dispo        = dev.dispo_heures_semaine;
            const ds           = dispo ? dispoStyle(dispo) : null;

            return (
              <div
                key={dev.id}
                className="card"
                style={{
                  borderRadius: 20,
                  ...(isPinned ? {
                    borderColor: "rgba(16,185,129,0.20)",
                  } : hasMatch ? {
                    borderColor: "rgba(16,185,129,0.12)",
                  } : {}),
                }}
              >
                <div className="p-5">
                  {/* Top: avatar + infos + badges */}
                  <div className="flex items-start gap-3.5">
                    <button
                      onClick={() => router.push(`/profil/${dev.user_id}`)}
                      className="shrink-0 hover:opacity-80 transition-opacity relative"
                    >
                      {dev.avatar_url ? (
                        <img src={dev.avatar_url} alt={dev.nom} className="avatar w-12 h-12" />
                      ) : (
                        <div className="avatar-placeholder w-12 h-12 text-lg" style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                          {dev.nom?.[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                      {isNew && (
                        <span
                          className="absolute -top-1 -right-1 text-[9px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: "var(--green)", color: "#fff", lineHeight: 1.4 }}
                        >
                          NEW
                        </span>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => router.push(`/profil/${dev.user_id}`)}
                              className="font-bold text-[15px] leading-tight text-left hover:opacity-70 transition-opacity"
                              style={{ color: "var(--text)" }}
                            >
                              {dev.nom}
                            </button>
                            {hasApplied && (
                              <span
                                className="tag"
                                style={{
                                  background: "var(--violet-soft)",
                                  color: "var(--violet)",
                                  border: "1px solid var(--violet-border)",
                                  fontSize: 10,
                                  padding: "2px 8px",
                                }}
                              >
                                <TrendingUp size={9} strokeWidth={2} />
                                Déjà candidaté
                              </span>
                            )}
                          </div>
                          {dev.ecole && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                              {dev.ecole}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {aiScores[dev.id] && (
                            <div
                              className="flex items-center gap-1 px-2 py-1 rounded-lg"
                              style={{
                                background: aiScores[dev.id].score >= 75 ? "rgba(16,185,129,0.1)" : aiScores[dev.id].score >= 50 ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.05)",
                                border: `1px solid ${aiScores[dev.id].score >= 75 ? "rgba(16,185,129,0.2)" : aiScores[dev.id].score >= 50 ? "rgba(245,158,11,0.2)" : "rgba(0,0,0,0.08)"}`,
                              }}
                              title={aiScores[dev.id].reason}
                            >
                              <span className="text-xs font-black" style={{ color: aiScores[dev.id].score >= 75 ? "var(--green)" : aiScores[dev.id].score >= 50 ? "var(--amber)" : "var(--subtle)" }}>
                                ✦ {aiScores[dev.id].score}%
                              </span>
                            </div>
                          )}
                          {dev.score !== undefined && (
                            <div className="flex items-center gap-1">
                              <Star size={12} strokeWidth={1.5} fill="var(--amber)" style={{ color: "var(--amber)" }} />
                              <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{dev.score}</span>
                              <span className="text-xs" style={{ color: "var(--subtle)" }}>({dev.reviewCount})</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {dispo && ds && (
                        <div className="mt-2 inline-flex">
                          <span className="tag" style={{ background: ds.bg, color: ds.color, border: `1px solid ${ds.border}`, fontSize: 11 }}>
                            <Clock size={9} strokeWidth={2} />
                            {dispo}h/sem
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stack chips */}
                  {(dev.competences ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {(dev.competences ?? []).map((c) => {
                        const isMatch = matchedSet.has(c);
                        return (
                          <span
                            key={c}
                            className="tag"
                            style={isMatch ? {
                              background: "var(--green-soft)", color: "var(--green)",
                              border: "1px solid var(--green-border)", fontSize: 11, fontWeight: 700,
                            } : {
                              background: "var(--blue-soft)", color: "var(--blue)",
                              border: "1px solid var(--blue-border)", fontSize: 11,
                            }}
                          >
                            {isMatch && <Check size={9} strokeWidth={3} />}
                            {c}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Liens externes */}
                  {(dev.github || dev.linkedin) && (
                    <div className="flex items-center gap-2 mt-3">
                      {dev.github && (
                        <a
                          href={dev.github} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
                          style={{ color: "var(--muted)" }}
                        >
                          <GitBranch size={13} strokeWidth={1.8} /> GitHub
                          <ExternalLink size={10} strokeWidth={2} />
                        </a>
                      )}
                      {dev.github && dev.linkedin && <span style={{ color: "var(--border-2)" }}>·</span>}
                      {dev.linkedin && (
                        <a
                          href={dev.linkedin} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
                          style={{ color: "var(--muted)" }}
                        >
                          <Link2 size={13} strokeWidth={1.8} /> LinkedIn
                          <ExternalLink size={10} strokeWidth={2} />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Action bar */}
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}
                >
                  <button
                    onClick={() => router.push(`/profil/${dev.user_id}`)}
                    className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
                    style={{ color: "var(--muted)" }}
                  >
                    Voir le profil <ArrowRight size={12} strokeWidth={2.2} />
                  </button>

                  {projects.length > 0 && (
                    <button
                      onClick={() => { if (canPin) { setConfirmDev(dev); setModalProjectId(selectedProjectId); } }}
                      disabled={isPinned || !canPin}
                      className="flex items-center gap-1.5 text-xs font-bold rounded-xl transition-all"
                      style={isPinned ? {
                        padding: "7px 14px",
                        background: "var(--green-soft)", color: "var(--green)",
                        border: "1px solid var(--green-border)", cursor: "default",
                      } : canPin ? {
                        padding: "7px 14px",
                        background: "linear-gradient(135deg, #f43f5e, #fb7185)",
                        color: "white", border: "none", cursor: "pointer",
                        boxShadow: "var(--shadow-rose)",
                      } : {
                        padding: "7px 14px",
                        background: "rgba(0,0,0,0.04)", color: "var(--subtle)",
                        border: "1px solid rgba(0,0,0,0.06)", cursor: "not-allowed",
                      }}
                    >
                      {isPinned ? (
                        <><Check size={11} strokeWidth={2.5} /> Pinné</>
                      ) : pinsLeft === 0 ? (
                        "Limite atteinte"
                      ) : (
                        <><Pin size={11} strokeWidth={2} /> Pinner</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
