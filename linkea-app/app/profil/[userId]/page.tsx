"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Star, Clock, GitBranch, Link2, ExternalLink,
  MessageCircle, Pencil, Briefcase, GraduationCap, Check,
  Award, Zap, Pin, X, ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Experience     = { id: string; titre: string; entreprise: string; date_debut: string; date_fin?: string; description?: string; };
type Formation      = { id: string; diplome: string; etablissement: string; annee?: string; description?: string; };
type DevProfile     = { id: string; user_id: string; nom: string; ecole?: string; bio?: string; competences?: string[]; dispo_heures_semaine?: number; github?: string; linkedin?: string; avatar_url?: string; experiences?: Experience[]; formation?: Formation[]; };
type FounderProfile = { id: string; user_id: string; nom: string; ecole?: string; bio?: string; avatar_url?: string; experiences?: Experience[]; formation?: Formation[]; };
type Review         = { id: string; rating: number; comment?: string | null; created_at: string; reviewer_id: string; project_id: string; project_titre?: string; reviewer_nom?: string; reviewer_role?: string; };
type Project        = { id: string; titre: string; statut: string; stack_souhaitee?: string; deadline?: string; };
type PinProject     = { id: string; titre: string; pinsCount: number; alreadyPinned: boolean; };

const RATING_LABEL  = ["", "Décevant", "Passable", "Bien", "Très bien", "Excellent !"];
const FR_STOP       = new Set(["avec","pour","dans","une","des","les","pas","mais","tout","très","bien","plus","aussi","cette","donc","avoir","être","cela","fait","même","comme","nous","vous","ils","elles","leur","leurs","sont","était","quand","sans","plus","quoi","dont","cette","celui","celle"]);

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function extractKeywords(reviews: Review[]): { word: string; count: number }[] {
  const freq: Record<string, number> = {};
  reviews.forEach((r) => {
    if (!r.comment) return;
    r.comment.toLowerCase()
      .replace(/[^a-zàâçéèêëîïôûùüÿæœ\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !FR_STOP.has(w))
      .forEach((w) => { freq[w] = (freq[w] ?? 0) + 1; });
  });
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);
}

