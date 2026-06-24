"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";

// ── Types ─────────────────────────────────────────────────────────────────────

type Experience = {
  id: string; titre: string; entreprise: string;
  date_debut: string; date_fin?: string; description?: string;
};
type Formation = {
  id: string; diplome: string; etablissement: string;
  annee?: string; description?: string;
};
type Project = {
  id: string; titre: string; description: string;
  stack_souhaitee: string; deadline: string; statut: string;
};
type Candidature = {
  id: string; statut: string; project_id: string;
  projects: { titre: string; description: string; stack_souhaitee: string; deadline: string; statut: string; };
};

const STATUT_PROJET: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente",  color: "bg-amber-50 text-amber-600 border border-amber-200" },
  matched:  { label: "Matchée",     color: "bg-blue-50 text-blue-600 border border-blue-200" },
  en_cours: { label: "En cours",    color: "bg-green-50 text-green-600 border border-green-200" },
  livre:    { label: "Livré ✓",    color: "bg-purple-50 text-purple-600 border border-purple-200" },
  termine:  { label: "Terminé ✓",  color: "bg-purple-50 text-purple-600 border border-purple-200" },
};
const STATUT_CAND: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente",  color: "bg-amber-50 text-amber-600 border border-amber-200" },
  accepted: { label: "Accepté ✓",  color: "bg-green-50 text-green-600 border border-green-200" },
  refused:  { label: "Refusé",     color: "bg-red-50 text-red-400 border border-red-200" },
};

