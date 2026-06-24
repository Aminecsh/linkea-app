"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import {
  Camera, LogOut, Plus, ArrowRight, Star,
  Calendar, Wrench, FileText, Trash2, CheckCircle, FolderOpen,
  AlertTriangle, Layers, Users, MoreHorizontal, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
};

type Candidature = {
  id: string;
  statut: string;
  project_id: string;
  projects: {
    titre: string;
    description: string;
    stack_souhaitee: string;
    deadline: string;
  };
};

const STATUT_CONFIG: Record<string, { label: string; cls: string; accent: string }> = {
  pending:  { label: "En attente", cls: "tag-amber", accent: "#f59e0b" },
  matched:  { label: "Matchée",    cls: "tag-blue",  accent: "#3b82f6" },
  en_cours: { label: "En cours",   cls: "tag-green", accent: "#10b981" },
  livre:    { label: "Livré",      cls: "tag-gray",  accent: "#a1a1aa" },
};

const STATUT_CAND: Record<string, { label: string; cls: string }> = {
  pending:  { label: "En attente", cls: "tag-amber" },
  accepted: { label: "Accepté",   cls: "tag-green"  },
  refused:  { label: "Refusé",    cls: "tag-red"    },
};

type FilterKey = "all" | "pending" | "active" | "livre";

