"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ReportModal from "@/components/ReportModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type Experience = { id: string; titre: string; entreprise: string; date_debut: string; date_fin?: string; description?: string; };
type Formation  = { id: string; diplome: string; etablissement: string; annee?: string; description?: string; };

type DevProfile = {
  id: string; user_id: string; nom: string; ecole?: string; bio?: string;
  competences?: string[]; dispo_heures_semaine?: number;
  github?: string; linkedin?: string; avatar_url?: string;
  experiences?: Experience[]; formation?: Formation[];
};

type FounderProfile = {
  id: string; user_id: string; nom: string; ecole?: string; bio?: string; avatar_url?: string;
  experiences?: Experience[]; formation?: Formation[];
};

type Review = {
  id: string; rating: number; comment?: string | null;
  created_at: string; reviewer_id: string; project_id: string;
  project_titre?: string; reviewer_nom?: string; reviewer_role?: string;
};

type CompletedProject = { id: string; titre: string; statut: string; stack_souhaitee?: string; deadline?: string; };

const RATING_LABEL = ["", "Décevant", "Passable", "Bien", "Très bien", "Excellent !"];
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }); }
function newId() { return crypto.randomUUID(); }

function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <span key={s} className={`${size === "lg" ? "text-xl" : "text-sm"} ${s <= rating ? "text-amber-400" : "text-slate-200"}`}>★</span>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