function newId() { return crypto.randomUUID(); }

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, onAdd, onEdit }: { title: string; onAdd?: () => void; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      <div className="flex gap-1">
        {onEdit && (
          <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors text-sm">✏️</button>
        )}
        {onAdd && (
          <button onClick={onAdd} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors font-bold text-lg">+</button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

export default function ProfilPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth & identité ────────────────────────────────────────────────────────
  const [role, setRole]           = useState<string | null>(null);
  const [userId, setUserId]       = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  // ── Champs profil ──────────────────────────────────────────────────────────
  const [nom, setNom]             = useState("");
  const [ecole, setEcole]         = useState("");
  const [bio, setBio]             = useState("");
  const [competences, setCompetences] = useState<string[]>([]);
  const [github, setGithub]       = useState("");
  const [linkedin, setLinkedin]   = useState("");
  const [dispo, setDispo]         = useState<number | "">(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Expériences & Formation ────────────────────────────────────────────────
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [formation, setFormation]     = useState<Formation[]>([]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const [score, setScore]           = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewedProjects, setReviewedProjects] = useState<Set<string>>(new Set());

  // ── Projets & Candidatures ─────────────────────────────────────────────────
  const [projects, setProjects]       = useState<Project[]>([]);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [contractMap, setContractMap] = useState<Record<string, string>>({});

  // ── Édition sections ───────────────────────────────────────────────────────
  const [editingBio, setEditingBio]           = useState(false);
  const [editingInfo, setEditingInfo]         = useState(false);
  const [editingComp, setEditingComp]         = useState(false);
  const [newComp, setNewComp]                 = useState("");

  // Modal expérience
  const [showExpModal, setShowExpModal]   = useState(false);
  const [editingExp, setEditingExp]       = useState<Experience | null>(null);
  const [expTitre, setExpTitre]           = useState("");
  const [expEntreprise, setExpEntreprise] = useState("");
  const [expDebut, setExpDebut]           = useState("");
  const [expFin, setExpFin]               = useState("");
  const [expDesc, setExpDesc]             = useState("");
  const [savingExp, setSavingExp]         = useState(false);

  // Modal formation
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm]     = useState<Formation | null>(null);
  const [formDiplome, setFormDiplome]     = useState("");
  const [formEtab, setFormEtab]           = useState("");
  const [formAnnee, setFormAnnee]         = useState("");
  const [formDesc, setFormDesc]           = useState("");
  const [savingForm, setSavingForm]       = useState(false);

  // ── Chargement ─────────────────────────────────────────────────────────────

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
        const { data: p, error: pErr } = await supabase
          .from("profiles_founder")
          .select("id, nom, ecole, bio, experiences, formation, avatar_url")
          .eq("user_id", user.id).maybeSingle();

        // Fallback sans les nouvelles colonnes si SQL pas encore exécuté
        const profile = p ?? (pErr ? (await supabase.from("profiles_founder")
          .select("id, nom, ecole, avatar_url").eq("user_id", user.id).maybeSingle()).data : null);
        if (!profile) { router.push("/onboarding"); return; }

        setNom(profile.nom ?? ""); setEcole(profile.ecole ?? ""); setBio((profile as typeof p)?.bio ?? "");
        setExperiences((profile as typeof p)?.experiences ?? []); setFormation((profile as typeof p)?.formation ?? []);
        setAvatarUrl(profile.avatar_url ?? null); setProfileId(profile.id);

        const { data: projs } = await supabase.from("projects").select("*")
          .eq("founder_id", profile.id).order("created_at", { ascending: false });
        setProjects(projs ?? []);

        const { data: contracts } = await supabase.from("contracts").select("id, project_id").eq("founder_id", profile.id);
        const map: Record<string, string> = {};
        (contracts ?? []).forEach((c) => { map[c.project_id] = c.id; });
        setContractMap(map);

        const [{ data: founderReviews }, { data: myR }] = await Promise.all([
          supabase.from("reviews").select("rating").eq("reviewed_id", user.id),
          supabase.from("reviews").select("project_id").eq("reviewer_id", user.id),
        ]);
        if (founderReviews?.length) {
          setScore(Math.round(founderReviews.reduce((s, r) => s + r.rating, 0) / founderReviews.length * 10) / 10);
          setReviewCount(founderReviews.length);
        }
        if (myR) setReviewedProjects(new Set(myR.map((r) => r.project_id)));
      }

      if (r === "developer") {
        const { data: p, error: pDevErr } = await supabase
          .from("profiles_developer")
          .select("id, nom, ecole, bio, competences, github, linkedin, dispo_heures_semaine, experiences, formation, avatar_url")
          .eq("user_id", user.id).maybeSingle();

        const devProfile = p ?? (pDevErr ? (await supabase.from("profiles_developer")
          .select("id, nom, ecole, competences, github, linkedin, dispo_heures_semaine, avatar_url").eq("user_id", user.id).maybeSingle()).data : null);
        if (!devProfile) { router.push("/onboarding"); return; }

        setNom(devProfile.nom ?? ""); setEcole(devProfile.ecole ?? ""); setBio((devProfile as typeof p)?.bio ?? "");
        setCompetences(devProfile.competences ?? []); setGithub(devProfile.github ?? "");
        setLinkedin(devProfile.linkedin ?? ""); setDispo(devProfile.dispo_heures_semaine ?? "");
        setExperiences((devProfile as typeof p)?.experiences ?? []); setFormation((devProfile as typeof p)?.formation ?? []);
        setAvatarUrl(devProfile.avatar_url ?? null); setProfileId(devProfile.id);

        const { data: cands } = await supabase.from("candidatures")
          .select("id, statut, project_id, projects(titre, description, stack_souhaitee, deadline, statut)")
          .eq("developer_id", devProfile.id).order("created_at", { ascending: false });
        setCandidatures((cands as unknown as Candidature[]) ?? []);

        const { data: devContracts } = await supabase.from("contracts").select("id, project_id").eq("developer_id", devProfile.id);
        const devMap: Record<string, string> = {};
        (devContracts ?? []).forEach((c) => { devMap[c.project_id] = c.id; });
        setContractMap(devMap);

        const [{ data: reviews }, { data: myR }] = await Promise.all([
          supabase.from("reviews").select("rating").eq("reviewed_id", user.id),
          supabase.from("reviews").select("project_id").eq("reviewer_id", user.id),
        ]);
        if (reviews?.length) {
          setScore(Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10);
          setReviewCount(reviews.length);
        }
        if (myR) setReviewedProjects(new Set(myR.map((r) => r.project_id)));
      }

      setLoading(false);
    }
    load();
  }, [router]);

  // ── Sauvegarde ─────────────────────────────────────────────────────────────

  async function saveField(fields: Record<string, unknown>) {
    if (!profileId || !role) return;
    const table = role === "founder" ? "profiles_founder" : "profiles_developer";
    await supabase.from(table).update(fields).eq("id", profileId);
  }

  async function saveBio() {
    await saveField({ bio });
    setEditingBio(false);
  }

  async function saveInfo() {
    if (role === "developer") {
      await saveField({ github, linkedin, dispo_heures_semaine: dispo || null });
    } else {
      await saveField({ ecole });
    }
    setEditingInfo(false);
  }

  async function addComp() {
    if (!newComp.trim()) return;
    const updated = [...competences, newComp.trim()];
    setCompetences(updated);
    setNewComp("");
    await saveField({ competences: updated });
  }

  async function removeComp(c: string) {
    const updated = competences.filter((x) => x !== c);
    setCompetences(updated);
    await saveField({ competences: updated });
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId || !profileId || !role) return;
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await saveField({ avatar_url: data.publicUrl });
    setAvatarUrl(data.publicUrl);
    setUploadingAvatar(false);
  }

  // ── Expériences ────────────────────────────────────────────────────────────

  function openExpModal(exp?: Experience) {
    if (exp) { setEditingExp(exp); setExpTitre(exp.titre); setExpEntreprise(exp.entreprise); setExpDebut(exp.date_debut); setExpFin(exp.date_fin ?? ""); setExpDesc(exp.description ?? ""); }
    else { setEditingExp(null); setExpTitre(""); setExpEntreprise(""); setExpDebut(""); setExpFin(""); setExpDesc(""); }
    setShowExpModal(true);
  }

  async function saveExp() {
    if (!expTitre || !expEntreprise) return;
    setSavingExp(true);
    let updated: Experience[];
    if (editingExp) {
      updated = experiences.map((e) => e.id === editingExp.id
        ? { ...e, titre: expTitre, entreprise: expEntreprise, date_debut: expDebut, date_fin: expFin || undefined, description: expDesc || undefined }
        : e);
    } else {
      updated = [...experiences, { id: newId(), titre: expTitre, entreprise: expEntreprise, date_debut: expDebut, date_fin: expFin || undefined, description: expDesc || undefined }];
    }
    setExperiences(updated);
    await saveField({ experiences: updated });
    setShowExpModal(false); setSavingExp(false);
  }

  async function deleteExp(id: string) {
    const updated = experiences.filter((e) => e.id !== id);
    setExperiences(updated);
    await saveField({ experiences: updated });
  }

  // ── Formation ──────────────────────────────────────────────────────────────

  function openFormModal(f?: Formation) {
    if (f) { setEditingForm(f); setFormDiplome(f.diplome); setFormEtab(f.etablissement); setFormAnnee(f.annee ?? ""); setFormDesc(f.description ?? ""); }
    else { setEditingForm(null); setFormDiplome(""); setFormEtab(""); setFormAnnee(""); setFormDesc(""); }
    setShowFormModal(true);
  }

  async function saveForm() {
    if (!formDiplome || !formEtab) return;
    setSavingForm(true);
    let updated: Formation[];
    if (editingForm) {
      updated = formation.map((f) => f.id === editingForm.id
        ? { ...f, diplome: formDiplome, etablissement: formEtab, annee: formAnnee || undefined, description: formDesc || undefined }
        : f);
    } else {
      updated = [...formation, { id: newId(), diplome: formDiplome, etablissement: formEtab, annee: formAnnee || undefined, description: formDesc || undefined }];
    }
    setFormation(updated);
    await saveField({ formation: updated });
    setShowFormModal(false); setSavingForm(false);
  }

  async function deleteForm(id: string) {
    const updated = formation.filter((f) => f.id !== id);
    setFormation(updated);
    await saveField({ formation: updated });
  }

  // ── Projet founder ─────────────────────────────────────────────────────────

  async function handleLivrer(projectId: string) {
    const proj = projects.find((p) => p.id === projectId);
    await supabase.from("projects").update({ statut: "livre" }).eq("id", projectId);
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, statut: "livre" } : p));
    const { data: conv } = await supabase.from("conversations").select("profiles_developer(user_id)").eq("project_id", projectId).maybeSingle();
    const devUserId = (conv?.profiles_developer as unknown as { user_id: string } | null)?.user_id;
    if (devUserId && proj) {
      await supabase.from("notifications").insert({
        user_id: devUserId, type: "projet_livre", title: "Projet terminé ✓",
        body: `"${proj.titre}" est marqué comme livré. Laisse ton avis !`,
        link: `/projets/${projectId}/review`,
      });
    }
    router.push(`/projets/${projectId}/review`);
  }

  async function handleDeleteProject(projectId: string) {
    if (!confirm("Supprimer ce projet ? Cette action est irréversible.")) return;
    await supabase.from("projects").delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
    </div>
  );

  const isFounder = role === "founder";

  // ══════════════════════════════════════════════════════════════════════════════
  // Rendu
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-100 pb-24">

      {/* ── Bannière + Hero ───────────────────────────────────────────────── */}
      <div className="relative">
        <div className={`h-32 ${isFounder ? "bg-gradient-to-r from-pink-400 to-purple-500" : "bg-gradient-to-r from-blue-400 to-indigo-500"}`} />
        <div className="bg-white border-b border-slate-200 px-4 pb-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end justify-between -mt-12 mb-3">
              {/* Avatar cliquable */}
              <div className="relative group">
                <button onClick={() => fileInputRef.current?.click()} className="block">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={nom} className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md" />
                  ) : (
                    <div className={`w-24 h-24 rounded-full border-4 border-white shadow-md flex items-center justify-center text-white text-3xl font-black ${isFounder ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                      {nom?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                    {uploadingAvatar ? "..." : "📷"}
                  </div>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </div>
              {/* Actions header */}
              <div className="flex items-center gap-2 pb-1">
                <NotificationBell />
                <button onClick={() => router.push(`/profil/${userId}`)}
                  className="text-xs font-semibold border border-slate-300 text-slate-600 px-3 py-2 rounded-full hover:bg-slate-50 transition-colors">
                  Aperçu public
                </button>
                <button onClick={handleLogout} className="text-xs font-semibold border border-slate-300 text-slate-600 px-3 py-2 rounded-full hover:bg-slate-50 transition-colors">
                  Déconnexion
                </button>
              </div>
            </div>

            {/* Identité */}
            <h1 className="text-2xl font-black text-slate-900">{nom}</h1>

            {/* Bio inline */}
            {editingBio ? (
              <div className="mt-2">
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300}
                  placeholder="Décris-toi en quelques mots — ton rôle, ta vision, tes objectifs..."
                  className="input-field text-sm resize-none w-full" />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveBio} className="btn-pink px-4 py-2 text-xs">Enregistrer</button>
                  <button onClick={() => setEditingBio(false)} className="btn-ghost px-4 py-2 text-xs">Annuler</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 mt-1 group">
                <p className={`text-sm leading-relaxed flex-1 ${bio ? "text-slate-600" : "text-slate-400 italic"}`}>
                  {bio || "Ajoute une courte présentation..."}
                </p>
                <button onClick={() => setEditingBio(true)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-all shrink-0">✏️</button>
              </div>
            )}

            {/* École + badge */}
            <div className="flex items-center gap-2 mt-2">
              {ecole && <span className="text-sm text-slate-500">{ecole}</span>}
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isFounder ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"}`}>
                {isFounder ? "Founder" : "Développeur"}
              </span>
            </div>

            {/* Score */}
            {score !== null && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex gap-0.5">{[1,2,3,4,5].map((s) => <span key={s} className={`text-base ${s <= Math.round(score) ? "text-amber-400" : "text-slate-200"}`}>★</span>)}</div>
                <span className="font-bold text-slate-900 text-sm">{score}/5</span>
                <span className="text-xs text-slate-400">({reviewCount} avis)</span>
              </div>
            )}

            {/* Infos dev (github, linkedin, dispo) */}
            {!isFounder && (
              <div className="mt-3">
                {editingInfo ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="URL GitHub" className="input-field text-xs py-2" />
                      <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="URL LinkedIn" className="input-field text-xs py-2" />
                    </div>
                    <input type="number" value={dispo} onChange={(e) => setDispo(Number(e.target.value))} placeholder="Dispo h/semaine" className="input-field text-xs py-2 w-40" />
                    <div className="flex gap-2">
                      <button onClick={saveInfo} className="btn-pink px-4 py-2 text-xs">Enregistrer</button>
                      <button onClick={() => setEditingInfo(false)} className="btn-ghost px-4 py-2 text-xs">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 items-center group">
                    {dispo ? <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">⏱ {dispo}h/sem</span> : null}
                    {github ? <a href={github} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors">⌥ GitHub ↗</a> : null}
                    {linkedin ? <a href={linkedin} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors">in LinkedIn ↗</a> : null}
                    <button onClick={() => setEditingInfo(true)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-all text-sm">✏️</button>
                    {!dispo && !github && !linkedin && <span className="text-xs text-slate-400 italic">Ajoute tes liens...</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">

        {/* ── CTA Founder ───────────────────────────────────────────────── */}
        {isFounder && (
          <button onClick={() => router.push("/projets/nouveau")} className="btn-pink w-full py-3">
            + Déposer un nouveau projet
          </button>
        )}

        {/* ── Compétences (dev) ─────────────────────────────────────────── */}
        {!isFounder && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <SectionHeader title="Compétences" onEdit={() => setEditingComp(!editingComp)} />
            <div className="flex flex-wrap gap-2">
              {competences.map((c) => (
                <div key={c} className="flex items-center gap-1 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
                  <span className="text-sm font-semibold text-blue-600">{c}</span>
                  {editingComp && (
                    <button onClick={() => removeComp(c)} className="text-blue-400 hover:text-red-500 ml-1 text-xs font-bold">✕</button>
                  )}
                </div>
              ))}
              {editingComp && (
                <div className="flex items-center gap-2">
                  <input value={newComp} onChange={(e) => setNewComp(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComp()}
                    placeholder="React, Node.js..."
                    className="input-field text-sm py-1.5 w-36" />
                  <button onClick={addComp} className="btn-pink px-3 py-1.5 text-sm">+</button>
                </div>
              )}
              {competences.length === 0 && !editingComp && (
                <button onClick={() => setEditingComp(true)} className="text-sm text-slate-400 italic hover:text-slate-600">Ajoute tes compétences...</button>
              )}
            </div>
          </div>
        )}

        {/* ── Expériences ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <SectionHeader title="Expériences" onAdd={() => openExpModal()} />
          {experiences.length === 0 ? (
            <button onClick={() => openExpModal()} className="text-sm text-slate-400 italic hover:text-slate-600">
              Ajoute une expérience professionnelle ou projet...
            </button>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {experiences.map((exp) => (
                <div key={exp.id} className="py-4 first:pt-0 last:pb-0 group">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${isFounder ? "bg-pink-50" : "bg-blue-50"}`}>💼</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{exp.titre}</p>
                          <p className="text-sm text-slate-600">{exp.entreprise}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => openExpModal(exp)} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100">✏️</button>
                          <button onClick={() => deleteExp(exp.id)} className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50">✕</button>
                        </div>
                      </div>
                      {exp.description && <p className="text-sm text-slate-500 mt-1 leading-relaxed">{exp.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Formation ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <SectionHeader title="Formation" onAdd={() => openFormModal()} />
          {formation.length === 0 ? (
            <button onClick={() => openFormModal()} className="text-sm text-slate-400 italic hover:text-slate-600">
              Ajoute ton parcours académique...
            </button>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {formation.map((f) => (
                <div key={f.id} className="py-4 first:pt-0 last:pb-0 group">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 text-lg">🎓</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{f.diplome}</p>
                          <p className="text-sm text-slate-600">{f.etablissement}</p>
                          {f.annee && <p className="text-xs text-slate-400 mt-0.5">{f.annee}</p>}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => openFormModal(f)} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100">✏️</button>
                          <button onClick={() => deleteForm(f.id)} className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50">✕</button>
                        </div>
                      </div>
                      {f.description && <p className="text-sm text-slate-500 mt-1">{f.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Projets founder ───────────────────────────────────────────── */}
        {isFounder && projects.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <SectionHeader title={`Mes projets (${projects.length})`} />
            <div className="flex flex-col gap-3">
              {projects.map((p) => {
                const s = STATUT_PROJET[p.statut] ?? { label: p.statut, color: "bg-slate-100 text-slate-500" };
                return (
                  <div key={p.id} className="border border-slate-100 rounded-xl p-4 hover:border-slate-200 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-bold text-slate-900 text-sm">{p.titre}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${s.color}`}>{s.label}</span>
                    </div>
                    {p.description && <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.description}</p>}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-xs text-slate-400">
                        {p.stack_souhaitee && <span>🛠 {p.stack_souhaitee}</span>}
                        {p.deadline && <span>📅 {p.deadline}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {(p.statut === "matched" || p.statut === "en_cours") && (
                          <>
                            <button onClick={() => router.push(`/projets/${p.id}/gestion`)} className="text-xs font-semibold text-slate-500 hover:text-pink-500 transition-colors">🗂 Gestion</button>
                            <button onClick={() => handleLivrer(p.id)} className="text-xs font-semibold text-green-600 hover:text-green-800 transition-colors">✓ Livrer</button>
                          </>
                        )}
                        {(p.statut === "livre" || p.statut === "termine") && !reviewedProjects.has(p.id) && (
                          <button onClick={() => router.push(`/projets/${p.id}/review`)} className="text-xs font-semibold text-amber-500 hover:text-amber-700 transition-colors">⭐ Avis</button>
                        )}
                        {contractMap[p.id] && (
                          <button onClick={() => router.push(`/contrat/${contractMap[p.id]}`)} className="text-xs font-semibold text-slate-500 hover:text-pink-500 transition-colors">📄 Contrat</button>
                        )}
                        <button onClick={() => router.push(`/projets/${p.id}/candidats`)} className="text-xs font-semibold text-pink-500 hover:text-pink-700 transition-colors">Candidats →</button>
                        <button onClick={() => handleDeleteProject(p.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Supprimer</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Candidatures dev ──────────────────────────────────────────── */}
        {!isFounder && candidatures.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <SectionHeader title={`Mes candidatures (${candidatures.length})`} />
            <div className="flex flex-col gap-3">
              {candidatures.map((c) => {
                const s = STATUT_CAND[c.statut] ?? { label: c.statut, color: "bg-slate-100 text-slate-500" };
                return (
                  <div key={c.id} className="border border-slate-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-bold text-slate-900 text-sm">{c.projects.titre}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${s.color}`}>{s.label}</span>
                    </div>
                    {c.projects.description && <p className="text-xs text-slate-500 line-clamp-1 mb-2">{c.projects.description}</p>}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-xs text-slate-400">
                        {c.projects.stack_souhaitee && <span>🛠 {c.projects.stack_souhaitee}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {c.statut === "accepted" && contractMap[c.project_id] && (
                          <button onClick={() => router.push(`/contrat/${contractMap[c.project_id]}`)} className="text-xs font-semibold text-slate-500 hover:text-pink-500 transition-colors">📄 Contrat</button>
                        )}
                        {c.statut === "accepted" && ["livre","termine"].includes(c.projects?.statut) && !reviewedProjects.has(c.project_id) && (
                          <button onClick={() => router.push(`/projets/${c.project_id}/review`)} className="text-xs font-semibold text-amber-500 hover:text-amber-700 transition-colors">⭐ Avis</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Expérience ──────────────────────────────────────────────── */}
      {showExpModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-black text-slate-900">{editingExp ? "Modifier" : "Ajouter"} une expérience</h2>
            <input value={expTitre} onChange={(e) => setExpTitre(e.target.value)} placeholder="Titre du poste / rôle" className="input-field" />
            <input value={expEntreprise} onChange={(e) => setExpEntreprise(e.target.value)} placeholder="Entreprise / Projet" className="input-field" />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Début</label>
                <input value={expDebut} onChange={(e) => setExpDebut(e.target.value)} placeholder="Jan 2024" className="input-field py-2 text-sm" /></div>
              <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Fin (vide = présent)</label>
                <input value={expFin} onChange={(e) => setExpFin(e.target.value)} placeholder="Juin 2024" className="input-field py-2 text-sm" /></div>
            </div>
            <textarea value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Description (optionnel)" rows={3} className="input-field resize-none" />
            <button onClick={saveExp} disabled={savingExp || !expTitre || !expEntreprise} className="btn-pink w-full py-3">
              {savingExp ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button onClick={() => setShowExpModal(false)} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}

      {/* ── Modal Formation ───────────────────────────────────────────────── */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="text-lg font-black text-slate-900">{editingForm ? "Modifier" : "Ajouter"} une formation</h2>
            <input value={formDiplome} onChange={(e) => setFormDiplome(e.target.value)} placeholder="Diplôme / Certification" className="input-field" />
            <input value={formEtab} onChange={(e) => setFormEtab(e.target.value)} placeholder="École / Établissement" className="input-field" />
            <input value={formAnnee} onChange={(e) => setFormAnnee(e.target.value)} placeholder="Année (ex: 2024 ou 2022-2024)" className="input-field" />
            <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Description (optionnel)" rows={2} className="input-field resize-none" />
            <button onClick={saveForm} disabled={savingForm || !formDiplome || !formEtab} className="btn-pink w-full py-3">
              {savingForm ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button onClick={() => setShowFormModal(false)} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