export default function ProfilPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [ecole, setEcole] = useState("");
  const [competences, setCompetences] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [contractMap, setContractMap] = useState<Record<string, string>>({});
  const [candidateCounts, setCandidateCounts] = useState<Record<string, number>>({});
  const [score, setScore] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      if (r === "founder") {
        const { data: profile } = await supabase
          .from("profiles_founder").select("id, nom, ecole, avatar_url").eq("user_id", user.id).maybeSingle();
        if (!profile) { setLoading(false); return; }
        setNom(profile.nom ?? "");
        setEcole(profile.ecole ?? "");
        setAvatarUrl(profile.avatar_url ?? null);
        setProfileId(profile.id);

        const { data: projs } = await supabase
          .from("projects").select("*").eq("founder_id", profile.id).order("created_at", { ascending: false });
        setProjects(projs ?? []);

        // Comptage des candidats par projet
        const ids = (projs ?? []).map((p) => p.id);
        if (ids.length > 0) {
          const { data: allCands } = await supabase
            .from("candidatures").select("project_id").in("project_id", ids);
          const counts: Record<string, number> = {};
          (allCands ?? []).forEach((c) => {
            counts[c.project_id] = (counts[c.project_id] ?? 0) + 1;
          });
          setCandidateCounts(counts);
        }

        const { data: contracts } = await supabase.from("contracts").select("id, project_id").eq("founder_id", profile.id);
        const map: Record<string, string> = {};
        (contracts ?? []).forEach((c) => { map[c.project_id] = c.id; });
        setContractMap(map);
      }

      if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id, nom, ecole, competences, avatar_url").eq("user_id", user.id).maybeSingle();
        if (!profile) { setLoading(false); return; }
        setNom(profile.nom ?? "");
        setEcole(profile.ecole ?? "");
        setCompetences(profile.competences ?? []);
        setAvatarUrl(profile.avatar_url ?? null);
        setProfileId(profile.id);

        const { data: cands } = await supabase
          .from("candidatures")
          .select("id, statut, project_id, projects(titre, description, stack_souhaitee, deadline)")
          .eq("developer_id", profile.id)
          .order("created_at", { ascending: false });
        setCandidatures((cands as unknown as Candidature[]) ?? []);

        const { data: devContracts } = await supabase.from("contracts").select("id, project_id").eq("developer_id", profile.id);
        const devMap: Record<string, string> = {};
        (devContracts ?? []).forEach((c) => { devMap[c.project_id] = c.id; });
        setContractMap(devMap);

        const { data: reviews } = await supabase.from("reviews").select("rating").eq("reviewed_id", user.id);
        if (reviews && reviews.length > 0) {
          const avg = reviews.reduce((sum, rv) => sum + rv.rating, 0) / reviews.length;
          setScore(Math.round(avg * 10) / 10);
          setReviewCount(reviews.length);
        }
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId || !profileId || !role) return;
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const table = role === "founder" ? "profiles_founder" : "profiles_developer";
    await supabase.from(table).update({ avatar_url: data.publicUrl }).eq("id", profileId);
    setAvatarUrl(data.publicUrl);
    setUploadingAvatar(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  async function handleDeleteProject(projectId: string) {
    if (!confirm("Supprimer ce projet ? Cette action est irréversible.")) return;
    setMenuOpenId(null);
    await supabase.from("projects").delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  async function handleLivrer(projectId: string) {
    setMenuOpenId(null);
    await supabase.from("projects").update({ statut: "livre" }).eq("id", projectId);
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, statut: "livre" } : p));
    router.push(`/projets/${projectId}/review`);
  }

  // ── Stats founder ──────────────────────────────────────────────────────
  // Uniquement les candidats sur projets encore ouverts (pending)
  const pendingProjectIds = new Set(projects.filter((p) => p.statut === "pending").map((p) => p.id));
  const totalCandidates = Object.entries(candidateCounts)
    .filter(([id]) => pendingProjectIds.has(id))
    .reduce((a, [, b]) => a + b, 0);
  const activeProjects  = projects.filter((p) => p.statut === "matched" || p.statut === "en_cours").length;
  const pendingCount    = projects.filter((p) => p.statut === "pending").length;
  const livreCount      = projects.filter((p) => p.statut === "livre").length;

  // ── Filter tabs ────────────────────────────────────────────────────────
  const TABS: { key: FilterKey; label: string; count: number }[] = [
    { key: "all",     label: "Tous",        count: projects.length },
    { key: "pending", label: "En attente",  count: pendingCount    },
    { key: "active",  label: "Actifs",      count: activeProjects  },
    { key: "livre",   label: "Livrés",      count: livreCount      },
  ];

  const filteredProjects = filter === "all"     ? projects
    : filter === "pending" ? projects.filter((p) => p.statut === "pending")
    : filter === "active"  ? projects.filter((p) => p.statut === "matched" || p.statut === "en_cours")
    : projects.filter((p) => p.statut === "livre");

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="card p-6 mb-5">
            <div className="flex items-center gap-4">
              <div className="skeleton w-14 h-14 rounded-full" />
              <div className="flex-1">
                <div className="skeleton w-32 h-5 mb-2" />
                <div className="skeleton w-24 h-3.5" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
          </div>
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl mb-3" />)}
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!profileId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: "var(--bg)" }}>
        <div className="card p-8 text-center max-w-sm w-full">
          <AlertTriangle size={32} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: "var(--amber)" }} />
          <h1 className="text-lg font-black mb-2" style={{ color: "var(--text)" }}>Profil introuvable</h1>
          <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>Ton profil n'a pas pu être chargé. Essaie de te reconnecter.</p>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }} className="btn-primary w-full mb-3">
            Se reconnecter
          </button>
          <button onClick={() => router.push("/onboarding")} className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Compléter mon profil →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* ── Header profil ── */}
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="relative group cursor-pointer shrink-0" onClick={() => fileInputRef.current?.click()}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={nom} className="avatar w-12 h-12" />
                ) : (
                  <div className="avatar-placeholder w-12 h-12 text-lg">{nom?.[0]?.toUpperCase() ?? "?"}</div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploadingAvatar
                    ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    : <Camera size={14} strokeWidth={2} color="white" />}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </div>
              <button
                onClick={() => userId && router.push(`/profil/${userId}`)}
                className="text-left"
              >
                <h1 className="font-black text-base leading-tight" style={{ color: "var(--text)" }}>{nom}</h1>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{ecole}</p>
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell />
              <button onClick={handleLogout} className="btn-icon" aria-label="Déconnexion">
                <LogOut size={14} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {/* Compétences dev */}
          {role === "developer" && competences.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-3 mt-3" style={{ borderTop: "1px solid var(--border)" }}>
              {competences.map((c) => <span key={c} className="tag tag-blue">{c}</span>)}
            </div>
          )}

          {/* Score dev */}
          {role === "developer" && score !== null && (
            <div className="flex items-center gap-2 pt-3 mt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map((star) => (
                  <Star key={star} size={13} strokeWidth={1.5}
                    fill={star <= Math.round(score) ? "var(--amber)" : "none"}
                    style={{ color: star <= Math.round(score) ? "var(--amber)" : "var(--subtle)" }}
                  />
                ))}
              </div>
              <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{score}/5</span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>({reviewCount} avis)</span>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            FOUNDER SECTION
        ══════════════════════════════════════════════════════════════ */}
        {role === "founder" && (
          <>
            {/* Stats row */}
            {projects.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { icon: Layers,      value: projects.length, label: "Projets",   color: "var(--rose)"   },
                  { icon: Users,       value: totalCandidates, label: "Candidats", color: "var(--blue)"   },
                  { icon: TrendingUp,  value: activeProjects,  label: "Actifs",    color: "var(--green)"  },
                ].map(({ icon: Icon, value, label, color }) => (
                  <div
                    key={label}
                    className="card p-3.5 flex flex-col items-center gap-1 text-center"
                    style={{ borderRadius: 16 }}
                  >
                    <Icon size={15} strokeWidth={1.8} style={{ color }} />
                    <span className="text-xl font-black leading-none" style={{ color: "var(--text)" }}>{value}</span>
                    <span className="text-[10px] font-semibold" style={{ color: "var(--muted)" }}>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Filter tabs */}
            {projects.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide mb-4">
                {TABS.map((tab) => {
                  const active = filter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setFilter(tab.key)}
                      className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150"
                      style={active ? {
                        background: "var(--text)",
                        color: "#fff",
                        boxShadow: "var(--shadow-xs)",
                      } : {
                        background: "#fff",
                        color: "var(--muted)",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      {tab.label}
                      {tab.count > 0 && (
                        <span
                          className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                          style={active
                            ? { background: "rgba(255,255,255,0.18)", color: "#fff" }
                            : { background: "rgba(0,0,0,0.06)", color: "var(--muted)" }
                          }
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {filteredProjects.length === 0 && (
              <div className="card flex flex-col items-center py-16 text-center" style={{ borderRadius: 24 }}>
                <Layers size={36} strokeWidth={1} className="mb-4" style={{ color: "var(--subtle)" }} />
                <p className="font-bold text-sm mb-1" style={{ color: "var(--text-2)" }}>
                  {projects.length === 0 ? "Aucun projet déposé" : "Aucun projet dans cette catégorie"}
                </p>
                <p className="text-xs mb-6" style={{ color: "var(--muted)" }}>
                  {projects.length === 0 ? "Crée ton premier projet pour trouver un dev." : "Essaie un autre filtre."}
                </p>
                {projects.length === 0 && (
                  <button onClick={() => router.push("/projets/nouveau")} className="btn-primary text-sm" style={{ padding: "10px 20px" }}>
                    <Plus size={14} strokeWidth={2.5} /> Déposer un projet
                  </button>
                )}
              </div>
            )}

            {/* Project cards */}
            {filteredProjects.length > 0 && (
              <div className="flex flex-col gap-3">
                {filteredProjects.map((p) => {
                  const s = STATUT_CONFIG[p.statut] ?? { label: p.statut, cls: "tag-gray", accent: "#a1a1aa" };
                  const stacks = p.stack_souhaitee?.split(",").map((st) => st.trim()).filter(Boolean) ?? [];
                  const candCount = candidateCounts[p.id] ?? 0;
                  const isActive = p.statut === "matched" || p.statut === "en_cours";
                  const menuOpen = menuOpenId === p.id;

                  return (
                    <div
                      key={p.id}
                      className="card relative overflow-hidden"
                      style={{ borderRadius: 20 }}
                    >
                      {/* Accent strip gauche */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ background: s.accent }}
                      />

                      <div className="pl-5 pr-4 pt-4 pb-0">
                        {/* Titre + badge statut */}
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <h3 className="font-bold text-[15px] leading-snug flex-1" style={{ color: "var(--text)" }}>
                            {p.titre}
                          </h3>
                          <span className={cn("tag shrink-0", s.cls)} style={{ fontSize: 11 }}>
                            {s.label}
                          </span>
                        </div>

                        {/* Description */}
                        {p.description && (
                          <p className="text-xs leading-relaxed line-clamp-2 mb-3" style={{ color: "var(--muted)" }}>
                            {p.description}
                          </p>
                        )}

                        {/* Chips stack + deadline + candidats */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-4">
                          {stacks.slice(0, 3).map((st) => (
                            <span key={st} className="tag tag-blue" style={{ fontSize: 11 }}>{st}</span>
                          ))}
                          {p.deadline && (
                            <span className="tag tag-amber" style={{ fontSize: 11 }}>
                              <Calendar size={9} strokeWidth={2} />{p.deadline}
                            </span>
                          )}
                          {candCount > 0 && p.statut === "pending" && (
                            <span className="tag tag-rose" style={{ fontSize: 11 }}>
                              <Users size={9} strokeWidth={2} />
                              {candCount} candidat{candCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action bar */}
                      <div
                        className="flex items-center justify-between px-5 py-3"
                        style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}
                      >
                        {/* CTA principal — adapté au statut */}
                        {p.statut === "pending" && candCount === 0 && (
                          <span className="text-xs font-medium" style={{ color: "var(--subtle)" }}>
                            En attente de candidats…
                          </span>
                        )}
                        {p.statut === "pending" && candCount > 0 && (
                          <button
                            onClick={() => router.push(`/projets/${p.id}/candidats`)}
                            className="flex items-center gap-1.5 text-sm font-bold transition-opacity hover:opacity-70"
                            style={{ color: "var(--rose)" }}
                          >
                            {candCount} candidat{candCount > 1 ? "s" : ""} à voir
                            <ArrowRight size={14} strokeWidth={2.2} />
                          </button>
                        )}
                        {(p.statut === "matched" || p.statut === "en_cours") && (
                          <button
                            onClick={() => router.push(`/projets/${p.id}/gestion`)}
                            className="flex items-center gap-1.5 text-sm font-bold transition-opacity hover:opacity-70"
                            style={{ color: "var(--green)" }}
                          >
                            Gestion du projet
                            <ArrowRight size={14} strokeWidth={2.2} />
                          </button>
                        )}
                        {p.statut === "livre" && (
                          <span className="text-xs font-medium" style={{ color: "var(--subtle)" }}>
                            Projet livré
                          </span>
                        )}

                        {/* Menu contextuel ··· */}
                        <div className="relative">
                          <button
                            onClick={() => setMenuOpenId(menuOpen ? null : p.id)}
                            className="btn-icon"
                            style={{ width: 32, height: 32, borderRadius: 10 }}
                          >
                            <MoreHorizontal size={15} strokeWidth={1.8} />
                          </button>

                          {menuOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                              <div
                                className="absolute right-0 bottom-10 z-20 min-w-[160px] rounded-2xl overflow-hidden"
                                style={{
                                  background: "#fff",
                                  border: "1px solid rgba(0,0,0,0.09)",
                                  boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
                                }}
                              >
                                {isActive && (
                                  <button
                                    onClick={() => { setMenuOpenId(null); router.push(`/projets/${p.id}/gestion`); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                                    style={{ color: "var(--text-2)" }}
                                  >
                                    <FolderOpen size={14} strokeWidth={1.8} /> Gestion
                                  </button>
                                )}
                                {contractMap[p.id] && (
                                  <button
                                    onClick={() => { setMenuOpenId(null); router.push(`/contrat/${contractMap[p.id]}`); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                                    style={{ color: "var(--text-2)" }}
                                  >
                                    <FileText size={14} strokeWidth={1.8} /> Contrat
                                  </button>
                                )}
                                {isActive && (
                                  <>
                                    <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />
                                    <button
                                      onClick={() => handleLivrer(p.id)}
                                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-left transition-colors hover:bg-[rgba(16,185,129,0.05)]"
                                      style={{ color: "var(--green)" }}
                                    >
                                      <CheckCircle size={14} strokeWidth={1.8} /> Marquer livré
                                    </button>
                                  </>
                                )}
                                {p.statut === "livre" && contractMap[p.id] && (
                                  <button
                                    onClick={() => { setMenuOpenId(null); router.push(`/contrat/${contractMap[p.id]}`); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                                    style={{ color: "var(--text-2)" }}
                                  >
                                    <FileText size={14} strokeWidth={1.8} /> Voir le contrat
                                  </button>
                                )}
                                <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />
                                <button
                                  onClick={() => handleDeleteProject(p.id)}
                                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-left transition-colors hover:bg-[rgba(239,68,68,0.05)]"
                                  style={{ color: "var(--red)" }}
                                >
                                  <Trash2 size={14} strokeWidth={1.8} /> Supprimer
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            DEVELOPER SECTION (inchangée)
        ══════════════════════════════════════════════════════════════ */}
        {role === "developer" && (
          <>
            <p className="label mb-3">Mes candidatures ({candidatures.length})</p>

            {candidatures.length === 0 ? (
              <div className="card flex flex-col items-center py-16 text-center">
                <Wrench size={32} strokeWidth={1.2} className="mb-3" style={{ color: "var(--subtle)" }} />
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-2)" }}>Aucune candidature</p>
                <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>Explore les projets et candidate !</p>
                <button onClick={() => router.push("/projets")} className="btn-primary text-sm" style={{ padding: "10px 20px" }}>
                  Voir les projets <ArrowRight size={14} strokeWidth={2.2} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {candidatures.map((c) => {
                  const s = STATUT_CAND[c.statut] ?? { label: c.statut, cls: "tag-gray" };
                  const stacks = c.projects.stack_souhaitee?.split(",").map((st) => st.trim()).filter(Boolean) ?? [];
                  return (
                    <div key={c.id} className="card p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-bold text-base leading-snug flex-1" style={{ color: "var(--text)" }}>
                          {c.projects.titre}
                        </h3>
                        <span className={cn("tag shrink-0", s.cls)}>{s.label}</span>
                      </div>
                      {c.projects.description && (
                        <p className="text-sm line-clamp-2 mb-3" style={{ color: "var(--muted)" }}>{c.projects.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {stacks.slice(0, 3).map((st) => <span key={st} className="tag tag-blue">{st}</span>)}
                        {c.projects.deadline && (
                          <span className="tag tag-amber"><Calendar size={10} strokeWidth={2} />{c.projects.deadline}</span>
                        )}
                      </div>
                      {c.statut === "accepted" && contractMap[c.project_id] && (
                        <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                          <button
                            onClick={() => router.push(`/contrat/${contractMap[c.project_id]}`)}
                            className="flex items-center gap-1.5 text-xs font-semibold"
                            style={{ color: "var(--rose)" }}
                          >
                            <FileText size={13} strokeWidth={2} /> Voir le contrat <ArrowRight size={12} strokeWidth={2.2} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>

      {/* FAB — Nouveau projet (founder uniquement) */}
      {role === "founder" && (
        <button
          onClick={() => router.push("/projets/nouveau")}
          className="fixed z-40 flex items-center justify-center"
          style={{
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)",
            right: 20,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #f43f5e, #fb7185)",
            boxShadow: "0 8px 24px rgba(244,63,94,0.35), 0 2px 8px rgba(244,63,94,0.20)",
            color: "white",
            transition: "transform 0.18s ease, box-shadow 0.18s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
            e.currentTarget.style.boxShadow = "0 12px 32px rgba(244,63,94,0.40), 0 4px 12px rgba(244,63,94,0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(244,63,94,0.35), 0 2px 8px rgba(244,63,94,0.20)";
          }}
          aria-label="Nouveau projet"
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      )}

      <BottomNav />
    </div>
  );
}