export default function PublicProfilePage() {
  const router = useRouter();
  const { userId } = useParams<{ userId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [targetRole, setTargetRole]           = useState<string | null>(null);
  const [devProfile, setDevProfile]           = useState<DevProfile | null>(null);
  const [founderProfile, setFounderProfile]   = useState<FounderProfile | null>(null);
  const [profileId, setProfileId]             = useState<string | null>(null);
  const [reviews, setReviews]                 = useState<Review[]>([]);
  const [projects, setProjects]               = useState<CompletedProject[]>([]);
  const [score, setScore]                     = useState<number | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [isMe, setIsMe]                       = useState(false);
  const [convId, setConvId]                   = useState<string | null>(null);
  const [currentUserId, setCurrentUserId]     = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // ── Mode édition ────────────────────────────────────────────────────────────
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [editNom, setEditNom]   = useState("");
  const [editEcole, setEditEcole] = useState("");
  const [editBio, setEditBio]   = useState("");
  const [editGithub, setEditGithub]     = useState("");
  const [editLinkedin, setEditLinkedin] = useState("");
  const [editDispo, setEditDispo]       = useState<number | "">(0);
  const [editComp, setEditComp]         = useState<string[]>([]);
  const [newComp, setNewComp]           = useState("");
  const [editExps, setEditExps]         = useState<Experience[]>([]);
  const [editForms, setEditForms]       = useState<Formation[]>([]);

  // Modal expérience
  const [showExpModal, setShowExpModal] = useState(false);
  const [editingExp, setEditingExp]     = useState<Experience | null>(null);
  const [expF, setExpF] = useState({ titre: "", entreprise: "", date_debut: "", date_fin: "", description: "" });

  // Modal formation
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm]     = useState<Formation | null>(null);
  const [formF, setFormF] = useState({ diplome: "", etablissement: "", annee: "", description: "" });

  // ── Chargement ───────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      let curUserId: string | null = null;
      if (user) {
        curUserId = user.id;
        setCurrentUserId(user.id);
        if (user.id === userId) setIsMe(true);
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
          .from("candidatures").select("projects(id, titre, statut, stack_souhaitee, deadline)")
          .eq("developer_id", prof.id).eq("statut", "accepted");
        const done = (cands ?? []).map((c) => c.projects as unknown as CompletedProject)
          .filter((p) => p && ["livre","termine","matched","en_cours"].includes(p.statut));
        setProjects(done);
        if (curUserId && !user?.id !== !userId) {
          const { data: myFounder } = await supabase.from("profiles_founder").select("id").eq("user_id", curUserId).maybeSingle();
          if (myFounder) {
            const { data: conv } = await supabase.from("conversations").select("id").eq("founder_id", myFounder.id).eq("developer_id", prof.id).maybeSingle();
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
        const { data: projs } = await supabase.from("projects").select("id, titre, statut, stack_souhaitee, deadline")
          .eq("founder_id", prof.id).order("created_at", { ascending: false });
        setProjects((projs as CompletedProject[]) ?? []);
        if (curUserId && curUserId !== userId) {
          const { data: myDev } = await supabase.from("profiles_developer").select("id").eq("user_id", curUserId).maybeSingle();
          if (myDev) {
            const { data: conv } = await supabase.from("conversations").select("id").eq("founder_id", prof.id).eq("developer_id", myDev.id).maybeSingle();
            if (conv) setConvId(conv.id);
          }
        }
      }

      // Reviews
      const { data: rawReviews } = await supabase
        .from("reviews").select("id, rating, comment, created_at, reviewer_id, project_id")
        .eq("reviewed_id", userId).order("created_at", { ascending: false });
      if (rawReviews && rawReviews.length > 0) {
        const avg = rawReviews.reduce((s, r) => s + r.rating, 0) / rawReviews.length;
        setScore(Math.round(avg * 10) / 10);
        const reviewerIds = [...new Set(rawReviews.map((r) => r.reviewer_id))];
        const projectIds  = [...new Set(rawReviews.map((r) => r.project_id))];
        const [{ data: fP }, { data: dP }, { data: prjs }] = await Promise.all([
          supabase.from("profiles_founder").select("user_id, nom").in("user_id", reviewerIds),
          supabase.from("profiles_developer").select("user_id, nom").in("user_id", reviewerIds),
          supabase.from("projects").select("id, titre").in("id", projectIds),
        ]);
        const nameMap: Record<string, { nom: string; role: string }> = {};
        (fP ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "founder" }; });
        (dP ?? []).forEach((p) => { nameMap[p.user_id] = { nom: p.nom, role: "developer" }; });
        const projMap: Record<string, string> = {};
        (prjs ?? []).forEach((p) => { projMap[p.id] = p.titre; });
        setReviews(rawReviews.map((r) => ({
          ...r, reviewer_nom: nameMap[r.reviewer_id]?.nom ?? "Anonyme",
          reviewer_role: nameMap[r.reviewer_id]?.role, project_titre: projMap[r.project_id],
        })));
      }
      setLoading(false);
    }
    load();
  }, [userId, router]);

  // ── Édition ─────────────────────────────────────────────────────────────────

  function openEdit() {
    const p = devProfile ?? founderProfile;
    setEditNom(p?.nom ?? ""); setEditEcole(p?.ecole ?? ""); setEditBio(p?.bio ?? "");
    setEditGithub(devProfile?.github ?? ""); setEditLinkedin(devProfile?.linkedin ?? "");
    setEditDispo(devProfile?.dispo_heures_semaine ?? "");
    setEditComp([...(devProfile?.competences ?? [])]);
    setEditExps([...(p?.experiences ?? [])]);
    setEditForms([...(p?.formation ?? [])]);
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
    setSaving(false); setEditing(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentUserId || !profileId || !targetRole) return;
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${currentUserId}/avatar.${ext}`;
    await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const table = targetRole === "founder" ? "profiles_founder" : "profiles_developer";
    await supabase.from(table).update({ avatar_url: data.publicUrl }).eq("id", profileId);
    if (targetRole === "developer") setDevProfile((p) => p ? { ...p, avatar_url: data.publicUrl } : p);
    else setFounderProfile((p) => p ? { ...p, avatar_url: data.publicUrl } : p);
    setUploadingAvatar(false);
  }

  // ── Modals ───────────────────────────────────────────────────────────────────

  function openExpModal(exp?: Experience) {
    setEditingExp(exp ?? null);
    setExpF(exp ? { titre: exp.titre, entreprise: exp.entreprise, date_debut: exp.date_debut, date_fin: exp.date_fin ?? "", description: exp.description ?? "" } : { titre: "", entreprise: "", date_debut: "", date_fin: "", description: "" });
    setShowExpModal(true);
  }
  function saveExp() {
    if (!expF.titre || !expF.entreprise) return;
    const entry: Experience = { id: editingExp?.id ?? newId(), titre: expF.titre, entreprise: expF.entreprise, date_debut: expF.date_debut, date_fin: expF.date_fin || undefined, description: expF.description || undefined };
    setEditExps(editingExp ? editExps.map((e) => e.id === editingExp.id ? entry : e) : [...editExps, entry]);
    setShowExpModal(false);
  }

  function openFormModal(f?: Formation) {
    setEditingForm(f ?? null);
    setFormF(f ? { diplome: f.diplome, etablissement: f.etablissement, annee: f.annee ?? "", description: f.description ?? "" } : { diplome: "", etablissement: "", annee: "", description: "" });
    setShowFormModal(true);
  }
  function saveForm() {
    if (!formF.diplome || !formF.etablissement) return;
    const entry: Formation = { id: editingForm?.id ?? newId(), diplome: formF.diplome, etablissement: formF.etablissement, annee: formF.annee || undefined, description: formF.description || undefined };
    setEditForms(editingForm ? editForms.map((f) => f.id === editingForm.id ? entry : f) : [...editForms, entry]);
    setShowFormModal(false);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
    </div>
  );

  const profile = devProfile ?? founderProfile;
  if (!profile) return null;

  const isFounder    = targetRole === "founder";
  const activeProjects = projects.filter((p) => ["pending","matched","en_cours"].includes(p.statut));
  const doneProjects   = projects.filter((p) => ["livre","termine"].includes(p.statut));

  // ══════════════════════════════════════════════════════════════════════════════
  // Mode édition
  // ══════════════════════════════════════════════════════════════════════════════

  if (editing && isMe) {
    return (
      <div className="min-h-screen bg-slate-100 pb-10">
        <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button onClick={() => setEditing(false)} className="text-slate-500 font-semibold text-sm">← Annuler</button>
            <h1 className="text-base font-black text-slate-900">Modifier le profil</h1>
            <button onClick={saveEdit} disabled={saving} className="btn-pink px-4 py-2 text-sm">{saving ? "..." : "Enregistrer"}</button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">

          {/* Photo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Photo</p>
            <div className="flex items-center gap-4">
              <div className="relative group shrink-0 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.nom} className="w-20 h-20 rounded-full object-cover border-2 border-slate-200" />
                ) : (
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-black ${isFounder ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                    {profile.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">📷</div>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="btn-ghost px-4 py-2 text-sm">{uploadingAvatar ? "Envoi..." : "Changer la photo"}</button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
          </div>

          {/* Infos */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Informations</p>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Nom complet</label>
              <input value={editNom} onChange={(e) => setEditNom(e.target.value)} className="input-field" placeholder="Ton nom" /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">École / Université</label>
              <input value={editEcole} onChange={(e) => setEditEcole(e.target.value)} className="input-field" placeholder="HEC, 42, EPITECH..." /></div>
            <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Bio</label>
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} maxLength={300} className="input-field resize-none" placeholder="Présente-toi..." /></div>
          </div>

          {/* Liens dev */}
          {!isFounder && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Liens & dispo</p>
              <input value={editGithub} onChange={(e) => setEditGithub(e.target.value)} className="input-field" placeholder="GitHub URL" />
              <input value={editLinkedin} onChange={(e) => setEditLinkedin(e.target.value)} className="input-field" placeholder="LinkedIn URL" />
              <input type="number" value={editDispo} onChange={(e) => setEditDispo(Number(e.target.value))} className="input-field w-32" placeholder="h/semaine" />
            </div>
          )}

          {/* Compétences dev */}
          {!isFounder && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Compétences</p>
              <div className="flex flex-wrap gap-2">
                {editComp.map((c) => (
                  <div key={c} className="flex items-center gap-1 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
                    <span className="text-sm font-semibold text-blue-600">{c}</span>
                    <button onClick={() => setEditComp(editComp.filter((x) => x !== c))} className="text-blue-400 hover:text-red-500 text-xs ml-1">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newComp} onChange={(e) => setNewComp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newComp.trim()) { setEditComp([...editComp, newComp.trim()]); setNewComp(""); } }}
                  placeholder="React, Node.js..." className="input-field flex-1 text-sm" />
                <button onClick={() => { if (newComp.trim()) { setEditComp([...editComp, newComp.trim()]); setNewComp(""); } }} className="btn-pink px-4 py-2 text-sm">+</button>
              </div>
            </div>
          )}

          {/* Expériences */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Expériences</p>
              <button onClick={() => openExpModal()} className="text-sm font-semibold text-pink-500">+ Ajouter</button>
            </div>
            {editExps.length === 0 ? <p className="text-sm text-slate-400 italic">Aucune</p> : (
              <div className="flex flex-col gap-2">
                {editExps.map((exp) => (
                  <div key={exp.id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <div className="flex-1"><p className="font-bold text-slate-900 text-sm">{exp.titre}</p>
                      <p className="text-xs text-slate-500">{exp.entreprise} · {exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}</p></div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openExpModal(exp)} className="text-xs text-slate-400 hover:text-slate-700">✏️</button>
                      <button onClick={() => setEditExps(editExps.filter((e) => e.id !== exp.id))} className="text-xs text-slate-400 hover:text-red-500">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formation */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Formation</p>
              <button onClick={() => openFormModal()} className="text-sm font-semibold text-pink-500">+ Ajouter</button>
            </div>
            {editForms.length === 0 ? <p className="text-sm text-slate-400 italic">Aucune</p> : (
              <div className="flex flex-col gap-2">
                {editForms.map((f) => (
                  <div key={f.id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <div className="flex-1"><p className="font-bold text-slate-900 text-sm">{f.diplome}</p>
                      <p className="text-xs text-slate-500">{f.etablissement}{f.annee ? ` · ${f.annee}` : ""}</p></div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openFormModal(f)} className="text-xs text-slate-400 hover:text-slate-700">✏️</button>
                      <button onClick={() => setEditForms(editForms.filter((x) => x.id !== f.id))} className="text-xs text-slate-400 hover:text-red-500">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={saveEdit} disabled={saving} className="btn-pink w-full py-4">{saving ? "Enregistrement..." : "Enregistrer"}</button>
          <button onClick={() => setEditing(false)} className="btn-ghost w-full py-3">Annuler</button>
        </div>

        {/* Modal expérience */}
        {showExpModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-3">
              <h2 className="text-base font-black">{editingExp ? "Modifier" : "Ajouter"} une expérience</h2>
              <input value={expF.titre} onChange={(e) => setExpF({ ...expF, titre: e.target.value })} placeholder="Titre du poste" className="input-field" />
              <input value={expF.entreprise} onChange={(e) => setExpF({ ...expF, entreprise: e.target.value })} placeholder="Entreprise" className="input-field" />
              <div className="grid grid-cols-2 gap-2">
                <input value={expF.date_debut} onChange={(e) => setExpF({ ...expF, date_debut: e.target.value })} placeholder="Début" className="input-field text-sm py-2" />
                <input value={expF.date_fin} onChange={(e) => setExpF({ ...expF, date_fin: e.target.value })} placeholder="Fin (vide=présent)" className="input-field text-sm py-2" />
              </div>
              <textarea value={expF.description} onChange={(e) => setExpF({ ...expF, description: e.target.value })} rows={2} placeholder="Description" className="input-field resize-none" />
              <button onClick={saveExp} className="btn-pink w-full py-3">Valider</button>
              <button onClick={() => setShowExpModal(false)} className="btn-ghost w-full py-2">Annuler</button>
            </div>
          </div>
        )}

        {/* Modal formation */}
        {showFormModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-3">
              <h2 className="text-base font-black">{editingForm ? "Modifier" : "Ajouter"} une formation</h2>
              <input value={formF.diplome} onChange={(e) => setFormF({ ...formF, diplome: e.target.value })} placeholder="Diplôme" className="input-field" />
              <input value={formF.etablissement} onChange={(e) => setFormF({ ...formF, etablissement: e.target.value })} placeholder="École" className="input-field" />
              <input value={formF.annee} onChange={(e) => setFormF({ ...formF, annee: e.target.value })} placeholder="Année" className="input-field" />
              <textarea value={formF.description} onChange={(e) => setFormF({ ...formF, description: e.target.value })} rows={2} placeholder="Description" className="input-field resize-none" />
              <button onClick={saveForm} className="btn-pink w-full py-3">Valider</button>
              <button onClick={() => setShowFormModal(false)} className="btn-ghost w-full py-2">Annuler</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Mode vue
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* Nav */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">←</button>
          <span className="font-bold text-slate-900 flex-1 truncate">{profile.nom}</span>
          {isMe && (
            <button onClick={openEdit} className="text-xs font-semibold text-pink-500 border border-pink-200 px-3 py-1.5 rounded-full hover:bg-pink-50 transition-colors">
              ✏️ Modifier
            </button>
          )}
          {!isMe && currentUserId && (
            <button onClick={() => setShowReport(true)} className="text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5" title="Signaler ce profil">
              🚩
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">

        {/* Bannière + Avatar */}
        <div className="relative">
          <div className={`h-32 sm:h-44 ${isFounder ? "bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-500" : "bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-500"}`} />
          <div className="px-4 sm:px-6">
            <div className="flex items-end justify-between -mt-12 mb-4">
              <div className="relative group">
                {isMe && <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 z-10 rounded-full" />}
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.nom} className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
                ) : (
                  <div className={`w-24 h-24 rounded-full border-4 border-white shadow-lg flex items-center justify-center text-white text-3xl font-black ${isFounder ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                    {profile.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                {isMe && <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs pointer-events-none">📷</div>}
                {isMe && <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />}
              </div>
              <div className="flex gap-2 pb-1">
                {!isMe && convId && (
                  <button onClick={() => router.push(`/messages/${convId}`)} className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-full bg-white border-2 border-slate-200 text-slate-700 hover:border-pink-300 hover:text-pink-600 transition-all shadow-sm">
                    💬 Message
                  </button>
                )}
                {isMe && (
                  <button onClick={openEdit} className="text-sm font-bold px-5 py-2.5 rounded-full bg-white border-2 border-pink-300 text-pink-600 hover:bg-pink-50 transition-all shadow-sm">
                    ✏️ Modifier
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h1 className="text-2xl font-black text-slate-900 leading-tight">{profile.nom}</h1>
                {profile.ecole && <p className="text-slate-500 mt-0.5">{profile.ecole}</p>}
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full mt-2 inline-block ${isFounder ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"}`}>
                  {isFounder ? "Founder" : "Développeur"}
                </span>
              </div>
              {score !== null && (
                <div className="text-right shrink-0">
                  <div className="text-3xl font-black text-slate-900">{score}<span className="text-lg text-slate-400">/5</span></div>
                  <StarRow rating={Math.round(score)} size="lg" />
                  <p className="text-xs text-slate-400 mt-1">{reviews.length} avis</p>
                </div>
              )}
            </div>

            {profile.bio && <p className="text-slate-600 text-sm leading-relaxed mt-2 pb-4 border-b border-slate-100">{profile.bio}</p>}

            {!isFounder && devProfile && (
              <div className="flex flex-wrap gap-3 mt-3 pb-4 border-b border-slate-100">
                {devProfile.dispo_heures_semaine && <span className="text-sm text-slate-600 font-semibold bg-slate-100 px-3 py-1.5 rounded-full">⏱ {devProfile.dispo_heures_semaine}h/sem</span>}
                {devProfile.github && <a href={devProfile.github} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors">⌥ GitHub ↗</a>}
                {devProfile.linkedin && <a href={devProfile.linkedin} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors">in LinkedIn ↗</a>}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 flex flex-col gap-5">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: projects.length, label: isFounder ? "Projets" : "Missions" },
              { val: doneProjects.length, label: "Livrés" },
              { val: reviews.length, label: "Avis" },
            ].map(({ val, label }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-black text-slate-900">{val}</p>
                <p className="text-xs text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Compétences */}
          {!isFounder && devProfile?.competences && devProfile.competences.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Compétences</h2>
              <div className="flex flex-wrap gap-2">
                {devProfile.competences.map((c) => (
                  <span key={c} className="text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1.5 rounded-full">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Expériences */}
          {(profile.experiences ?? []).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Expériences</h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {(profile.experiences ?? []).map((exp) => (
                  <div key={exp.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg ${isFounder ? "bg-pink-50" : "bg-blue-50"}`}>💼</div>
                    <div>
                      <p className="font-bold text-slate-900">{exp.titre}</p>
                      <p className="text-sm text-slate-600">{exp.entreprise}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}</p>
                      {exp.description && <p className="text-sm text-slate-500 mt-1">{exp.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formation */}
          {(profile.formation ?? []).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Formation</h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {(profile.formation ?? []).map((f) => (
                  <div key={f.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 text-lg">🎓</div>
                    <div>
                      <p className="font-bold text-slate-900">{f.diplome}</p>
                      <p className="text-sm text-slate-600">{f.etablissement}</p>
                      {f.annee && <p className="text-xs text-slate-400 mt-0.5">{f.annee}</p>}
                      {f.description && <p className="text-sm text-slate-500 mt-1">{f.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projets actifs */}
          {activeProjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">En cours</h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {activeProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${p.statut === "en_cours" ? "bg-green-500" : "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{p.titre}</p>
                      {p.stack_souhaitee && <p className="text-xs text-slate-400 truncate">{p.stack_souhaitee}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${p.statut === "en_cours" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"}`}>
                      {p.statut === "en_cours" ? "En cours" : "Matchée"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projets livrés */}
          {doneProjects.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                {isFounder ? "Projets livrés" : "Missions réalisées"}
              </h2>
              <div className="flex flex-col divide-y divide-slate-50">
                {doneProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="text-green-500 shrink-0 font-bold">✓</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{p.titre}</p>
                      {p.stack_souhaitee && <p className="text-xs text-slate-400 truncate">{p.stack_souhaitee}</p>}
                    </div>
                    {p.deadline && <span className="text-xs text-slate-400 shrink-0">{p.deadline}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Avis */}
          {reviews.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Avis ({reviews.length})</h2>
              {reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <button onClick={() => router.push(`/profil/${r.reviewer_id}`)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 hover:opacity-80 transition-opacity ${r.reviewer_role === "founder" ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                      {r.reviewer_nom?.[0]?.toUpperCase() ?? "?"}
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => router.push(`/profil/${r.reviewer_id}`)} className="font-bold text-slate-900 text-sm hover:text-pink-500 transition-colors text-left">{r.reviewer_nom}</button>
                      <p className="text-xs text-slate-400">{r.reviewer_role === "founder" ? "Founder" : "Développeur"}{r.project_titre && <> · <span className="italic">{r.project_titre}</span></>} · {fmtDate(r.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StarRow rating={r.rating} />
                      <p className="text-xs font-semibold text-amber-500 mt-0.5">{RATING_LABEL[r.rating]}</p>
                    </div>
                  </div>
                  {r.comment && <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-4 py-3 border-l-2 border-slate-200">&ldquo;{r.comment}&rdquo;</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-3xl mb-2">⭐</p>
              <p className="text-sm text-slate-400">Aucun avis pour l&apos;instant.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal signalement */}
      {currentUserId && (
        <ReportModal
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          targetType="profile"
          targetId={userId}
          targetNom={profile.nom}
          reporterId={currentUserId}
        />
      )}
    </div>
  );
}
