"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { STACKS } from "@/lib/constants/catalog";
import { getAuthUser } from "@/lib/auth";
import { sendEmail } from "@/lib/sendEmail";
import NotificationBell from "@/components/NotificationBell";
import PageTransition from "@/components/PageTransition";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { listContainerVariants, listItemVariants, listItemVariantsNoStagger, STAGGER_LIMIT } from "@/lib/motionVariants";
import { Search, ArrowRight, Check, X, Users, Clock, Sparkles, ChevronDown, MessageCircle, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  created_at: string;
  budget: number | null;
  founder_id?: string;
  profiles_founder: {
    nom: string;
    ecole: string;
    email: string;
    user_id: string;
    avatar_url?: string;
    founder_id?: string;
  };
};

type SortMode = "pertinence" | "recents" | "budget";

const C = { ink: "#1A2138", rose: "#D4537E", roseDark: "#B8436A", muted: "#8A8579", subtle: "#ADA99D", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF", text2: "#454C61" } as const;

// ─── Normalisation des données saisies librement par les clients ──────────────

// "React, Node.js, MongoDB" | "React · Node.js" | "Frontend: React ou Vue.js | Backend: …" → ["React", "Node.js", …]
function parseStack(stack: string | null | undefined): string[] {
  if (!stack) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of stack.split(/[,·|;\n]+/)) {
    const t = raw.trim().replace(/\.$/, "");
    if (!t || t.length > 24 || t.includes(":")) continue; // saute les "Frontend: React ou Vue.js"
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// Teinte de la tuile selon la famille dominante de la stack — palette plate Linkea, faible chroma.
type Tile = { bg: string; blob: string };
const TILES: Record<"web" | "mobile" | "data" | "autre", Tile> = {
  web:    { bg: "#E3EAFB", blob: "rgba(74,123,247,0.16)" },
  mobile: { bg: "#F9E3EB", blob: "rgba(212,83,126,0.14)" },
  data:   { bg: "#E1F4E7", blob: "rgba(52,199,89,0.14)" },
  autre:  { bg: "#FBEEDD", blob: "rgba(255,149,0,0.12)" },
};
function tileFor(stackTokens: string[]): Tile {
  const s = stackTokens.join(" ").toLowerCase();
  if (/flutter|kotlin|swift|react native|firebase|android|ios/.test(s)) return TILES.mobile;
  if (/python|\bia\b|\bai\b|\bml\b|data|tensorflow|pytorch|llm/.test(s)) return TILES.data;
  if (/react|next|node|vue|angular|typescript|javascript|laravel|php|supabase|postgres|mongo|tailwind|html|css|wordpress/.test(s)) return TILES.web;
  return TILES.autre;
}

const FR_MONTHS: Record<string, number> = {
  janv: 0, jan: 0, janvier: 0, fev: 1, fév: 1, févr: 1, fevr: 1, fevrier: 1, février: 1, mars: 2, mar: 2, avr: 3, avril: 3, mai: 4,
  juin: 5, juil: 6, juillet: 6, aout: 7, août: 7, sept: 8, sep: 8, septembre: 8, oct: 9, octobre: 9, nov: 10, novembre: 10, dec: 11, déc: 11, decembre: 11, décembre: 11,
};
function parseFrDate(s: string): Date | null {
  const m = s.trim().toLowerCase().match(/(\d{1,2})(?:er)?\s+([a-zéû]+)\.?\s+(\d{4})/);
  if (!m) return null;
  const month = FR_MONTHS[m[2]];
  if (month === undefined) return null;
  return new Date(Number(m[3]), month, Number(m[1]));
}
// "Du 18 août 2026 au 1 oct. 2026" → "6 semaines" ; "2 mois" / "Flexible" restent tels quels.
function formatDuration(deadline: string | null | undefined): string {
  if (!deadline) return "Flexible";
  const m = deadline.match(/du\s+(.+?)\s+au\s+(.+)/i);
  if (m) {
    const a = parseFrDate(m[1]); const b = parseFrDate(m[2]);
    if (a && b && b > a) {
      const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
      if (days < 14) return `${days} jour${days > 1 ? "s" : ""}`;
      const weeks = Math.round(days / 7);
      if (weeks < 9) return `${weeks} semaine${weeks > 1 ? "s" : ""}`;
      const months = Math.round(days / 30);
      return `${months} mois`;
    }
  }
  return deadline.length > 18 ? "Dates fixes" : deadline;
}

function shortAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.floor(d / 30);
  return `il y a ${mo} mois`;
}
function isNew(iso: string) { return Date.now() - new Date(iso).getTime() < 48 * 3_600_000; }

function matchScore(devCompetences: string[], stack: string): number {
  if (!stack || !devCompetences.length) return 0;
  const techs = parseStack(stack).map((t) => t.toLowerCase());
  if (!techs.length) return 0;
  const matched = techs.filter((t) => devCompetences.some((c) => c.toLowerCase().includes(t) || t.includes(c.toLowerCase())));
  return Math.round((matched.length / techs.length) * 100);
}
function matchedSet(devCompetences: string[], tokens: string[]): Set<string> {
  const s = new Set<string>();
  tokens.forEach((t) => {
    const tl = t.toLowerCase();
    if (devCompetences.some((c) => c.toLowerCase().includes(tl) || tl.includes(c.toLowerCase()))) s.add(t);
  });
  return s;
}
function formatBudget(b: number | null) { return b != null ? `${Math.round(b)} €` : null; }

// ─── Tuile visuelle d'un projet ───────────────────────────────────────────────

function ProjectTile({ p, tokens, score, applied, fresh, size }: {
  p: Project; tokens: string[]; score: number; applied: boolean; fresh: boolean; size: "feature" | "grid";
}) {
  const tile = tileFor(tokens);
  const letter = p.titre?.trim()?.[0]?.toUpperCase() ?? "?";
  const shown = tokens.slice(0, size === "feature" ? 3 : 2);
  const extra = tokens.length - shown.length;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[18px] shrink-0 transition-shadow duration-150 group-hover:shadow-[0_8px_24px_rgba(26,33,56,0.10)]",
        size === "feature" ? "h-[200px] w-full" : "w-24 h-24 sm:w-full sm:h-[150px]"
      )}
      style={{ background: tile.bg }}
    >
      <div className="absolute rounded-full" style={{ right: -40, bottom: -70, width: 220, height: 220, background: tile.blob }} />
      <div className="absolute rounded-full" style={{ left: -30, top: -60, width: 160, height: 160, background: "rgba(255,255,255,0.45)" }} />

      {/* Badge principal (haut gauche) */}
      {applied ? (
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: C.ink }}>
          <Check size={12} strokeWidth={2.5} color="#fff" />
          <span className="hidden sm:inline text-[12px] font-bold text-white">Candidature envoyée</span>
        </div>
      ) : score > 0 ? (
        <div className="absolute left-3 top-3 hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <Sparkles size={12} strokeWidth={2.2} color={C.rose} />
          <span className="text-[12px] font-bold" style={{ color: C.roseDark }}>{score} % compatible</span>
        </div>
      ) : fresh ? (
        <div className="absolute left-3 top-3 hidden sm:inline-flex items-center rounded-full px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <span className="text-[12px] font-bold" style={{ color: C.ink }}>Nouveau</span>
        </div>
      ) : null}

      {/* Technos (haut droite) — masquées sur la tuile compacte mobile */}
      {shown.length > 0 && (
        <div className="absolute right-3 top-3 hidden sm:flex gap-1.5">
          {shown.map((t) => (
            <span key={t} className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.92)", color: C.ink }}>{t}</span>
          ))}
          {extra > 0 && <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.92)", color: C.muted }}>+{extra}</span>}
        </div>
      )}

      <div
        className={cn("absolute font-bold leading-none", size === "feature" ? "left-5 bottom-3.5 text-[64px]" : "left-3 bottom-2 text-[34px] sm:left-5 sm:bottom-3 sm:text-[52px]")}
        style={{ letterSpacing: "-0.05em", color: "rgba(26,33,56,0.85)" }}
      >
        {letter}
      </div>
    </div>
  );
}

