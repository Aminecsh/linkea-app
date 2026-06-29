"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, ArrowRight, Star, Clock, GitBranch, Link2, ExternalLink,
  MessageCircle, Pencil, Briefcase, GraduationCap, Check,
  Award, Zap, Pin, X, ChevronRight, Flag, Camera, Save, FileText, LogOut,
} from "lucide-react";
import ReportModal from "@/components/ReportModal";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────────
type Experience     = { id: string; titre: string; entreprise: string; date_debut: string; date_fin?: string; description?: string; };
type Formation      = { id: string; diplome: string; etablissement: string; annee?: string; description?: string; };
type DevProfile     = { id: string; user_id: string; nom: string; ecole?: string; bio?: string; competences?: string[]; dispo_heures_semaine?: number; github?: string; linkedin?: string; avatar_url?: string; experiences?: Experience[]; formation?: Formation[]; };
type FounderProfile = { id: string; user_id: string; nom: string; ecole?: string; bio?: string; avatar_url?: string; experiences?: Experience[]; formation?: Formation[]; };
type Review         = { id: string; rating: number; comment?: string | null; created_at: string; reviewer_id: string; project_id: string; project_titre?: string; reviewer_nom?: string; reviewer_role?: string; };
type Project        = { id: string; titre: string; statut: string; stack_souhaitee?: string; deadline?: string; };
type PinProject     = { id: string; titre: string; pinsCount: number; alreadyPinned: boolean; };
type MyCandidature  = { id: string; statut: string; project_id: string; projects: { titre: string; description: string; stack_souhaitee: string; deadline: string; }; };
type MyDevFilterKey = "all" | "pending" | "accepted" | "refused";

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
            fill={s <= rating ? "#1A2138" : "transparent"}
            style={{ color: s <= rating ? "#1A2138" : "#ECE7DD" }} />
        ))}
      </div>
      {count !== undefined && <span style={{ fontSize: 11, color: "var(--subtle)" }}>({count})</span>}
    </div>
  );
}

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#ECE7DD", surface: "#FFFFFF" };

const STATUT_CAND_LABEL: Record<string, string> = { pending: "En attente", accepted: "Acceptée", refused: "Refusée" };
const MY_DEV_TABS: { key: MyDevFilterKey; label: string }[] = [
  { key: "all",      label: "Toutes"     },
  { key: "pending",  label: "En attente" },
  { key: "accepted", label: "Acceptées"  },
  { key: "refused",  label: "Refusées"   },
];

function CandPill({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, border: `1px solid ${C.hairline}`, color: C.muted }}>{children}</span>;
}

function CandStatusPill({ statut }: { statut: string }) {
  const isGood = statut === "accepted";
  const isBad  = statut === "refused";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7,
      border: `1px solid ${isGood ? "rgba(26,33,56,0.25)" : isBad ? "rgba(212,83,126,0.25)" : C.hairline}`,
      color: isGood ? C.ink : isBad ? C.rose : C.muted }}>
      {STATUT_CAND_LABEL[statut] ?? statut}
    </span>
  );
}

