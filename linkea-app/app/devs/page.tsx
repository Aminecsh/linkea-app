"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppNav from "@/components/AppNav";
import NotificationBell from "@/components/NotificationBell";
import {
  Search, Clock, Star, Check, AlertTriangle,
  ArrowRight, GitBranch, Link2, ExternalLink,
  Pin, Sparkles, X, TrendingUp, Zap, CalendarClock,
} from "lucide-react";

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
            id: d.id, nom: d.nom, competences: d.competences,
            ecole: d.ecole, dispo_heures_semaine: d.dispo_heures_semaine,
            score: d.score, reviewCount: d.reviewCount,
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

  const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#fff" };

  if (loading) {
    return (
      <div className="pl-sidebar" style={{ minHeight: "100vh", background: C.canvas, paddingBottom: 80 }}>
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.hairline}`, padding: "16px 20px 12px", position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ maxWidth: 672, margin: "0 auto" }}>
            <div style={{ height: 14, width: 80, borderRadius: 6, background: C.hairline, marginBottom: 12 }} />
            <div style={{ height: 40, borderRadius: 10, background: C.hairline, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              {[...Array(5)].map((_, i) => <div key={i} style={{ height: 28, width: 64, borderRadius: 8, background: C.hairline }} />)}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 672, margin: "0 auto", padding: "20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ height: 176, borderRadius: 20, background: C.hairline }} />)}
        </div>
        <AppNav />
      </div>
    );
  }

  return (
    <div className="pl-sidebar" style={{ minHeight: "100vh", background: C.canvas, paddingBottom: 80 }}>
      <style>{`
        .lk-d-input:focus { outline: 2px solid ${C.rose}; outline-offset: -1px; border-color: ${C.rose} !important; }
        .lk-d-chip:focus-visible { outline: 2px solid ${C.rose}; outline-offset: 2px; }
        .lk-d-btn:focus-visible { outline: 2px solid ${C.rose}; outline-offset: 2px; }
        .lk-d-navy:hover:not(:disabled) { background: #2A3252 !important; }
        .lk-d-navy:disabled { opacity: 0.4; }
        .lk-d-ghost:hover { opacity: 0.6; }
      `}</style>

      {/* ── Modal pin ── */}
      {confirmDev && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.40)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 16px", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
          onClick={() => setConfirmDev(null)}
        >
          <div
            style={{ width: "100%", maxWidth: 400, background: C.surface, borderRadius: 24, border: `1px solid ${C.hairline}`, maxHeight: "70vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 32, height: 4, borderRadius: 99, background: C.hairline }} />
            </div>

            <div style={{ overflowY: "auto", padding: "16px 20px 20px", flex: 1 }}>
              {/* Dev row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                {confirmDev.avatar_url ? (
                  <img src={confirmDev.avatar_url} alt={confirmDev.nom}
                    style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: `1px solid ${C.hairline}`, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 600, color: "#fff" }}>{confirmDev.nom?.[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>{confirmDev.nom}</p>
                  {confirmDev.ecole && <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0" }}>{confirmDev.ecole}</p>}
                </div>
                <button onClick={() => setConfirmDev(null)} className="lk-d-btn"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: C.muted, display: "flex", alignItems: "center" }}>
                  <X size={14} strokeWidth={2} />
                </button>
              </div>

              {projects.length > 1 && (
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, marginBottom: 8, display: "block" }}>Sur quel projet ?</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {projects.map((p) => {
                  const pPins    = pinsMap[p.id] ?? new Set();
                  const pLeft    = 3 - pPins.size;
                  const isPinned = pPins.has(confirmDev.id);
                  const active   = modalProjectId === p.id;
                  return (
                    <button key={p.id}
                      onClick={() => !isPinned && pLeft > 0 && setModalProjectId(p.id)}
                      disabled={isPinned || pLeft === 0}
                      className="lk-d-btn"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", borderRadius: 14, textAlign: "left", cursor: isPinned || pLeft === 0 ? "default" : "pointer",
                        background: active ? C.canvas : C.surface,
                        border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.hairline}`,
                        opacity: pLeft === 0 && !isPinned ? 0.45 : 1,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.titre}</p>
                        <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>
                          {isPinned ? "Déjà pinné" : pLeft === 0 ? "Limite atteinte" : `${pLeft} pin${pLeft > 1 ? "s" : ""} restant${pLeft > 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 12 }}>
                        {isPinned
                          ? <Check size={13} strokeWidth={2.5} style={{ color: C.ink }} />
                          : [0,1,2].map((i) => (
                              <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i < pPins.size ? C.rose : C.hairline }} />
                            ))
                        }
                      </div>
                    </button>
                  );
                })}
              </div>

              {modalProjectId && (() => {
                const mp = pinsMap[modalProjectId] ?? new Set();
                const after = 3 - mp.size - 1;
                return after >= 0 ? (
                  <p style={{ fontSize: 11, color: C.muted, textAlign: "center", marginBottom: 4 }}>
                    Il te restera <strong style={{ color: C.ink }}>{after} pin{after > 1 ? "s" : ""}</strong> après ça
                  </p>
                ) : null;
              })()}
            </div>

            <div style={{ padding: "12px 20px 20px", borderTop: `1px solid ${C.hairline}`, flexShrink: 0 }}>
              <button onClick={confirmPin} disabled={pinning || !modalProjectId} className="lk-d-navy lk-d-btn"
                style={{ width: "100%", padding: "13px 0", borderRadius: 12, background: C.rose, color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {pinning
                  ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
                  : <><Pin size={13} strokeWidth={2} /> Pinner ce dev</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header sticky ── */}
      <div style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${C.hairline}`, position: "sticky", top: 0, zIndex: 40, padding: "14px 20px 12px" }}>
        <div style={{ maxWidth: 672, margin: "0 auto" }}>

          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.rose, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={12} strokeWidth={2} /> Trouver un dev
            </p>
            <NotificationBell />
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={14} strokeWidth={2} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            <input type="text" placeholder="Nom, école, compétence..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="lk-d-input"
              style={{ width: "100%", padding: "10px 14px 10px 40px", borderRadius: 10, border: `1px solid ${C.hairline}`, background: C.surface, color: C.ink, fontSize: 13, fontWeight: 500, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            />
          </div>

          {/* Filtres stack + dispo */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 12, scrollbarWidth: "none" }}>
            {STACKS.map((s) => {
              const active = activeStack === s;
              return (
                <button key={s} onClick={() => setActiveStack(active ? null : s)} className="lk-d-chip"
                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer", border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.hairline}`, background: active ? C.ink : C.surface, color: active ? "#fff" : C.muted, transition: "all 0.12s" }}>
                  {s}
                </button>
              );
            })}
            <div style={{ width: 1, flexShrink: 0, margin: "0 2px", background: C.hairline }} />
            {DISPOS.map((d) => {
              const active = activeDispo === d.min;
              return (
                <button key={d.label} onClick={() => setActiveDispo(active ? null : d.min)} className="lk-d-chip"
                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.hairline}`, background: active ? C.ink : C.surface, color: active ? "#fff" : C.muted, transition: "all 0.12s" }}>
                  <Clock size={10} strokeWidth={2} /> {d.label}
                </button>
              );
            })}
          </div>

          {/* Sélecteur projet + pin counter */}
          {projects.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.canvas, color: C.muted, fontSize: 13, fontWeight: 500 }}>
              <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
              Aucun projet en attente — dépose un nouveau projet pour pinner des devs.
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, scrollbarWidth: "none" }}>
                {projects.map((p) => {
                  const pPins  = pinsMap[p.id] ?? new Set();
                  const active = selectedProjectId === p.id;
                  return (
                    <button key={p.id} onClick={() => setSelectedProjectId(p.id)} className="lk-d-chip"
                      style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
                        background: active ? C.ink : C.surface, color: active ? "#fff" : C.muted, border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.hairline}` }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{p.titre}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i < pPins.size ? C.rose : active ? "rgba(255,255,255,0.3)" : C.hairline }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={runAiMatching}
                  disabled={aiLoading || !selectedProjectId}
                  title="Scorer les devs avec l'IA"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: C.rose, color: "#fff", border: "none", cursor: "pointer", opacity: (aiLoading || !selectedProjectId) ? 0.4 : 1 }}
                >
                  {aiLoading
                    ? <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
                    : <span style={{ fontSize: 13, lineHeight: 1 }}>✦</span>
                  }
                  {Object.keys(aiScores).length > 0 ? "Rescorer" : "IA"}
                </button>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, border: `1px solid ${C.hairline}`, background: C.surface, color: pinsLeft === 0 ? C.muted : C.ink }}>
                  <Pin size={11} strokeWidth={2} />
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{pinsLeft} restant{pinsLeft > 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 672, margin: "0 auto", padding: "16px 20px" }}>

        {/* Tri + compteur */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, margin: 0 }}>
            {sortedDevs.length} développeur{sortedDevs.length > 1 ? "s" : ""}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {SORTS.map((s) => {
              const active = sortMode === s.key;
              return (
                <button key={s.key} onClick={() => setSortMode(s.key)} className="lk-d-chip"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer", transition: "all 0.12s",
                    background: active ? C.ink : "transparent", color: active ? "#fff" : C.muted, border: "none" }}>
                  {s.icon} {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {sortedDevs.length === 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 20, padding: "64px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <Search size={32} strokeWidth={1.2} style={{ color: C.muted, marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: "0 0 4px" }}>Aucun développeur trouvé</p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Essaie d'autres filtres</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sortedDevs.map((dev) => {
            const isPinned   = currentPins.has(dev.id);
            const canPin     = !isPinned && pinsLeft > 0 && projects.length > 0;
            const hasApplied = applicantsSet.has(dev.id);
            const isNew      = dev.created_at ? Date.now() - new Date(dev.created_at).getTime() < NEW_THRESHOLD_MS : false;
            const matchedSet = getMatchedStacks(dev, selectedProject);
            const dispo      = dev.dispo_heures_semaine;

            return (
              <div key={dev.id} style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 20, overflow: "hidden" }}>
                <div style={{ padding: "18px 20px 14px" }}>
                  {/* Top: avatar + infos */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <button onClick={() => router.push(`/profil/${dev.user_id}`)} className="lk-d-ghost lk-d-btn"
                      style={{ flexShrink: 0, position: "relative", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      {dev.avatar_url ? (
                        <img src={dev.avatar_url} alt={dev.nom}
                          style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", border: `1px solid ${C.hairline}`, display: "block" }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 600, color: "#fff" }}>{dev.nom?.[0]?.toUpperCase() ?? "?"}</span>
                        </div>
                      )}
                      {isNew && (
                        <span style={{ position: "absolute", top: -4, right: -4, fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 6, background: C.ink, color: "#fff", lineHeight: 1.4 }}>
                          NEW
                        </span>
                      )}
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => router.push(`/profil/${dev.user_id}`)} className="lk-d-ghost lk-d-btn"
                              style={{ fontSize: 15, fontWeight: 700, color: C.ink, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                              {dev.nom}
                            </button>
                            {hasApplied && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.surface, color: C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <TrendingUp size={9} strokeWidth={2} /> Candidaté
                              </span>
                            )}
                          </div>
                          {dev.ecole && (
                            <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dev.ecole}</p>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          {aiScores[dev.id] && (
                            <div
                              title={aiScores[dev.id].reason}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.canvas }}
                            >
                              <span style={{ fontSize: 11, fontWeight: 800, color: C.ink, fontVariantNumeric: "tabular-nums" }}>✦ {aiScores[dev.id].score}%</span>
                            </div>
                          )}
                          {dev.score !== undefined && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Star size={12} strokeWidth={1.5} fill={C.ink} style={{ color: C.ink }} />
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{dev.score}</span>
                              <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>({dev.reviewCount})</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {dispo && (
                        <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Clock size={11} strokeWidth={1.8} style={{ color: C.muted }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{dispo}h/sem</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stack chips */}
                  {(dev.competences ?? []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                      {(dev.competences ?? []).map((c) => {
                        const isMatch = matchedSet.has(c);
                        return (
                          <span key={c} style={{ fontSize: 11, fontWeight: isMatch ? 700 : 500, padding: "3px 9px", borderRadius: 7, border: `1px solid ${C.hairline}`, background: C.surface, color: C.ink, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {isMatch && <Check size={9} strokeWidth={3} style={{ color: C.ink }} />}
                            {c}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Liens */}
                  {(dev.github || dev.linkedin) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                      {dev.github && (
                        <a href={dev.github} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.muted, textDecoration: "none" }}>
                          <GitBranch size={13} strokeWidth={1.8} /> GitHub <ExternalLink size={10} strokeWidth={2} />
                        </a>
                      )}
                      {dev.github && dev.linkedin && <span style={{ color: C.hairline }}>·</span>}
                      {dev.linkedin && (
                        <a href={dev.linkedin} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.muted, textDecoration: "none" }}>
                          <Link2 size={13} strokeWidth={1.8} /> LinkedIn <ExternalLink size={10} strokeWidth={2} />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Action bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 14px", borderTop: `1px solid ${C.hairline}` }}>
                  <button onClick={() => router.push(`/profil/${dev.user_id}`)} className="lk-d-ghost lk-d-btn"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Voir le profil <ArrowRight size={12} strokeWidth={2} />
                  </button>

                  {projects.length > 0 && (
                    <button
                      onClick={() => { if (canPin) { setConfirmDev(dev); setModalProjectId(selectedProjectId); } }}
                      disabled={isPinned || !canPin}
                      className={canPin ? "lk-d-navy lk-d-btn" : "lk-d-btn"}
                      style={isPinned ? {
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                        background: C.surface, border: `1px solid ${C.hairline}`, color: C.muted, cursor: "default",
                      } : canPin ? {
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                        background: C.rose, border: "none", color: "#fff", cursor: "pointer",
                      } : {
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                        background: C.surface, border: `1px solid ${C.hairline}`, color: C.muted, cursor: "not-allowed", opacity: 0.5,
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
      <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
      <AppNav />
    </div>
  );
}