function StarRating({ rating, count, size = "sm" }: { rating: number; count?: number; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? 16 : 12;
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map((s) => (
          <Star key={s} size={sz} strokeWidth={1.5}
            fill={s <= rating ? "var(--amber)" : "transparent"}
            style={{ color: s <= rating ? "var(--amber)" : "rgba(0,0,0,0.12)" }} />
        ))}
      </div>
      {count !== undefined && <span style={{ fontSize: 11, color: "var(--subtle)" }}>({count})</span>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function PublicProfilePage() {
  const router     = useRouter();
  const { userId } = useParams<{ userId: string }>();

  const [targetRole, setTargetRole]         = useState<string | null>(null);
  const [devProfile, setDevProfile]         = useState<DevProfile | null>(null);
  const [founderProfile, setFounderProfile] = useState<FounderProfile | null>(null);
  const [reviews, setReviews]               = useState<Review[]>([]);
  const [projects, setProjects]             = useState<Project[]>([]);
  const [score, setScore]                   = useState<number | null>(null);
  const [loading, setLoading]               = useState(true);
  const [isMe, setIsMe]                     = useState(false);
  const [convId, setConvId]                 = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [showMiniHeader, setShowMiniHeader] = useState(false);

  // Pin flow (founder → dev)
  const [myFounderId, setMyFounderId]     = useState<string | null>(null);
  const [pinProjects, setPinProjects]     = useState<PinProject[]>([]);
  const [showPinModal, setShowPinModal]   = useState(false);
  const [pinProjectId, setPinProjectId]  = useState<string | null>(null);
  const [pinLoading, setPinLoading]       = useState(false);
  const [pinLoadingModal, setPinLoadingModal] = useState(false);
  const [pinDone, setPinDone]             = useState(false);

  // Scroll listener for mini-header
  useEffect(() => {
    const handler = () => setShowMiniHeader(window.scrollY > 190);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      let currentUserId: string | null = null;

      if (user) {
        currentUserId = user.id;
        if (user.id === userId) setIsMe(true);
        const { data: myRole } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
        setCurrentUserRole(myRole?.role ?? null);

        if (myRole?.role === "founder") {
          const { data: fp } = await supabase
            .from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
          if (fp) setMyFounderId(fp.id);
        }
      }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      if (!roleData) { router.push("/"); return; }
      setTargetRole(roleData.role);

      if (roleData.role === "developer") {
        const { data: prof } = await supabase
          .from("profiles_developer")
          .select("id, user_id, nom, ecole, bio, competences, dispo_heures_semaine, github, linkedin, avatar_url, experiences, formation")
          .eq("user_id", userId).maybeSingle();
        if (!prof) { router.push("/"); return; }
        setDevProfile(prof as DevProfile);

        const { data: cands } = await supabase
          .from("candidatures")
          .select("projects(id, titre, statut, stack_souhaitee, deadline)")
          .eq("developer_id", prof.id).eq("statut", "accepted");
        const done = (cands ?? [])
          .map((c) => c.projects as unknown as Project)
          .filter((p) => p && ["livre","termine","matched","en_cours"].includes(p.statut));
        setProjects(done);

        if (currentUserId) {
          const { data: myFounder } = await supabase
            .from("profiles_founder").select("id").eq("user_id", currentUserId).maybeSingle();
          if (myFounder) {
            const { data: conv } = await supabase
              .from("conversations").select("id")
              .eq("founder_id", myFounder.id).eq("developer_id", prof.id).maybeSingle();
            if (conv) setConvId(conv.id);
          }
        }
      } else if (roleData.role === "founder") {
        const { data: prof } = await supabase
          .from("profiles_founder")
          .select("id, user_id, nom, ecole, bio, avatar_url, experiences, formation")
          .eq("user_id", userId).maybeSingle();
        if (!prof) { router.push("/"); return; }
        setFounderProfile(prof as FounderProfile);

        const { data: projs } = await supabase
          .from("projects").select("id, titre, statut, stack_souhaitee, deadline")
          .eq("founder_id", prof.id).order("created_at", { ascending: false });
        setProjects((projs as Project[]) ?? []);

        if (currentUserId) {
          const { data: myDev } = await supabase
            .from("profiles_developer").select("id").eq("user_id", currentUserId).maybeSingle();
          if (myDev) {
            const { data: conv } = await supabase
              .from("conversations").select("id")
              .eq("founder_id", prof.id).eq("developer_id", myDev.id).maybeSingle();
            if (conv) setConvId(conv.id);
          }
        }
      }

      const { data: rawReviews } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, reviewer_id, project_id")
        .eq("reviewed_id", userId).order("created_at", { ascending: false });

      if (rawReviews && rawReviews.length > 0) {
        const avg = rawReviews.reduce((s, r) => s + r.rating, 0) / rawReviews.length;
        setScore(Math.round(avg * 10) / 10);
        const reviewerIds = [...new Set(rawReviews.map((r) => r.reviewer_id))];
        const projectIds  = [...new Set(rawReviews.map((r) => r.project_id))];
        const [{ data: fP }, { data: dP }, { data: pj }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", reviewerIds),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", reviewerIds),
          supabase.from("projects").select("id, titre").in("id", projectIds),
        ]);
        const nameMap: Record<string, { nom: string; role: string }> = {};
        (fP ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "founder" }; });
        (dP ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "developer" }; });
        const projMap: Record<string, string> = {};
        (pj ?? []).forEach((p) => { projMap[p.id] = p.titre; });
        setReviews(rawReviews.map((r) => ({
          ...r,
          reviewer_nom:  nameMap[r.reviewer_id]?.nom ?? "Anonyme",
          reviewer_role: nameMap[r.reviewer_id]?.role,
          project_titre: projMap[r.project_id],
        })));
      }

      setLoading(false);
    }
    load();
  }, [userId, router]);

  // Charge les projets pour pinner (on-demand à l'ouverture du modal)
  async function openPinModal() {
    setShowPinModal(true);
    if (pinProjects.length > 0 || pinLoading) return;
    setPinLoadingModal(true);
    const devId = devProfile?.id;
    if (!myFounderId || !devId) { setPinLoadingModal(false); return; }

    const { data: projs } = await supabase
      .from("projects").select("id, titre")
      .eq("founder_id", myFounderId).eq("statut", "pending");

    if (!projs || projs.length === 0) { setPinProjects([]); setPinLoadingModal(false); return; }

    const { data: allPins } = await supabase
      .from("pins").select("project_id, developer_id")
      .in("project_id", projs.map((p) => p.id));

    const pinsList = projs.map((p) => {
      const projectPins = (allPins ?? []).filter((pin) => pin.project_id === p.id);
      return {
        id: p.id,
        titre: p.titre,
        pinsCount: projectPins.length,
        alreadyPinned: projectPins.some((pin) => pin.developer_id === devId),
      };
    });
    setPinProjects(pinsList);
    if (pinsList.length > 0) setPinProjectId(pinsList[0].id);
    setPinLoadingModal(false);
  }

  async function confirmPin() {
    if (!myFounderId || !pinProjectId || !devProfile || pinLoading) return;
    setPinLoading(true);
    const { error } = await supabase.from("pins").insert({
      project_id: pinProjectId,
      founder_id: myFounderId,
      developer_id: devProfile.id,
    });
    if (!error) {
      const proj = pinProjects.find((p) => p.id === pinProjectId);
      await supabase.from("notifications").insert({
        user_id: devProfile.user_id,
        type: "pin",
        title: "Un founder s'intéresse à toi",
        body: `Pour le projet "${proj?.titre}" — candidate si ça t'intéresse !`,
        link: `/projets/${pinProjectId}`,
      });
      setPinDone(true);
      setPinProjects((prev) => prev.map((p) =>
        p.id === pinProjectId ? { ...p, alreadyPinned: true } : p
      ));
    }
    setPinLoading(false);
    setShowPinModal(false);
  }

  const profile      = devProfile ?? founderProfile;
  const keywords     = useMemo(() => extractKeywords(reviews), [reviews]);
  const isFounder    = targetRole === "founder";
  const isDevProfile = targetRole === "developer";
  const canPin       = currentUserRole === "founder" && isDevProfile && !isMe;
  const alreadyPinned = pinProjects.some((p) => p.alreadyPinned);
  const selectedPinProj = pinProjects.find((p) => p.id === pinProjectId);

  if (loading) {
    return (
      <div className="min-h-screen pb-16" style={{ background: "var(--bg)" }}>
        <div className="h-52 skeleton" style={{ borderRadius: 0 }} />
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-end justify-between -mt-14 mb-5">
            <div className="skeleton w-28 h-28 rounded-full" />
            <div className="skeleton w-28 h-10 rounded-xl" />
          </div>
          <div className="skeleton w-44 h-6 rounded-lg mb-2" />
          <div className="skeleton w-28 h-4 rounded-lg mb-4" />
          <div className="skeleton w-full h-14 rounded-2xl mb-4" />
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl mb-3" />)}
        </div>
      </div>
    );
  }
  if (!profile) return null;

  const accentColor  = isFounder ? "var(--rose)"  : "var(--blue)";
  const accentSoft   = isFounder ? "var(--rose-soft)"  : "var(--blue-soft)";
  const accentBorder = isFounder ? "var(--rose-border)" : "var(--blue-border)";
  const heroBg       = isFounder
    ? "linear-gradient(135deg, #f43f5e 0%, #8b5cf6 100%)"
    : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)";
  const doneProjects   = projects.filter((p) => ["livre","termine"].includes(p.statut));
  const activeProjects = projects.filter((p) => ["pending","matched","en_cours"].includes(p.statut));
  const dispo          = devProfile?.dispo_heures_semaine;
  const isAvailable    = (dispo ?? 0) >= 10;

  // "En un coup d'œil" highlights
  type Highlight = { icon: React.ReactNode; text: string; color: string; bg: string; border: string };
  const highlights: Highlight[] = [
    dispo ? {
      icon: <Zap size={11} strokeWidth={2} />,
      text: `${dispo}h/sem`,
      color: isAvailable ? "var(--green)" : "var(--amber)",
      bg:    isAvailable ? "var(--green-soft)" : "var(--amber-soft)",
      border: isAvailable ? "var(--green-border)" : "var(--amber-border)",
    } : null,
    doneProjects.length > 0 ? {
      icon: <Check size={11} strokeWidth={2.5} />,
      text: `${doneProjects.length} livré${doneProjects.length > 1 ? "s" : ""}`,
      color: "var(--blue)", bg: "var(--blue-soft)", border: "var(--blue-border)",
    } : null,
    score !== null ? {
      icon: <Star size={11} strokeWidth={1.5} fill="var(--amber)" style={{ color: "var(--amber)" }} />,
      text: `${score}/5`,
      color: "var(--amber)", bg: "var(--amber-soft)", border: "var(--amber-border)",
    } : null,
    devProfile?.competences?.[0] ? {
      icon: null,
      text: devProfile.competences[0],
      color: "var(--violet)", bg: "var(--violet-soft)", border: "var(--violet-border)",
    } : null,
  ].filter((h): h is NonNullable<typeof h> => h !== null) as Highlight[];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", paddingBottom: canPin || convId ? 88 : 40 }}>

      {/* ── Modal pin ── */}
      {showPinModal && (
        <div
          className="fixed inset-0 flex items-end justify-center px-4"
          style={{ zIndex: 60, background: "rgba(0,0,0,0.42)", backdropFilter: "blur(4px)", paddingBottom: 24 }}
          onClick={() => setShowPinModal(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden"
            style={{ background: "#fff", borderRadius: 24, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }} />
            </div>
            <div className="px-6 pb-6 pt-3">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="font-black text-lg" style={{ color: "var(--text)" }}>Pinner ce dev</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    Choisir un projet pour envoyer l&apos;invitation
                  </p>
                </div>
                <button onClick={() => setShowPinModal(false)} className="btn-icon w-8 h-8">
                  <X size={14} strokeWidth={2} />
                </button>
              </div>

              {pinLoadingModal ? (
                <div className="flex justify-center py-8">
                  <span className="spinner" />
                </div>
              ) : pinProjects.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-2)" }}>Aucun projet en attente</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Dépose un projet pour pouvoir pinner</p>
                  <button
                    onClick={() => { setShowPinModal(false); router.push("/projets/nouveau"); }}
                    className="btn-primary mt-4 text-sm"
                    style={{ padding: "10px 20px" }}
                  >
                    Créer un projet
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2 mb-5">
                    {pinProjects.map((p) => {
                      const active = pinProjectId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => !p.alreadyPinned && setPinProjectId(p.id)}
                          disabled={p.alreadyPinned}
                          className="flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all"
                          style={p.alreadyPinned ? {
                            background: "var(--green-soft)", border: "1px solid var(--green-border)",
                          } : active ? {
                            background: "var(--rose-soft)", border: "1.5px solid var(--rose-border)",
                          } : {
                            background: "var(--bg)", border: "1px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          <div>
                            <p className="font-semibold text-sm truncate" style={{ color: p.alreadyPinned ? "var(--green)" : "var(--text)" }}>
                              {p.titre}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                              {p.alreadyPinned ? "Déjà pinné" : `${3 - p.pinsCount} pin${3 - p.pinsCount > 1 ? "s" : ""} restant${3 - p.pinsCount > 1 ? "s" : ""}`}
                            </p>
                          </div>
                          {p.alreadyPinned
                            ? <Check size={15} strokeWidth={2.5} style={{ color: "var(--green)", flexShrink: 0 }} />
                            : active && <div className="w-3 h-3 rounded-full shrink-0" style={{ background: "var(--rose)" }} />
                          }
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowPinModal(false)} className="btn-ghost flex-1" style={{ padding: "11px 0", fontSize: 14 }}>
                      Annuler
                    </button>
                    <button
                      onClick={confirmPin}
                      disabled={pinLoading || !pinProjectId || selectedPinProj?.alreadyPinned}
                      className="btn-primary flex-1"
                      style={{ padding: "11px 0", fontSize: 14 }}
                    >
                      {pinLoading
                        ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                        : <><Pin size={13} strokeWidth={2} /> Confirmer</>
                      }
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating back + edit ── */}
      <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 pt-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="btn-icon pointer-events-auto"
            style={{ background: "rgba(255,255,255,0.90)", backdropFilter: "blur(12px)" }}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          {isMe && (
            <button
              onClick={() => router.push("/profil")}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl pointer-events-auto"
              style={{ background: "rgba(255,255,255,0.90)", backdropFilter: "blur(12px)", color: "var(--text)", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "var(--shadow-xs)" }}
            >
              <Pencil size={12} strokeWidth={2} /> Modifier
            </button>
          )}
        </div>
      </div>

      {/* ── Mini-header scroll-triggered ── */}
      <div
        className="fixed top-0 left-0 right-0 z-30 transition-all duration-200"
        style={{
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          transform: showMiniHeader ? "translateY(0)" : "translateY(-100%)",
          opacity: showMiniHeader ? 1 : 0,
        }}
      >
        <div className="max-w-2xl mx-auto px-4 flex items-center gap-3" style={{ height: 56 }}>
          <button onClick={() => router.back()} className="btn-icon shrink-0" style={{ width: 32, height: 32 }}>
            <ArrowLeft size={14} strokeWidth={2} />
          </button>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.nom} className="avatar w-7 h-7 shrink-0" />
          ) : (
            <div className="avatar-placeholder w-7 h-7 text-xs shrink-0" style={{ background: heroBg }}>
              {profile.nom?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate" style={{ color: "var(--text)" }}>{profile.nom}</p>
            {score !== null && <StarRating rating={Math.round(score)} size="sm" />}
          </div>
          <div className="flex gap-2 shrink-0">
            {!isMe && convId && (
              <button
                onClick={() => router.push(`/messages/${convId}`)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl"
                style={{ background: accentSoft, color: accentColor, border: `1px solid ${accentBorder}` }}
              >
                <MessageCircle size={12} strokeWidth={2} /> Message
              </button>
            )}
            {canPin && !pinDone && (
              <button
                onClick={openPinModal}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl"
                style={{ background: "var(--rose-soft)", color: "var(--rose-hover)", border: "1px solid var(--rose-border)" }}
              >
                <Pin size={11} strokeWidth={2} /> Pinner
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden" style={{ height: 210, background: heroBg }}>
        <div className="absolute inset-0 opacity-25" style={{ background: "radial-gradient(ellipse at 25% 60%, rgba(255,255,255,0.4) 0%, transparent 55%)" }} />
        {/* Badge disponible */}
        {isDevProfile && isAvailable && (
          <div className="absolute bottom-4 left-4">
            <span
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", color: "#fff", border: "1px solid rgba(255,255,255,0.30)" }}
            >
              <span className="pulse-ring">
                <span className="w-2 h-2 rounded-full block" style={{ background: "#4ade80" }} />
              </span>
              Disponible
            </span>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4">

        {/* ── Avatar + CTA ── */}
        <div className="flex items-end justify-between -mt-14 mb-4">
          <div className="relative">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.nom} className="w-28 h-28 rounded-full object-cover"
                style={{ border: "4px solid #fff", boxShadow: "var(--shadow-md)" }} />
            ) : (
              <div className="w-28 h-28 rounded-full flex items-center justify-center text-white text-4xl font-black"
                style={{ background: heroBg, border: "4px solid #fff", boxShadow: "var(--shadow-md)" }}>
                {profile.nom?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <span
              className="absolute bottom-1 right-1 text-[10px] font-black px-2 py-0.5 rounded-full"
              style={{ background: accentColor, color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}
            >
              {isFounder ? "Founder" : "Dev"}
            </span>
          </div>
          <div className="flex gap-2 pb-1">
            {!isMe && convId && (
              <button
                onClick={() => router.push(`/messages/${convId}`)}
                className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-2xl"
                style={{ background: accentSoft, color: accentColor, border: `1px solid ${accentBorder}`, boxShadow: "var(--shadow-xs)" }}
              >
                <MessageCircle size={15} strokeWidth={2} /> Message
              </button>
            )}
            {canPin && (
              <button
                onClick={openPinModal}
                className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-2xl"
                style={alreadyPinned || pinDone ? {
                  background: "var(--green-soft)", color: "var(--green)", border: "1px solid var(--green-border)",
                } : {
                  background: "linear-gradient(135deg, #f43f5e, #fb7185)", color: "#fff", boxShadow: "var(--shadow-rose)",
                }}
              >
                {alreadyPinned || pinDone
                  ? <><Check size={14} strokeWidth={2.5} /> Pinné</>
                  : <><Pin size={14} strokeWidth={2} /> Pinner</>
                }
              </button>
            )}
          </div>
        </div>

        {/* ── Identité ── */}
        <div className="mb-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black leading-tight" style={{ color: "var(--text)" }}>{profile.nom}</h1>
              {profile.ecole && <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>{profile.ecole}</p>}
            </div>
            {score !== null && (
              <div className="text-right shrink-0">
                <p className="text-3xl font-black leading-none" style={{ color: "var(--text)" }}>
                  {score}<span className="text-base font-semibold" style={{ color: "var(--subtle)" }}>/5</span>
                </p>
                <StarRating rating={Math.round(score)} count={reviews.length} size="sm" />
              </div>
            )}
          </div>

          {/* Links */}
          {!isFounder && devProfile && (devProfile.github || devProfile.linkedin) && (
            <div className="flex gap-2 mt-2">
              {devProfile.github && (
                <a href={devProfile.github} target="_blank" rel="noreferrer"
                  className="tag transition-opacity hover:opacity-70"
                  style={{ background: "rgba(0,0,0,0.04)", color: "var(--muted)", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <GitBranch size={10} strokeWidth={2} /> GitHub <ExternalLink size={9} strokeWidth={2} />
                </a>
              )}
              {devProfile.linkedin && (
                <a href={devProfile.linkedin} target="_blank" rel="noreferrer"
                  className="tag transition-opacity hover:opacity-70"
                  style={{ background: "var(--blue-soft)", color: "var(--blue)", border: "1px solid var(--blue-border)" }}>
                  <Link2 size={10} strokeWidth={2} /> LinkedIn <ExternalLink size={9} strokeWidth={2} />
                </a>
              )}
            </div>
          )}

          {profile.bio && (
            <p className="text-sm leading-relaxed mt-3" style={{ color: "var(--text-2)" }}>{profile.bio}</p>
          )}
        </div>

        {/* ── "En un coup d'œil" row ── */}
        {highlights.length > 0 && (
          <div
            className="flex items-center gap-0 overflow-x-auto scrollbar-hide my-4 rounded-2xl"
            style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "var(--shadow-xs)" }}
          >
            {highlights.map((h, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-4 py-3 flex-1 justify-center min-w-0"
                style={i > 0 ? { borderLeft: "1px solid rgba(0,0,0,0.06)" } : {}}
              >
                <span style={{ color: h.color, flexShrink: 0 }}>{h.icon}</span>
                <span className="text-xs font-bold truncate" style={{ color: h.color }}>{h.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 pb-4">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { val: projects.length,      label: isFounder ? "Projets" : "Missions" },
              { val: doneProjects.length,  label: "Livrés"  },
              { val: reviews.length,       label: "Avis"    },
            ].map(({ val, label }) => (
              <div key={label} className="card p-4 text-center" style={{ borderRadius: 16 }}>
                <p className="text-2xl font-black" style={{ color: "var(--text)" }}>{val}</p>
                <p className="text-[11px] font-semibold mt-0.5" style={{ color: "var(--muted)" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Stack */}
          {!isFounder && devProfile?.competences && devProfile.competences.length > 0 && (
            <div className="card p-5">
              <h2 className="label mb-3 block">Stack</h2>
              <div className="flex flex-wrap gap-2">
                {devProfile.competences.map((c) => (
                  <span key={c} className="tag"
                    style={{ background: "var(--blue-soft)", color: "var(--blue)", border: "1px solid var(--blue-border)", fontSize: 12, padding: "5px 12px" }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Expériences — timeline */}
          {(profile.experiences ?? []).length > 0 && (
            <div className="card p-5">
              <h2 className="label mb-4 block">Expériences</h2>
              {(profile.experiences ?? []).map((exp, i, arr) => (
                <div key={exp.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full border-2 mt-0.5 shrink-0"
                      style={{ borderColor: accentColor, background: "#fff" }} />
                    {i < arr.length - 1 && (
                      <div className="w-px flex-1 mt-1" style={{ background: "rgba(0,0,0,0.08)", minHeight: 20 }} />
                    )}
                  </div>
                  <div style={i < arr.length - 1 ? { paddingBottom: 20, flex: 1 } : { flex: 1 }}>
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: isFounder ? "var(--rose-soft)" : "var(--blue-soft)" }}>
                        <Briefcase size={13} strokeWidth={1.8} style={{ color: accentColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-tight" style={{ color: "var(--text)" }}>{exp.titre}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{exp.entreprise}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                          {exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}
                        </p>
                        {exp.description && (
                          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-2)" }}>{exp.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formation — timeline */}
          {(profile.formation ?? []).length > 0 && (
            <div className="card p-5">
              <h2 className="label mb-4 block">Formation</h2>
              {(profile.formation ?? []).map((f, i, arr) => (
                <div key={f.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full border-2 mt-0.5 shrink-0"
                      style={{ borderColor: "var(--amber)", background: "#fff" }} />
                    {i < arr.length - 1 && (
                      <div className="w-px flex-1 mt-1" style={{ background: "rgba(0,0,0,0.08)", minHeight: 20 }} />
                    )}
                  </div>
                  <div style={i < arr.length - 1 ? { paddingBottom: 20, flex: 1 } : { flex: 1 }}>
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "var(--amber-soft)" }}>
                        <GraduationCap size={13} strokeWidth={1.8} style={{ color: "var(--amber)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-tight" style={{ color: "var(--text)" }}>{f.diplome}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{f.etablissement}</p>
                        {f.annee && <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>{f.annee}</p>}
                        {f.description && (
                          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-2)" }}>{f.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Projets actifs */}
          {activeProjects.length > 0 && (
            <div className="card p-5">
              <h2 className="label mb-4 block">En cours</h2>
              {activeProjects.map((p, i, arr) => (
                <div key={p.id} className="flex items-center gap-3"
                  style={i < arr.length - 1 ? { paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(0,0,0,0.05)" } : {}}>
                  <div className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: p.statut === "en_cours" ? "var(--green)" : "var(--blue)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{p.titre}</p>
                    {p.stack_souhaitee && <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>{p.stack_souhaitee}</p>}
                  </div>
                  <span className="tag shrink-0"
                    style={p.statut === "en_cours"
                      ? { background: "var(--green-soft)", color: "var(--green)", border: "1px solid var(--green-border)", fontSize: 11 }
                      : { background: "var(--blue-soft)", color: "var(--blue)", border: "1px solid var(--blue-border)", fontSize: 11 }}>
                    {p.statut === "en_cours" ? "En cours" : "Matchée"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Missions livrées */}
          {doneProjects.length > 0 && (
            <div className="card p-5">
              <h2 className="label mb-4 block">{isFounder ? "Projets livrés" : "Missions réalisées"}</h2>
              {doneProjects.map((p, i, arr) => (
                <div key={p.id} className="flex items-center gap-3"
                  style={i < arr.length - 1 ? { paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(0,0,0,0.05)" } : {}}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--green-soft)" }}>
                    <Check size={12} strokeWidth={2.5} style={{ color: "var(--green)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{p.titre}</p>
                    {p.stack_souhaitee && <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>{p.stack_souhaitee}</p>}
                  </div>
                  {p.deadline && <span className="text-xs shrink-0" style={{ color: "var(--subtle)" }}>{p.deadline}</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Avis ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="label">Avis {reviews.length > 0 && `(${reviews.length})`}</h2>
              {score !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black" style={{ color: "var(--text)" }}>{score}</span>
                  <StarRating rating={Math.round(score)} size="sm" />
                </div>
              )}
            </div>

            {/* Keywords highlights */}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {keywords.map(({ word, count }) => (
                  <span key={word}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.09)", color: "var(--text-2)", boxShadow: "var(--shadow-xs)" }}>
                    {word}
                    {count > 1 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: accentSoft, color: accentColor }}>
                        ×{count}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {reviews.length === 0 ? (
              <div className="card flex flex-col items-center py-12 text-center" style={{ borderStyle: "dashed" }}>
                <Award size={32} strokeWidth={1.2} className="mb-3" style={{ color: "var(--subtle)" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>Aucun avis pour l&apos;instant</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Les avis apparaissent après les projets livrés</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {reviews.map((r) => (
                  <div key={r.id} className="card p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <button
                        onClick={() => router.push(`/profil/${r.reviewer_id}`)}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 hover:opacity-80 transition-opacity"
                        style={{ background: r.reviewer_role === "founder" ? "linear-gradient(135deg,#f43f5e,#8b5cf6)" : "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}
                      >
                        {r.reviewer_nom?.[0]?.toUpperCase() ?? "?"}
                      </button>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => router.push(`/profil/${r.reviewer_id}`)}
                          className="font-bold text-sm text-left hover:opacity-70 transition-opacity"
                          style={{ color: "var(--text)" }}>
                          {r.reviewer_nom}
                        </button>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                          {r.reviewer_role === "founder" ? "Founder" : "Développeur"}
                          {r.project_titre && <> · <em>{r.project_titre}</em></>}
                          {" · "}{fmtDate(r.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StarRating rating={r.rating} size="sm" />
                        <p className="text-[11px] font-semibold mt-1" style={{ color: "var(--amber)" }}>
                          {RATING_LABEL[r.rating]}
                        </p>
                      </div>
                    </div>
                    {r.comment && (
                      <p className="text-sm leading-relaxed px-4 py-3 rounded-xl"
                        style={{ background: "var(--bg)", color: "var(--text-2)", borderLeft: `3px solid ${accentColor}` }}>
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Sticky bottom bar ── */}
      {(!isMe && (convId || canPin)) && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-safe"
          style={{
            background: "rgba(255,255,255,0.94)",
            backdropFilter: "blur(24px)",
            borderTop: "1px solid rgba(0,0,0,0.07)",
            paddingTop: 12,
            paddingBottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <div className="max-w-2xl mx-auto flex gap-3">
            {convId && (
              <button
                onClick={() => router.push(`/messages/${convId}`)}
                className="btn-ghost flex-1 text-sm"
                style={{ padding: "12px 0", gap: 8 }}
              >
                <MessageCircle size={15} strokeWidth={2} /> Message
              </button>
            )}
            {canPin && (
              <button
                onClick={alreadyPinned || pinDone ? undefined : openPinModal}
                disabled={alreadyPinned || pinDone}
                className="flex-1 text-sm font-bold flex items-center justify-center gap-2 rounded-2xl transition-all"
                style={alreadyPinned || pinDone ? {
                  padding: "12px 0",
                  background: "var(--green-soft)", color: "var(--green)", border: "1px solid var(--green-border)",
                } : {
                  padding: "12px 0",
                  background: "linear-gradient(135deg, #f43f5e, #fb7185)", color: "white", boxShadow: "var(--shadow-rose)",
                }}
              >
                {alreadyPinned || pinDone
                  ? <><Check size={14} strokeWidth={2.5} /> Pinné</>
                  : <><Pin size={14} strokeWidth={2} /> Pinner ce dev</>
                }
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