function CandTimeline({ statut }: { statut: string }) {
  const steps = ["Candidaté", "Examiné", "Décision"];
  const idx   = statut === "pending" ? 1 : statut === "accepted" || statut === "refused" ? 2 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", paddingTop: 12, marginTop: 12, borderTop: `1px solid ${C.hairline}` }}>
      {steps.map((s, i) => {
        const done    = i < idx;
        const current = i === idx;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", border: `1.5px solid ${done || current ? C.ink : C.hairline}`, background: done ? C.ink : "transparent" }} />
              <span style={{ fontSize: 9, fontWeight: 600, color: done || current ? C.ink : C.muted, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? C.ink : C.hairline, margin: "0 4px", marginBottom: 13 }} />
            )}
          </div>
        );
      })}
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
  const [currentUserId, setCurrentUserId]   = useState<string | null>(null);
  const [showReport, setShowReport]         = useState(false);

  // Edit mode
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [profileId, setProfileId]   = useState<string | null>(null);
  const [editNom, setEditNom]       = useState("");
  const [editEcole, setEditEcole]   = useState("");
  const [editBio, setEditBio]       = useState("");
  const [editGithub, setEditGithub]       = useState("");
  const [editLinkedin, setEditLinkedin]   = useState("");
  const [editDispo, setEditDispo]         = useState<number | "">(0);
  const [editComp, setEditComp]           = useState<string[]>([]);
  const [editExps, setEditExps]           = useState<Experience[]>([]);
  const [editForms, setEditForms]         = useState<Formation[]>([]);
  const [newComp, setNewComp]             = useState("");
  const [editingExp, setEditingExp]       = useState<Experience | null>(null);
  const [editingForm, setEditingForm]     = useState<Formation | null>(null);
  const [showExpModal, setShowExpModal]   = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [expF, setExpF]   = useState({ titre: "", entreprise: "", date_debut: "", date_fin: "", description: "" });
  const [formF, setFormF] = useState({ diplome: "", etablissement: "", annee: "", description: "" });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [myCandidatures, setMyCandidatures]   = useState<MyCandidature[]>([]);
  const [myDevFilter, setMyDevFilter]         = useState<MyDevFilterKey>("all");
  const [myContractMap, setMyContractMap]     = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setCurrentUserId(user.id);
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
        setProfileId(prof.id);

        const { data: cands } = await supabase
          .from("candidatures")
          .select("projects(id, titre, statut, stack_souhaitee, deadline)")
          .eq("developer_id", prof.id).eq("statut", "accepted");
        const done = (cands ?? [])
          .map((c) => c.projects as unknown as Project)
          .filter((p) => p && ["livre","termine","matched","en_cours"].includes(p.statut));
        setProjects(done);

        if (user && user.id === userId) {
          const { data: allCands } = await supabase.from("candidatures")
            .select("id, statut, project_id, projects(titre, description, stack_souhaitee, deadline)")
            .eq("developer_id", prof.id).order("created_at", { ascending: false });
          setMyCandidatures((allCands as unknown as MyCandidature[]) ?? []);
          const { data: devContracts } = await supabase.from("contracts").select("id, project_id").eq("developer_id", prof.id);
          const cMap: Record<string, string> = {};
          (devContracts ?? []).forEach((c) => { cMap[c.project_id] = c.id; });
          setMyContractMap(cMap);
        }

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
        setProfileId(prof.id);

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

  // ── Fonctions édition ────────────────────────────────────────────────────────
  function openEdit() {
    const p = devProfile ?? founderProfile;
    if (!p) return;
    setEditNom(p.nom ?? "");
    setEditEcole(p.ecole ?? "");
    setEditBio(p.bio ?? "");
    setEditGithub(devProfile?.github ?? "");
    setEditLinkedin(devProfile?.linkedin ?? "");
    setEditDispo(devProfile?.dispo_heures_semaine ?? "");
    setEditComp([...(devProfile?.competences ?? [])]);
    setEditExps([...(p.experiences ?? [])]);
    setEditForms([...(p.formation ?? [])]);
    setEditing(true);
  }

  async function saveEdit() {
    if (!profileId || !targetRole) return;
    setSaving(true);
    const table = targetRole === "founder" ? "profiles_founder" : "profiles_developer";
    const base: Record<string, unknown> = { nom: editNom, ecole: editEcole, bio: editBio, experiences: editExps, formation: editForms };
    if (targetRole === "developer") {
      base.github = editGithub; base.linkedin = editLinkedin;
      base.dispo_heures_semaine = editDispo || null; base.competences = editComp;
    }
    await supabase.from(table).update(base).eq("id", profileId);
    if (targetRole === "developer") {
      setDevProfile((prev) => prev ? { ...prev, nom: editNom, ecole: editEcole, bio: editBio, github: editGithub, linkedin: editLinkedin, dispo_heures_semaine: Number(editDispo) || undefined, competences: editComp, experiences: editExps, formation: editForms } : prev);
    } else {
      setFounderProfile((prev) => prev ? { ...prev, nom: editNom, ecole: editEcole, bio: editBio, experiences: editExps, formation: editForms } : prev);
    }
    setSaving(false);
    setEditing(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentUserId || !profileId || !targetRole) return;
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${currentUserId}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const table = targetRole === "founder" ? "profiles_founder" : "profiles_developer";
      await supabase.from(table).update({ avatar_url: publicUrl }).eq("id", profileId);
      if (targetRole === "developer") setDevProfile((p) => p ? { ...p, avatar_url: publicUrl } : p);
      else setFounderProfile((p) => p ? { ...p, avatar_url: publicUrl } : p);
    }
    setUploadingAvatar(false);
  }

  function openExpModal(exp?: Experience) {
    setEditingExp(exp ?? null);
    setExpF({ titre: exp?.titre ?? "", entreprise: exp?.entreprise ?? "", date_debut: exp?.date_debut ?? "", date_fin: exp?.date_fin ?? "", description: exp?.description ?? "" });
    setShowExpModal(true);
  }

  function saveExp() {
    const entry: Experience = { id: editingExp?.id ?? crypto.randomUUID(), titre: expF.titre, entreprise: expF.entreprise, date_debut: expF.date_debut, date_fin: expF.date_fin || undefined, description: expF.description || undefined };
    setEditExps(editingExp ? editExps.map((e) => e.id === editingExp.id ? entry : e) : [...editExps, entry]);
    setShowExpModal(false);
  }

  function openFormModal(f?: Formation) {
    setEditingForm(f ?? null);
    setFormF({ diplome: f?.diplome ?? "", etablissement: f?.etablissement ?? "", annee: f?.annee ?? "", description: f?.description ?? "" });
    setShowFormModal(true);
  }

  function saveForm() {
    const entry: Formation = { id: editingForm?.id ?? crypto.randomUUID(), diplome: formF.diplome, etablissement: formF.etablissement, annee: formF.annee || undefined, description: formF.description || undefined };
    setEditForms(editingForm ? editForms.map((f) => f.id === editingForm.id ? entry : f) : [...editForms, entry]);
    setShowFormModal(false);
  }

  const profile      = devProfile ?? founderProfile;
  const keywords     = useMemo(() => extractKeywords(reviews), [reviews]);
  const isFounder    = targetRole === "founder";
  const isDevProfile = targetRole === "developer";
  const canPin       = currentUserRole === "founder" && isDevProfile && !isMe;
  const alreadyPinned = pinProjects.some((p) => p.alreadyPinned);
  const selectedPinProj = pinProjects.find((p) => p.id === pinProjectId);
  const myDevCandFiltered = myDevFilter === "all" ? myCandidatures : myCandidatures.filter((c) => c.statut === myDevFilter);
  const myDevPending      = myCandidatures.filter((c) => c.statut === "pending").length;
  const myDevAccepted     = myCandidatures.filter((c) => c.statut === "accepted").length;

  // ── Mode édition ─────────────────────────────────────────────────────────────
  if (editing && isMe) {
    const isFounderEdit = targetRole === "founder";
    const prof = devProfile ?? founderProfile;

    const sCard:  React.CSSProperties = { background: "#fff", border: "1px solid #ECE7DD", borderRadius: 16, padding: "20px 20px" };
    const sEye:   React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", margin: "0 0 14px" };
    const sLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#8A8579", display: "block", marginBottom: 6 };
    const sInput: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", fontSize: 13, fontWeight: 500, outline: "none", boxSizing: "border-box" };
    const sNavy:  React.CSSProperties = { background: "#1A2138", color: "#fff", border: "none", borderRadius: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
    const sGhost: React.CSSProperties = { background: "#fff", color: "#1A2138", border: "1px solid #ECE7DD", borderRadius: 12, fontWeight: 600, cursor: "pointer" };
    const sIconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "1px solid #ECE7DD", background: "#fff", color: "#8A8579", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };

    return (
      <div style={{ minHeight: "100vh", background: "#FAF8F4", paddingBottom: 40 }}>
        <style>{`
          .lk-edit-input:focus { outline: 2px solid #D4537E; outline-offset: -1px; border-color: #D4537E !important; }
          .lk-edit-navy:hover  { background: #2A3252 !important; }
          .lk-edit-ghost:hover { border-color: #1A2138 !important; }
          .lk-edit-icon:hover  { background: #FAF8F4 !important; border-color: #1A2138 !important; }
        `}</style>

        {/* Header sticky */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(20px)", borderBottom: "1px solid #ECE7DD", padding: "12px 20px" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => setEditing(false)} className="lk-edit-ghost" style={{ ...sGhost, padding: "8px 14px", fontSize: 13 }}>
              Annuler
            </button>
            <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 16, fontWeight: 600, color: "#1A2138", margin: 0, letterSpacing: "-0.02em" }}>
              Modifier le profil
            </h1>
            <button onClick={saveEdit} disabled={saving} className="lk-edit-navy" style={{ ...sNavy, padding: "8px 16px", fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              <Save size={13} strokeWidth={2} />{saving ? "..." : "Enregistrer"}
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Photo */}
          <div style={sCard}>
            <p style={sEye}>Photo de profil</p>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", cursor: "pointer", flexShrink: 0 }} onClick={() => fileInputRef.current?.click()}>
                <div style={{ width: 72, height: 72, borderRadius: 12, background: "#1A2138", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {prof?.avatar_url
                    ? <img src={prof.avatar_url} alt={prof.nom} style={{ width: 72, height: 72, objectFit: "cover" }} />
                    : <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 28, fontWeight: 600, color: "#fff", userSelect: "none", lineHeight: 1 }}>{prof?.nom?.[0]?.toUpperCase() ?? "?"}</span>
                  }
                </div>
                <div style={{ position: "absolute", inset: 0, borderRadius: 12, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}>
                  <Camera size={16} color="#fff" strokeWidth={2} />
                </div>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="lk-edit-ghost" style={{ ...sGhost, padding: "8px 16px", fontSize: 13 }}>
                {uploadingAvatar ? "Envoi..." : "Changer la photo"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} />
            </div>
          </div>

          {/* Informations */}
          <div style={{ ...sCard, display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={sEye}>Informations</p>
            <div>
              <label style={sLabel}>Nom complet</label>
              <input value={editNom} onChange={(e) => setEditNom(e.target.value)} placeholder="Ton nom" className="lk-edit-input" style={sInput} />
            </div>
            <div>
              <label style={sLabel}>École / Université</label>
              <input value={editEcole} onChange={(e) => setEditEcole(e.target.value)} placeholder="HEC, 42, EPITECH..." className="lk-edit-input" style={sInput} />
            </div>
            <div>
              <label style={sLabel}>Bio</label>
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} maxLength={300} placeholder="Présente-toi..." className="lk-edit-input" style={{ ...sInput, resize: "none" }} />
            </div>
          </div>

          {/* Liens & dispo (dev only) */}
          {!isFounderEdit && (
            <div style={{ ...sCard, display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={sEye}>Liens & disponibilité</p>
              <div>
                <label style={sLabel}>GitHub</label>
                <input value={editGithub} onChange={(e) => setEditGithub(e.target.value)} placeholder="https://github.com/…" className="lk-edit-input" style={sInput} />
              </div>
              <div>
                <label style={sLabel}>LinkedIn</label>
                <input value={editLinkedin} onChange={(e) => setEditLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" className="lk-edit-input" style={sInput} />
              </div>
              <div>
                <label style={sLabel}>Heures disponibles / semaine</label>
                <input type="number" value={editDispo} onChange={(e) => setEditDispo(Number(e.target.value))} placeholder="h/sem" className="lk-edit-input" style={{ ...sInput, width: 120 }} />
              </div>
            </div>
          )}

          {/* Compétences (dev only) */}
          {!isFounderEdit && (
            <div style={{ ...sCard, display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={sEye}>Compétences</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {editComp.map((c) => (
                  <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138" }}>
                    {c}
                    <button onClick={() => setEditComp(editComp.filter((x) => x !== c))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8579", padding: 0, display: "flex", alignItems: "center", lineHeight: 1 }}>
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newComp} onChange={(e) => setNewComp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newComp.trim()) { setEditComp([...editComp, newComp.trim()]); setNewComp(""); } }}
                  placeholder="React, Node.js…" className="lk-edit-input" style={{ ...sInput, flex: 1 }} />
                <button onClick={() => { if (newComp.trim()) { setEditComp([...editComp, newComp.trim()]); setNewComp(""); } }}
                  className="lk-edit-navy" style={{ ...sNavy, padding: "0 18px", fontSize: 18, borderRadius: 10, flexShrink: 0 }}>
                  +
                </button>
              </div>
            </div>
          )}

          {/* Expériences */}
          <div style={sCard}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ ...sEye, margin: 0 }}>Expériences</p>
              <button onClick={() => openExpModal()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#8A8579", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                + Ajouter
              </button>
            </div>
            {editExps.length === 0
              ? <p style={{ fontSize: 13, color: "#8A8579", fontStyle: "italic", margin: 0 }}>Aucune expérience</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {editExps.map((exp) => (
                    <div key={exp.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#FAF8F4", border: "1px solid #ECE7DD" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#1A2138", margin: "0 0 3px" }}>{exp.titre}</p>
                        <p style={{ fontSize: 12, color: "#8A8579", margin: 0 }}>{exp.entreprise} · {exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openExpModal(exp)} className="lk-edit-icon" style={sIconBtn}><Pencil size={11} strokeWidth={2} /></button>
                        <button onClick={() => setEditExps(editExps.filter((e) => e.id !== exp.id))} className="lk-edit-icon" style={sIconBtn}><X size={11} strokeWidth={2.5} /></button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Formation */}
          <div style={sCard}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ ...sEye, margin: 0 }}>Formation</p>
              <button onClick={() => openFormModal()} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#8A8579", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                + Ajouter
              </button>
            </div>
            {editForms.length === 0
              ? <p style={{ fontSize: 13, color: "#8A8579", fontStyle: "italic", margin: 0 }}>Aucune formation</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {editForms.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#FAF8F4", border: "1px solid #ECE7DD" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#1A2138", margin: "0 0 3px" }}>{f.diplome}</p>
                        <p style={{ fontSize: 12, color: "#8A8579", margin: 0 }}>{f.etablissement}{f.annee ? ` · ${f.annee}` : ""}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openFormModal(f)} className="lk-edit-icon" style={sIconBtn}><Pencil size={11} strokeWidth={2} /></button>
                        <button onClick={() => setEditForms(editForms.filter((x) => x.id !== f.id))} className="lk-edit-icon" style={sIconBtn}><X size={11} strokeWidth={2.5} /></button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Actions bas de page */}
          <button onClick={saveEdit} disabled={saving} className="lk-edit-navy" style={{ ...sNavy, width: "100%", justifyContent: "center", padding: "14px 0", fontSize: 14, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
          <button onClick={() => setEditing(false)} className="lk-edit-ghost" style={{ ...sGhost, width: "100%", padding: "12px 0", fontSize: 14, textAlign: "center" }}>
            Annuler
          </button>
        </div>

        {/* Modal expérience */}
        {showExpModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.45)" }}>
            <div style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, fontWeight: 600, color: "#1A2138", margin: 0 }}>{editingExp ? "Modifier" : "Ajouter"} une expérience</h2>
              <input value={expF.titre} onChange={(e) => setExpF({ ...expF, titre: e.target.value })} placeholder="Titre du poste" className="lk-edit-input" style={sInput} />
              <input value={expF.entreprise} onChange={(e) => setExpF({ ...expF, entreprise: e.target.value })} placeholder="Entreprise" className="lk-edit-input" style={sInput} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input value={expF.date_debut} onChange={(e) => setExpF({ ...expF, date_debut: e.target.value })} placeholder="Début" className="lk-edit-input" style={{ ...sInput, fontSize: 12 }} />
                <input value={expF.date_fin} onChange={(e) => setExpF({ ...expF, date_fin: e.target.value })} placeholder="Fin (vide = présent)" className="lk-edit-input" style={{ ...sInput, fontSize: 12 }} />
              </div>
              <textarea value={expF.description} onChange={(e) => setExpF({ ...expF, description: e.target.value })} rows={2} placeholder="Description" className="lk-edit-input" style={{ ...sInput, resize: "none" }} />
              <button onClick={saveExp} className="lk-edit-navy" style={{ ...sNavy, width: "100%", justifyContent: "center", padding: "13px 0", fontSize: 14 }}>Valider</button>
              <button onClick={() => setShowExpModal(false)} className="lk-edit-ghost" style={{ ...sGhost, width: "100%", padding: "11px 0", fontSize: 14, textAlign: "center" }}>Annuler</button>
            </div>
          </div>
        )}

        {/* Modal formation */}
        {showFormModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.45)" }}>
            <div style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 17, fontWeight: 600, color: "#1A2138", margin: 0 }}>{editingForm ? "Modifier" : "Ajouter"} une formation</h2>
              <input value={formF.diplome} onChange={(e) => setFormF({ ...formF, diplome: e.target.value })} placeholder="Diplôme" className="lk-edit-input" style={sInput} />
              <input value={formF.etablissement} onChange={(e) => setFormF({ ...formF, etablissement: e.target.value })} placeholder="École" className="lk-edit-input" style={sInput} />
              <input value={formF.annee} onChange={(e) => setFormF({ ...formF, annee: e.target.value })} placeholder="Année" className="lk-edit-input" style={sInput} />
              <textarea value={formF.description} onChange={(e) => setFormF({ ...formF, description: e.target.value })} rows={2} placeholder="Description" className="lk-edit-input" style={{ ...sInput, resize: "none" }} />
              <button onClick={saveForm} className="lk-edit-navy" style={{ ...sNavy, width: "100%", justifyContent: "center", padding: "13px 0", fontSize: 14 }}>Valider</button>
              <button onClick={() => setShowFormModal(false)} className="lk-edit-ghost" style={{ ...sGhost, width: "100%", padding: "11px 0", fontSize: 14, textAlign: "center" }}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
    <div className="min-h-screen" style={{ background: "#FAF8F4", paddingBottom: canPin || convId ? 88 : 40 }}>

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
                            background: "#FAF8F4", border: "1px solid #ECE7DD", opacity: 0.65,
                          } : active ? {
                            background: "#FAF8F4", border: "1.5px solid #1A2138",
                          } : {
                            background: "#fff", border: "1px solid #ECE7DD",
                          }}
                        >
                          <div>
                            <p className="font-semibold text-sm truncate" style={{ color: "#1A2138" }}>
                              {p.titre}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "#8A8579" }}>
                              {p.alreadyPinned ? "Déjà pinné" : `${3 - p.pinsCount} pin${3 - p.pinsCount > 1 ? "s" : ""} restant${3 - p.pinsCount > 1 ? "s" : ""}`}
                            </p>
                          </div>
                          {p.alreadyPinned
                            ? <Check size={15} strokeWidth={2.5} style={{ color: "#1A2138", flexShrink: 0 }} />
                            : active && <div className="w-3 h-3 rounded-full shrink-0" style={{ background: "#1A2138" }} />
                          }
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowPinModal(false)}
                      style={{ flex: 1, padding: "11px 0", fontSize: 14, fontWeight: 600, borderRadius: 12, border: "1px solid #ECE7DD", background: "#fff", color: "#8A8579", cursor: "pointer" }}>
                      Annuler
                    </button>
                    <button
                      onClick={confirmPin}
                      disabled={pinLoading || !pinProjectId || selectedPinProj?.alreadyPinned}
                      style={{ flex: 1, padding: "11px 0", fontSize: 14, fontWeight: 700, borderRadius: 12, background: "#1A2138", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (pinLoading || !pinProjectId || selectedPinProj?.alreadyPinned) ? 0.4 : 1 }}
                    >
                      {pinLoading
                        ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "lk-spin 0.8s linear infinite" }} />
                        : <><Pin size={13} strokeWidth={2} /> Confirmer</>
                      }
                    </button>
                  </div>
                  <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#1A2138", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.nom} style={{ width: 28, height: 28, objectFit: "cover" }} />
              : <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 13, fontWeight: 600, color: "#fff", userSelect: "none", lineHeight: 1 }}>{profile.nom?.[0]?.toUpperCase() ?? "?"}</span>
            }
          </div>
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
                style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#1A2138", color: "#fff", border: "none", borderRadius: 9, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                <Pin size={11} strokeWidth={2} /> Pinner
              </button>
            )}
            {!isMe && currentUserId && (
              <button
                onClick={() => setShowReport(true)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", color: "#8A8579", borderRadius: 8 }}
                title="Signaler ce profil"
              >
                <Flag size={13} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── IDENTITÉ — fond papier, pas de bandeau ── */}
      <style>{`
        .lk-ghost:hover  { border-color: #1A2138 !important; }
        .lk-ghost:focus-visible { outline: 2px solid #D4537E; outline-offset: 2px; border-radius: 9px; }
        .lk-extlink { text-decoration: none; transition: border-color 0.14s; }
        .lk-extlink:hover { border-color: #1A2138 !important; }
        .lk-extlink:focus-visible { outline: 2px solid #D4537E; outline-offset: 2px; border-radius: 9px; }
      `}</style>

      <div className="max-w-2xl mx-auto px-4">
        <div style={{ paddingTop: 60, paddingBottom: 24 }}>

          {/* Flèche retour — visiteur uniquement */}
          {!isMe && (
            <button
              onClick={() => router.back()}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#8A8579", padding: "0 0 16px", marginLeft: -2 }}
            >
              <ArrowLeft size={15} strokeWidth={2} /> Retour
            </button>
          )}

          {/* Avatar + boutons owner */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>

            {/* Avatar carré navy, initiale Fraunces */}
            <div style={{ width: 72, height: 72, borderRadius: 12, background: "#1A2138", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt={profile.nom} style={{ width: 72, height: 72, objectFit: "cover" }} />
                : <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, fontWeight: 600, color: "#fff", userSelect: "none", lineHeight: 1 }}>
                    {profile.nom?.[0]?.toUpperCase() ?? "?"}
                  </span>
              }
            </div>

            {/* Actions owner */}
            {isMe && (
              <div style={{ display: "flex", gap: 8, paddingTop: 4, flexShrink: 0 }}>
                <button onClick={openEdit} className="lk-ghost"
                  style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "border-color 0.14s" }}>
                  Modifier
                </button>
                <button onClick={() => router.push("/parametres")} className="lk-ghost"
                  style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "border-color 0.14s" }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>⚙</span>
                </button>
                <button onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }} className="lk-ghost"
                  style={{ padding: "7px 10px", borderRadius: 9, border: "1px solid #ECE7DD", background: "#fff", color: "#8A8579", cursor: "pointer", display: "flex", alignItems: "center", transition: "border-color 0.14s" }}>
                  <LogOut size={14} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>

          {/* Nom */}
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 34, fontWeight: 600, color: "#1A2138", margin: "0 0 5px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {profile.nom}
          </h1>

          {/* École */}
          {profile.ecole && (
            <p style={{ fontSize: 14, color: "#8A8579", margin: "0 0 6px" }}>{profile.ecole}</p>
          )}

          {/* Rôle + dispo — une ligne muted, pas de pill */}
          <p style={{ fontSize: 13, color: "#8A8579", margin: "0 0 14px" }}>
            {isDevProfile
              ? [
                  "Développeur",
                  (dispo ?? 0) >= 10 ? "Disponible" : null,
                  dispo ? `${dispo}h/sem` : null,
                ].filter(Boolean).join(" · ")
              : "Founder"
            }
          </p>

          {/* Bio */}
          {profile.bio && (
            <p style={{ fontSize: 14, lineHeight: 1.65, color: "#8A8579", margin: "0 0 14px" }}>{profile.bio}</p>
          )}

          {/* GitHub / LinkedIn — ghost hairline monochrome */}
          {isDevProfile && devProfile && (devProfile.github || devProfile.linkedin) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {devProfile.github && (
                <a
                  href={devProfile.github}
                  target="_blank"
                  rel="noreferrer"
                  className="lk-extlink"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", fontSize: 12, fontWeight: 600 }}
                >
                  GitHub <ExternalLink size={10} strokeWidth={2} />
                </a>
              )}
              {devProfile.linkedin && (
                <a
                  href={devProfile.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="lk-extlink"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", fontSize: 12, fontWeight: 600 }}
                >
                  LinkedIn <ExternalLink size={10} strokeWidth={2} />
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── BANDE TRACK-RECORD ── surface blanche, 3 col, filets hairline ── */}
        <div style={{ display: "flex", background: "#fff", border: "1.5px solid #ECE7DD", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
          {([
            { label: "Missions", value: projects.length      },
            { label: "Livrés",   value: doneProjects.length  },
            { label: "Avis",     value: reviews.length       },
          ] as { label: string; value: number }[]).map((kpi, i) => (
            <div key={kpi.label} style={{ flex: 1, padding: "18px 0", textAlign: "center", borderLeft: i > 0 ? "1px solid #ECE7DD" : "none" }}>
              <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 40, fontWeight: 600, color: "#1A2138", margin: "0 0 3px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {kpi.value}
              </p>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#8A8579", margin: 0, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                {kpi.label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 pb-4">

          {/* Stack */}
          {!isFounder && devProfile?.competences && devProfile.competences.length > 0 && (
            <div style={{ background: "#fff", border: "1.5px solid #ECE7DD", borderRadius: 14, padding: "18px 20px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#8A8579", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 12px" }}>Stack</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {devProfile.competences.map((c) => (
                  <span key={c} style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138" }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── CANDIDATURES — visible uniquement si isMe + dev ── */}
          {isMe && isDevProfile && (
            <>
              {/* KPI band */}
              <div style={{ display: "flex", background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, overflow: "hidden" }}>
                {[
                  { label: "Candidatures", value: myCandidatures.length },
                  { label: "En attente",   value: myDevPending           },
                  { label: "Acceptées",    value: myDevAccepted          },
                ].map((kpi, i) => (
                  <div key={kpi.label} style={{ flex: 1, padding: "14px 0", textAlign: "center", borderLeft: i > 0 ? `1px solid ${C.hairline}` : "none" }}>
                    <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 26, fontWeight: 600, color: C.ink, margin: "0 0 2px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {kpi.value}
                    </p>
                    <p style={{ fontSize: 10, fontWeight: 600, color: C.muted, margin: 0, textTransform: "uppercase", letterSpacing: "0.8px" }}>{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              {myCandidatures.length > 0 && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                  {MY_DEV_TABS.map((tab) => {
                    const cnt = tab.key === "all" ? myCandidatures.length : myCandidatures.filter((cand) => cand.statut === tab.key).length;
                    const active = myDevFilter === tab.key;
                    return (
                      <button key={tab.key} onClick={() => setMyDevFilter(tab.key)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${active ? C.ink : C.hairline}`, background: active ? C.ink : C.surface, color: active ? "#fff" : C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, transition: "all 0.12s" }}>
                        {tab.label}
                        {cnt > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: active ? "rgba(255,255,255,0.18)" : C.hairline, color: active ? "#fff" : C.muted }}>{cnt}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {myCandidatures.length === 0 && (
                <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
                  <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, fontWeight: 600, color: C.ink, margin: "0 0 8px" }}>Aucune candidature</p>
                  <p style={{ fontSize: 13, color: C.muted, margin: "0 0 20px" }}>Explore les projets et candidate pour être mis en relation avec un fondateur.</p>
                  <button onClick={() => router.push("/projets")}
                    style={{ padding: "10px 18px", borderRadius: 10, background: C.ink, color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                    Voir les projets <ArrowRight size={14} strokeWidth={2.2} />
                  </button>
                </div>
              )}

              {/* Filtered empty */}
              {myCandidatures.length > 0 && myDevCandFiltered.length === 0 && (
                <div style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "24px", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Aucune candidature dans cette catégorie.</p>
                </div>
              )}

              {/* Cards */}
              {myDevCandFiltered.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {myDevCandFiltered.map((cand) => {
                    const stacks      = cand.projects.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
                    const hasContract = cand.statut === "accepted" && myContractMap[cand.project_id];
                    return (
                      <div key={cand.id} style={{ background: C.surface, border: `1.5px solid ${C.hairline}`, borderRadius: 14, padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                          <h3 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 15, fontWeight: 600, color: C.ink, margin: 0, letterSpacing: "-0.01em", lineHeight: 1.25, flex: 1 }}>
                            {cand.projects.titre}
                          </h3>
                          <CandStatusPill statut={cand.statut} />
                        </div>
                        {cand.projects.description && (
                          <p style={{ fontSize: 12, color: C.muted, margin: "0 0 10px", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {cand.projects.description}
                          </p>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {stacks.slice(0, 4).map((st) => <CandPill key={st}>{st}</CandPill>)}
                          {cand.projects.deadline && <CandPill>{cand.projects.deadline}</CandPill>}
                        </div>
                        <CandTimeline statut={cand.statut} />
                        {hasContract && (
                          <div style={{ paddingTop: 10 }}>
                            <button onClick={() => router.push(`/contrat/${myContractMap[cand.project_id]}`)}
                              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.ink }}>
                              <FileText size={13} strokeWidth={2} /> Voir le contrat <ArrowRight size={12} strokeWidth={2.2} />
                            </button>
                          </div>
                        )}
                        <div style={{ paddingTop: hasContract ? 8 : 10 }}>
                          <button onClick={() => router.push(`/projets?project=${cand.project_id}`)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                            Voir le projet <ArrowRight size={11} strokeWidth={2.2} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
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
            <div style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 14, padding: "18px 20px" }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", margin: "0 0 14px" }}>En cours</p>
              {activeProjects.map((p, i, arr) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12,
                  ...(i < arr.length - 1 ? { paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #ECE7DD" } : {}) }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#8A8579", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1A2138", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.titre}</p>
                    {p.stack_souhaitee && <p style={{ fontSize: 11, color: "#8A8579", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.stack_souhaitee}</p>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 7, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", flexShrink: 0 }}>
                    {p.statut === "en_cours" ? "En cours" : p.statut === "matched" ? "Matchée" : "En attente"}
                  </span>
                  {isMe && p.statut === "pending" && (
                    <button onClick={() => router.push(`/projets/${p.id}/modifier`)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#8A8579", padding: "3px 6px", flexShrink: 0, textDecoration: "underline" }}>
                      Modifier
                    </button>
                  )}
                  {isMe && (p.statut === "matched" || p.statut === "en_cours") && (
                    <button onClick={() => router.push(`/projets/${p.id}/gestion`)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#1A2138", padding: "3px 6px", flexShrink: 0, textDecoration: "underline" }}>
                      Gérer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Missions livrées */}
          {doneProjects.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #ECE7DD", borderRadius: 14, padding: "18px 20px" }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", margin: "0 0 14px" }}>{isFounder ? "Projets livrés" : "Missions réalisées"}</p>
              {doneProjects.map((p, i, arr) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12,
                  ...(i < arr.length - 1 ? { paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #ECE7DD" } : {}) }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, border: "1px solid #ECE7DD", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check size={11} strokeWidth={2.5} style={{ color: "#1A2138" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1A2138", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.titre}</p>
                    {p.stack_souhaitee && <p style={{ fontSize: 11, color: "#8A8579", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.stack_souhaitee}</p>}
                  </div>
                  {p.deadline && <span style={{ fontSize: 11, color: "#8A8579", flexShrink: 0 }}>{p.deadline}</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Avis ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579", margin: 0 }}>
                Avis {reviews.length > 0 && `(${reviews.length})`}
              </p>
              {score !== null && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, fontWeight: 600, color: "#1A2138", fontVariantNumeric: "tabular-nums" }}>{score}</span>
                  <span style={{ fontSize: 12, color: "#8A8579" }}>/&nbsp;5</span>
                </div>
              )}
            </div>

            {/* Keywords highlights */}
            {keywords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
                {keywords.map(({ word, count }) => (
                  <span key={word} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138" }}>
                    {word}
                    {count > 1 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 5, background: "#ECE7DD", color: "#8A8579" }}>
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
                        style={{ width: 40, height: 40, borderRadius: 10, background: "#1A2138", border: "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 16, fontWeight: 600, color: "#fff", lineHeight: 1 }}>{r.reviewer_nom?.[0]?.toUpperCase() ?? "?"}</span>
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
                        <p style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: "#8A8579" }}>
                          {RATING_LABEL[r.rating]}
                        </p>
                      </div>
                    </div>
                    {r.comment && (
                      <p className="text-sm leading-relaxed px-4 py-3 rounded-xl"
                        style={{ background: "#FAF8F4", color: "#1A2138", borderLeft: "3px solid #ECE7DD" }}>
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

      <BottomNav />

      {/* ── Sticky bottom bar visiteur (au-dessus de la BottomNav) ── */}
      {(!isMe && (convId || canPin)) && (
        <div
          className="fixed left-0 right-0 z-40 px-4"
          style={{
            bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(255,255,255,0.94)",
            backdropFilter: "blur(24px)",
            borderTop: "1px solid rgba(0,0,0,0.07)",
            paddingTop: 12,
            paddingBottom: 12,
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
                style={alreadyPinned || pinDone ? {
                  flex: 1, padding: "12px 0", fontSize: 14, fontWeight: 600, borderRadius: 14,
                  background: "#fff", color: "#8A8579", border: "1px solid #ECE7DD", cursor: "default",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                } : {
                  flex: 1, padding: "12px 0", fontSize: 14, fontWeight: 700, borderRadius: 14,
                  background: "#1A2138", color: "#fff", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
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

      {/* ── FAB founder : déposer un projet ── */}
      {isMe && isFounder && (
        <button
          onClick={() => router.push("/projets/nouveau")}
          style={{
            position: "fixed", bottom: 76, right: 20, zIndex: 40,
            background: "#1A2138", color: "#fff", border: "none",
            borderRadius: 14, padding: "12px 18px",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 4px 16px rgba(26,33,56,0.28)",
            transition: "background 0.14s, transform 0.12s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#2A3252"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1A2138"; }}
        >
          <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span> Déposer un projet
        </button>
      )}

      {currentUserId && (
        <ReportModal
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          targetType="profile"
          targetId={userId}
          targetNom={(devProfile?.nom ?? founderProfile?.nom) ?? ""}
          reporterId={currentUserId}
        />
      )}
    </div>
  );
}