function ProjectCard({ p, size, score, applied, candCount, onOpen }: {
  p: Project; size: "feature" | "grid"; score: number; applied: boolean; candCount: number; onOpen: () => void;
}) {
  const tokens = parseStack(p.stack_souhaitee);
  const fresh = isNew(p.created_at);
  const budget = formatBudget(p.budget);
  const founder = p.profiles_founder;
  return (
    <article
      data-testid="project-card"
      onClick={onOpen}
      className={cn("group cursor-pointer", size === "feature" ? "flex flex-col gap-3" : "flex sm:flex-col gap-3.5 sm:gap-3 items-stretch")}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <ProjectTile p={p} tokens={tokens} score={score} applied={applied} fresh={fresh} size={size} />
      <div className="flex flex-col justify-center gap-[3px] min-w-0 flex-1 px-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="truncate font-bold" style={{ fontSize: size === "feature" ? 15.5 : 15, letterSpacing: "-0.02em", color: C.ink }}>{p.titre}</div>
          {budget
            ? <div className="shrink-0 font-bold" style={{ fontSize: 15, color: C.ink }}>{budget}</div>
            : <div className="shrink-0 text-[13px] font-medium" style={{ color: C.muted }}>Budget à définir</div>}
        </div>
        <div className="truncate text-[13px]" style={{ color: C.muted }}>
          {founder?.nom ?? "Client"}{founder?.ecole ? ` · ${founder.ecole}` : ""}
          {size === "grid" && applied && <span className="sm:hidden"> · <span className="font-semibold" style={{ color: C.ink }}>Candidature envoyée</span></span>}
          {size === "grid" && !applied && fresh && <span className="sm:hidden"> · <span className="font-semibold" style={{ color: C.ink }}>Nouveau</span></span>}
        </div>
        <div className="text-[13px]" style={{ color: C.muted }}>
          {formatDuration(p.deadline)} · {candCount} candidat{candCount > 1 ? "s" : ""} · {shortAgo(p.created_at)}
        </div>
        {/* Sur mobile compact, les technos passent sous le texte */}
        {size === "grid" && tokens.length > 0 && (
          <div className="flex sm:hidden gap-1.5 mt-1">
            {tokens.slice(0, 2).map((t) => (
              <span key={t} className="rounded-full px-2 py-[3px] text-[11px] font-semibold" style={{ background: C.surface, border: `1px solid ${C.hairline}`, color: C.ink }}>{t}</span>
            ))}
            {tokens.length > 2 && <span className="rounded-full px-2 py-[3px] text-[11px] font-semibold" style={{ background: C.surface, border: `1px solid ${C.hairline}`, color: C.muted }}>+{tokens.length - 2}</span>}
          </div>
        )}
        {score > 0 && size === "grid" && !applied && (
          <div className="flex sm:hidden items-center gap-1 text-[12px] font-bold" style={{ color: C.roseDark }}>
            <Sparkles size={11} strokeWidth={2.2} /> {score} % compatible
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProjetsPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const reduceMotion = useReducedMotion();

  const [projects,       setProjects]       = useState<Project[]>([]);
  const [search,         setSearch]         = useState("");
  const [activeStacks,   setActiveStacks]   = useState<Set<string>>(new Set());
  const [onlyMyStack,    setOnlyMyStack]    = useState(false);
  const [budgetOnly,     setBudgetOnly]     = useState(false);
  const [sort,           setSort]           = useState<SortMode>("pertinence");
  const [sortOpen,       setSortOpen]       = useState(false);
  const [candidatures,   setCandidatures]   = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(true);
  const [role,           setRole]           = useState<string | null>(null);
  const [developerId,    setDeveloperId]    = useState<string | null>(null);
  const [devCompetences, setDevCompetences] = useState<string[]>([]);
  const [applying,       setApplying]       = useState<string | null>(null);
  const [selected,       setSelected]       = useState<Project | null>(null);
  const [candCounts,     setCandCounts]     = useState<Record<string, number>>({});
  const [founderCounts,  setFounderCounts]  = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      const user = await getAuthUser();
      if (!user) { router.push("/connexion"); return; }
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);
      if (roleData?.role === "founder") { router.push("/profil"); return; }

      if (roleData?.role === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id, competences").eq("user_id", user.id).maybeSingle();
        if (profile) {
          setDeveloperId(profile.id);
          setDevCompetences(profile.competences ?? []);
          const { data: cands } = await supabase.from("candidatures").select("project_id").eq("developer_id", profile.id);
          setCandidatures(new Set(cands?.map((c) => c.project_id) ?? []));
        }
      }

      // Feed public — servi par une route cachée 2 min (identique pour tous les devs)
      const projs = await fetch("/api/projets/public")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.projects ?? null)
        .catch(() => null);
      const p = (projs as Project[]) ?? [];
      setProjects(p);
      if (projectParam) setSelected(p.find((x) => x.id === projectParam) ?? null);
      setLoading(false);

      if (p.length) {
        const ids = p.map((x) => x.id);
        const { data: counts } = await supabase.from("candidatures").select("project_id").in("project_id", ids);
        const map: Record<string, number> = {};
        counts?.forEach((c) => { map[c.project_id] = (map[c.project_id] ?? 0) + 1; });
        setCandCounts(map);

        const founderIds = [...new Set(p.map((x) => x.founder_id).filter(Boolean))] as string[];
        if (founderIds.length) {
          const { data: fProjs } = await supabase.from("projects").select("founder_id").in("founder_id", founderIds);
          const fmap: Record<string, number> = {};
          fProjs?.forEach((fp: { founder_id: string }) => { fmap[fp.founder_id] = (fmap[fp.founder_id] ?? 0) + 1; });
          setFounderCounts(fmap);
        }
      }
    }
    load();
  }, [router, projectParam]);

  // Ferme la fiche avec Échap
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  async function handleCandidater(projectId: string) {
    if (!developerId) return;
    setApplying(projectId);
    await supabase.from("candidatures").insert({ project_id: projectId, developer_id: developerId, statut: "pending" });
    setCandidatures((prev) => new Set([...prev, projectId]));
    setCandCounts((prev) => ({ ...prev, [projectId]: (prev[projectId] ?? 0) + 1 }));
    const projet = projects.find((p) => p.id === projectId);
    const { data: dev } = await supabase.from("profiles_developer").select("nom,email,ecole,competences").eq("id", developerId).maybeSingle();
    if (projet?.profiles_founder?.email && dev) {
      await sendEmail("nouvelle_candidature", projet.profiles_founder.email,
        { projetTitre: projet.titre, projetId: projet.id, devNom: dev.nom, devEcole: dev.ecole, devCompetences: dev.competences?.join(", ") });
    }
    if (projet?.founder_id) {
      const { data: fd } = await supabase.from("profiles_founder").select("user_id").eq("id", projet.founder_id).maybeSingle();
      if (fd?.user_id) await supabase.from("notifications").insert({
        user_id: fd.user_id, type: "nouveau_candidat", title: "Nouveau candidat",
        body: `${dev?.nom ?? "Un dev"} a candidaté sur "${projet?.titre}"`,
        link: `/projets/${projectId}/candidats`,
      });
    }
    setApplying(null);
  }

  // ── Dérivés : scores, filtres, tri, sections ──
  const scores = useMemo(() => {
    const m: Record<string, number> = {};
    projects.forEach((p) => { m[p.id] = matchScore(devCompetences, p.stack_souhaitee); });
    return m;
  }, [projects, devCompetences]);
  const matchCount = useMemo(() => projects.filter((p) => scores[p.id] > 0).length, [projects, scores]);

  const filtered = useMemo(() => {
    let r = [...projects];
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((p) =>
        p.titre.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.stack_souhaitee?.toLowerCase().includes(q) ||
        p.profiles_founder?.ecole?.toLowerCase().includes(q)
      );
    }
    if (activeStacks.size) r = r.filter((p) => {
      const s = p.stack_souhaitee?.toLowerCase() ?? "";
      return [...activeStacks].some((st) => s.includes(st.toLowerCase()));
    });
    if (onlyMyStack) r = r.filter((p) => scores[p.id] > 0);
    if (budgetOnly)  r = r.filter((p) => p.budget != null);
    const byRecent = (a: Project, b: Project) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sort === "recents") r.sort(byRecent);
    else if (sort === "budget") r.sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1) || byRecent(a, b));
    else r.sort((a, b) => (scores[b.id] - scores[a.id]) || byRecent(a, b));
    return r;
  }, [projects, search, activeStacks, onlyMyStack, budgetOnly, sort, scores]);

  const hasFilter = !!(search.trim() || activeStacks.size || onlyMyStack || budgetOnly);
  const pourToi = useMemo(
    () => (hasFilter ? [] : filtered.filter((p) => scores[p.id] > 0).slice(0, 3)),
    [filtered, scores, hasFilter]
  );
  const pourToiIds = new Set(pourToi.map((p) => p.id));
  const rest = filtered.filter((p) => !pourToiIds.has(p.id));

  function resetFilters() { setSearch(""); setActiveStacks(new Set()); setOnlyMyStack(false); setBudgetOnly(false); }
  function toggleStack(s: string) {
    setActiveStacks((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  }

  const SORT_LABEL: Record<SortMode, string> = { pertinence: "Pertinence", recents: "Plus récents", budget: "Budget" };

  // ── Loading : silhouettes de tuiles ──
  if (loading) return (
    <div className="min-h-screen pb-nav pl-sidebar" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1200px] mx-auto px-5 sm:px-10 pt-9 flex flex-col gap-7">
        <div className="flex flex-col gap-2"><div className="skeleton h-8 w-52" /><div className="skeleton h-4 w-80" /></div>
        <div className="flex gap-2">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-9 w-24 !rounded-full" />)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex flex-col gap-3"><div className="skeleton h-[180px] w-full !rounded-[18px]" /><div className="skeleton h-4 w-3/4" /><div className="skeleton h-3 w-1/2" /></div>
          ))}
        </div>
      </div>
    </div>
  );

  const selTokens  = selected ? parseStack(selected.stack_souhaitee) : [];
  const selMatched = selected ? matchedSet(devCompetences, selTokens) : new Set<string>();
  const selScore   = selected ? scores[selected.id] ?? 0 : 0;
  const selTile    = tileFor(selTokens);
  const selApplied = selected ? candidatures.has(selected.id) : false;
  const selCand    = selected ? (candCounts[selected.id] ?? 0) : 0;
  const selFounderProjects = selected?.founder_id ? (founderCounts[selected.founder_id] ?? 1) : 1;

  return (
    <div className="min-h-screen pb-nav pl-sidebar" style={{ background: "var(--bg)" }}>
      <PageTransition>

        {/* ── En-tête ── */}
        <div className="page-header">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-10 pt-6 sm:pt-9 pb-4 flex flex-col gap-4">
            <div className="flex items-start sm:items-end justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <h1 className="font-bold" style={{ fontSize: "clamp(24px, 3vw, 28px)", letterSpacing: "-0.025em", lineHeight: 1.15, color: C.ink }}>Projets ouverts</h1>
                <p className="text-[13px] sm:text-sm" style={{ color: C.muted }}>
                  {projects.length} projet{projects.length > 1 ? "s" : ""} cherche{projects.length > 1 ? "nt" : ""} un dev en ce moment
                  {devCompetences.length > 0 && matchCount > 0 && (
                    <> · <span className="font-semibold" style={{ color: C.rose }}>{matchCount} correspond{matchCount > 1 ? "ent" : ""} à ta stack</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="hidden md:flex items-center gap-2.5 h-11 w-[320px] px-3.5 rounded-[13px] bg-white" style={{ border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
                  <Search size={15} strokeWidth={2} style={{ color: C.subtle, flexShrink: 0 }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un projet, une techno, une école…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm" style={{ color: C.ink }} />
                  {search && <button onClick={() => setSearch("")} aria-label="Effacer"><X size={13} style={{ color: C.subtle }} /></button>}
                </div>
                <NotificationBell />
              </div>
            </div>

            {/* Recherche mobile */}
            <div className="md:hidden flex items-center gap-2.5 h-11 px-3.5 rounded-[13px] bg-white" style={{ border: "1px solid rgba(0,0,0,0.10)" }}>
              <Search size={15} strokeWidth={2} style={{ color: C.subtle, flexShrink: 0 }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Chercher un projet, une techno…"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm" style={{ color: C.ink }} />
              {search && <button onClick={() => setSearch("")} aria-label="Effacer"><X size={13} style={{ color: C.subtle }} /></button>}
            </div>

            {/* Filtres + tri */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 sm:mx-0 sm:px-0">
                {devCompetences.length > 0 && (
                  <button onClick={() => setOnlyMyStack((v) => !v)} className={cn("chip", onlyMyStack && "chip-active-rose")} style={{ padding: "8px 14px", fontSize: 12.5 }}>
                    <Sparkles size={13} strokeWidth={2.2} />
                    Ma stack
                    <span className="rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: onlyMyStack ? C.rose : C.hairline, color: onlyMyStack ? "#fff" : C.muted }}>{matchCount}</span>
                  </button>
                )}
                {STACKS.map((s) => (
                  <button key={s} onClick={() => toggleStack(s)} className={cn("chip", activeStacks.has(s) && "chip-active-blue")} style={{ padding: "8px 14px", fontSize: 12.5 }}>{s}</button>
                ))}
                <button onClick={() => setBudgetOnly((v) => !v)} className="chip" style={{ padding: "8px 14px", fontSize: 12.5, gap: 8 }}>
                  Budget défini
                  <span className="relative inline-block w-[26px] h-4 rounded-full transition-colors" style={{ background: budgetOnly ? C.rose : "#D8D8DE" }}>
                    <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: budgetOnly ? 12 : 2, boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
                  </span>
                </button>
                {hasFilter && (
                  <button onClick={resetFilters} className="inline-flex items-center gap-1 text-xs font-semibold shrink-0" style={{ color: C.rose }}>
                    <X size={11} /> Effacer
                  </button>
                )}
              </div>

              <div className="relative shrink-0 hidden sm:block">
                <button onClick={() => setSortOpen((v) => !v)} className="chip" style={{ padding: "8px 14px", fontSize: 12.5, color: C.ink, gap: 8 }}>
                  <span style={{ color: C.muted, fontWeight: 500 }}>Trier</span>{SORT_LABEL[sort]}
                  <ChevronDown size={13} strokeWidth={2} style={{ color: C.muted }} />
                </button>
                {sortOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-[14px] bg-white p-1.5" style={{ border: `1px solid ${C.hairline}`, boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.04)" }}>
                      {(Object.keys(SORT_LABEL) as SortMode[]).map((k) => (
                        <button key={k} onClick={() => { setSort(k); setSortOpen(false); }}
                          className="w-full flex items-center justify-between rounded-[10px] px-3 py-2 text-[13px] font-medium text-left"
                          style={{ background: sort === k ? C.canvas : "transparent", color: C.ink }}>
                          {SORT_LABEL[k]}{sort === k && <Check size={13} strokeWidth={2.5} style={{ color: C.rose }} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="max-w-[1200px] mx-auto px-5 sm:px-10 pt-7 pb-16 flex flex-col gap-9">

          {filtered.length === 0 ? (
            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col items-center justify-center text-center gap-4 py-24">
              <div className="w-16 h-16 rounded-[20px] flex items-center justify-center" style={{ background: TILES.web.bg }}>
                <Search size={26} strokeWidth={1.6} style={{ color: C.ink }} />
              </div>
              <div>
                <p className="font-bold text-[16px]" style={{ color: C.ink }}>Aucun projet ne correspond</p>
                <p className="text-sm mt-1" style={{ color: C.muted }}>{hasFilter ? "Élargis tes filtres pour voir plus de projets." : "Les prochains projets déposés apparaîtront ici."}</p>
              </div>
              {hasFilter && <button onClick={resetFilters} className="btn-ghost">Tout afficher</button>}
            </motion.div>
          ) : (
            <>
              {/* ── Pour toi ── */}
              {pourToi.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex items-baseline gap-3 min-w-0">
                      <h2 className="font-bold shrink-0" style={{ fontSize: 20, letterSpacing: "-0.025em", color: C.ink }}>Pour toi</h2>
                      <span className="hidden sm:inline text-[13px] truncate" style={{ color: C.muted }}>Les projets où ta stack fait la différence</span>
                    </div>
                    <button onClick={() => router.push("/profil")} className="text-[13px] font-semibold shrink-0" style={{ color: C.rose }}>Modifier ma stack</button>
                  </div>
                  <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                    variants={reduceMotion ? undefined : listContainerVariants} initial={reduceMotion ? undefined : "hidden"} animate={reduceMotion ? undefined : "show"}>
                    {pourToi.map((p) => (
                      <motion.div key={p.id} variants={reduceMotion ? undefined : listItemVariants}>
                        <ProjectCard p={p} size="feature" score={scores[p.id]} applied={candidatures.has(p.id)} candCount={candCounts[p.id] ?? 0} onOpen={() => setSelected(p)} />
                      </motion.div>
                    ))}
                  </motion.div>
                </section>
              )}

              {/* ── Tous les projets ── */}
              {rest.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex items-baseline gap-3">
                    <h2 className="font-bold" style={{ fontSize: 20, letterSpacing: "-0.025em", color: C.ink }}>{pourToi.length > 0 ? "Tous les projets" : hasFilter ? "Résultats" : "Tous les projets"}</h2>
                    <span className="text-[13px]" style={{ color: C.muted }}>{rest.length}{pourToi.length > 0 ? " autres" : ""}</span>
                  </div>
                  <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
                    variants={reduceMotion ? undefined : listContainerVariants} initial={reduceMotion ? undefined : "hidden"} animate={reduceMotion ? undefined : "show"}>
                    {rest.map((p, i) => (
                      <motion.div key={p.id} variants={reduceMotion ? undefined : (i < STAGGER_LIMIT ? listItemVariants : listItemVariantsNoStagger)}>
                        <ProjectCard p={p} size="grid" score={scores[p.id]} applied={candidatures.has(p.id)} candCount={candCounts[p.id] ?? 0} onOpen={() => setSelected(p)} />
                      </motion.div>
                    ))}
                  </motion.div>
                </section>
              )}
            </>
          )}
        </div>
      </PageTransition>

      {/* ── Fiche projet : panneau bas sur mobile, tiroir droit sur desktop ──
          Rendu hors de PageTransition : un ancêtre animé (transform) casserait le position:fixed. */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div key="overlay" className="fixed inset-0 z-[60]" style={{ background: "rgba(26,33,56,0.42)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              onClick={() => setSelected(null)} />
            <motion.div key="sheet"
              className="fixed z-[70] bg-white flex flex-col overflow-hidden left-0 right-0 bottom-0 max-h-[90dvh] rounded-t-[24px] lg:left-auto lg:top-0 lg:bottom-0 lg:right-0 lg:w-[460px] lg:max-h-none lg:rounded-none"
              style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.09), 0 4px 16px rgba(0,0,0,0.04)" }}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              role="dialog" aria-modal="true" aria-label={selected.titre}
            >
              {/* Couverture */}
              <div className="relative shrink-0 overflow-hidden h-[180px] lg:h-[200px]" style={{ background: selTile.bg }}>
                <div className="absolute rounded-full" style={{ right: -40, bottom: -70, width: 240, height: 240, background: selTile.blob }} />
                <div className="absolute rounded-full" style={{ left: -30, top: -60, width: 170, height: 170, background: "rgba(255,255,255,0.45)" }} />
                <div className="absolute lg:hidden left-1/2 -translate-x-1/2 top-2.5 w-9 h-1 rounded-full" style={{ background: "rgba(26,33,56,0.25)" }} />
                <button onClick={() => setSelected(null)} aria-label="Fermer" className="absolute right-3.5 top-3.5 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.92)" }}>
                  <X size={14} strokeWidth={2.2} style={{ color: C.ink }} />
                </button>
                {devCompetences.length > 0 && selScore > 0 && !selApplied && (
                  <div className="absolute left-4 bottom-4 inline-flex items-center gap-1.5 rounded-full px-3 py-[7px]" style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                    <Sparkles size={12} strokeWidth={2.2} color={C.rose} />
                    <span className="text-[12.5px] font-bold" style={{ color: C.roseDark }}>{selScore} % compatible avec ta stack</span>
                  </div>
                )}
                {selApplied && (
                  <div className="absolute left-4 bottom-4 inline-flex items-center gap-1.5 rounded-full px-3 py-[7px]" style={{ background: C.ink }}>
                    <Check size={12} strokeWidth={2.5} color="#fff" />
                    <span className="text-[12.5px] font-bold text-white">Candidature envoyée</span>
                  </div>
                )}
                <div className="absolute right-4 bottom-1.5 font-bold leading-none text-[72px]" style={{ letterSpacing: "-0.05em", color: "rgba(26,33,56,0.85)" }}>
                  {selected.titre?.trim()?.[0]?.toUpperCase() ?? "?"}
                </div>
              </div>

              {/* Contenu */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-5 px-5 pt-5 pb-4">
                <div className="flex flex-col gap-2.5">
                  <h2 className="font-bold" style={{ fontSize: 21, letterSpacing: "-0.025em", lineHeight: 1.2, color: C.ink }}>{selected.titre}</h2>
                  <button onClick={() => router.push(`/profil/${selected.profiles_founder?.user_id}`)} className="flex items-center gap-2.5 text-left hover:opacity-70 transition-opacity">
                    {selected.profiles_founder?.avatar_url
                      ? <img src={selected.profiles_founder.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      : <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: C.ink }}>{selected.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}</div>}
                    <div className="flex flex-col">
                      <span className="text-[13.5px] font-semibold" style={{ color: C.ink }}>{selected.profiles_founder?.nom ?? "Client"}</span>
                      <span className="text-[12px]" style={{ color: C.muted }}>
                        {[selected.profiles_founder?.ecole, `${selFounderProjects} projet${selFounderProjects > 1 ? "s" : ""} sur Linkea`, `publié ${shortAgo(selected.created_at)}`].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { v: formatBudget(selected.budget) ?? "À définir", l: "Budget", icon: Banknote },
                    { v: formatDuration(selected.deadline), l: "Durée", icon: Clock },
                    { v: String(selCand), l: selCand > 1 ? "Candidats" : "Candidat", icon: Users },
                  ].map((k) => (
                    <div key={k.l} className="flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3" style={{ background: C.canvas }}>
                      <span className="font-bold truncate" style={{ fontSize: 16, letterSpacing: "-0.02em", color: C.ink }}>{k.v}</span>
                      <span className="text-[11.5px]" style={{ color: C.muted }}>{k.l}</span>
                    </div>
                  ))}
                </div>

                {selTokens.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[13px] font-semibold" style={{ color: C.ink }}>Stack demandée</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selTokens.map((t) => selMatched.has(t)
                        ? <span key={t} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: "rgba(212,83,126,0.12)", border: "1px solid rgba(212,83,126,0.24)", color: C.roseDark }}><Check size={11} strokeWidth={3} />{t}</span>
                        : <span key={t} className="inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-semibold bg-white" style={{ border: `1px solid ${C.hairline}`, color: C.ink }}>{t}</span>
                      )}
                    </div>
                    {devCompetences.length === 0 && (
                      <p className="text-[12px]" style={{ color: C.muted }}>Ajoute tes compétences sur ton profil pour voir ta compatibilité.</p>
                    )}
                  </div>
                )}

                {selected.description && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-semibold" style={{ color: C.ink }}>Le projet</span>
                    <p className="text-sm leading-[1.6] whitespace-pre-line" style={{ color: C.text2 }}>{selected.description}</p>
                  </div>
                )}
              </div>

              {/* CTA collé en bas */}
              {role === "developer" && (
                <div className="shrink-0 flex items-center gap-2.5 px-5 pt-3.5 pb-[calc(16px+env(safe-area-inset-bottom,0px))] bg-white" style={{ borderTop: `1px solid ${C.hairline}` }}>
                  <button onClick={() => router.push(`/projets/${selected.id}`)} aria-label="Voir la page complète du projet"
                    className="w-12 h-12 shrink-0 flex items-center justify-center rounded-[10px] bg-white" style={{ border: `1px solid ${C.hairline}` }}>
                    <MessageCircle size={18} strokeWidth={2} style={{ color: C.ink }} />
                  </button>
                  <button
                    onClick={() => { if (!selApplied) handleCandidater(selected.id); }}
                    disabled={selApplied || applying === selected.id}
                    className="flex-1 h-12 rounded-[10px] flex items-center justify-center gap-2 text-[15px] font-semibold transition-transform active:scale-[0.98]"
                    style={selApplied
                      ? { background: C.surface, color: C.muted, border: `1px solid ${C.hairline}`, cursor: "default" }
                      : { background: C.rose, color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    {selApplied
                      ? <><Check size={15} strokeWidth={2.5} /> Candidature envoyée</>
                      : applying === selected.id
                        ? <div className="w-4 h-4 rounded-full" style={{ border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
                        : <>Candidater à ce projet <ArrowRight size={15} strokeWidth={2} /></>}
                  </button>
                  <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProjetsPage() {
  return (
    <Suspense fallback={null}>
      <ProjetsPageInner />
    </Suspense>
  );
}
