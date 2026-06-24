"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";

type Experience = { id: string; titre: string; entreprise: string; date_debut: string; date_fin?: string; description?: string; };
type Formation  = { id: string; diplome: string; etablissement: string; annee?: string; description?: string; };
type Project    = { id: string; titre: string; description: string; stack_souhaitee: string; deadline: string; statut: string; };
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

export default function ProfilPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [role, setRole]         = useState<string | null>(null);
  const [userId, setUserId]     = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  // ── Données profil ────────────────────────────────────────────────────────────
  const [nom, setNom]           = useState("");
  const [ecole, setEcole]       = useState("");
  const [bio, setBio]           = useState("");
  const [competences, setCompetences] = useState<string[]>([]);
  const [github, setGithub]     = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [dispo, setDispo]       = useState<number | "">(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [formation, setFormation]     = useState<Formation[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Stats & projets ───────────────────────────────────────────────────────────
  const [score, setScore]       = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewedProjects, setReviewedProjects] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [contractMap, setContractMap] = useState<Record<string, string>>({});

  // ── Mode édition ─────────────────────────────────────────────────────────────
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // Champs édition temporaires
  const [editNom, setEditNom]           = useState("");
  const [editEcole, setEditEcole]       = useState("");
  const [editBio, setEditBio]           = useState("");
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
  const [expFields, setExpFields]       = useState({ titre: "", entreprise: "", date_debut: "", date_fin: "", description: "" });

  // Modal formation
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm]     = useState<Formation | null>(null);
  const [formFields, setFormFields]       = useState({ diplome: "", etablissement: "", annee: "", description: "" });

  // ── Chargement ────────────────────────────────────────────────────────────────

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
        const { data: p } = await supabase
          .from("profiles_founder").select("id, nom, ecole, avatar_url")
          .eq("user_id", user.id).maybeSingle();
        if (!p) { router.push("/onboarding"); return; }
        setNom(p.nom ?? ""); setEcole(p.ecole ?? "");
        setAvatarUrl(p.avatar_url ?? null); setProfileId(p.id);

        // Nouvelles colonnes (optionnelles)
        supabase.from("profiles_founder").select("bio, experiences, formation")
          .eq("user_id", user.id).maybeSingle()
          .then(({ data: extra }) => {
            if (extra) {
              setBio((extra as { bio?: string }).bio ?? "");
              setExperiences((extra as { experiences?: Experience[] }).experiences ?? []);
              setFormation((extra as { formation?: Formation[] }).formation ?? []);
            }
          });

        const [{ data: projs }, { data: contracts }, { data: fReviews }, { data: myR }] = await Promise.all([
          supabase.from("projects").select("*").eq("founder_id", p.id).order("created_at", { ascending: false }),
          supabase.from("contracts").select("id, project_id").eq("founder_id", p.id),
          supabase.from("reviews").select("rating").eq("reviewed_id", user.id),
          supabase.from("reviews").select("project_id").eq("reviewer_id", user.id),
        ]);
        setProjects(projs ?? []);
        const map: Record<string, string> = {};
        (contracts ?? []).forEach((c) => { map[c.project_id] = c.id; });
        setContractMap(map);
        if (fReviews?.length) {
          setScore(Math.round(fReviews.reduce((s, rv) => s + rv.rating, 0) / fReviews.length * 10) / 10);
          setReviewCount(fReviews.length);
        }
        if (myR) setReviewedProjects(new Set(myR.map((rv) => rv.project_id)));
      }

      if (r === "developer") {
        const { data: p } = await supabase
          .from("profiles_developer")
          .select("id, nom, ecole, competences, github, linkedin, dispo_heures_semaine, avatar_url")
          .eq("user_id", user.id).maybeSingle();
        if (!p) { router.push("/onboarding"); return; }
        setNom(p.nom ?? ""); setEcole(p.ecole ?? "");
        setCompetences(p.competences ?? []); setGithub(p.github ?? "");
        setLinkedin(p.linkedin ?? ""); setDispo(p.dispo_heures_semaine ?? "");
        setAvatarUrl(p.avatar_url ?? null); setProfileId(p.id);

        // Nouvelles colonnes (optionnelles)
        supabase.from("profiles_developer").select("bio, experiences, formation")
          .eq("user_id", user.id).maybeSingle()
          .then(({ data: extra }) => {
            if (extra) {
              setBio((extra as { bio?: string }).bio ?? "");
              setExperiences((extra as { experiences?: Experience[] }).experiences ?? []);
              setFormation((extra as { formation?: Formation[] }).formation ?? []);
            }
          });

        const [{ data: cands }, { data: devContracts }, { data: reviews }, { data: myR }] = await Promise.all([
          supabase.from("candidatures")
            .select("id, statut, project_id, projects(titre, description, stack_souhaitee, deadline, statut)")
            .eq("developer_id", p.id).order("created_at", { ascending: false }),
          supabase.from("contracts").select("id, project_id").eq("developer_id", p.id),
          supabase.from("reviews").select("rating").eq("reviewed_id", user.id),
          supabase.from("reviews").select("project_id").eq("reviewer_id", user.id),
        ]);
        setCandidatures((cands as unknown as Candidature[]) ?? []);
        const devMap: Record<string, string> = {};
        (devContracts ?? []).forEach((c) => { devMap[c.project_id] = c.id; });
        setContractMap(devMap);
        if (reviews?.length) {
          setScore(Math.round(reviews.reduce((s, rv) => s + rv.rating, 0) / reviews.length * 10) / 10);
          setReviewCount(reviews.length);
        }
        if (myR) setReviewedProjects(new Set(myR.map((rv) => rv.project_id)));
      }

      setLoading(false);
    }
    load();
  }, [router]);

  // ── Ouvrir / fermer le mode édition ──────────────────────────────────────────

  function openEdit() {
    setEditNom(nom); setEditEcole(ecole); setEditBio(bio);
    setEditGithub(github); setEditLinkedin(linkedin); setEditDispo(dispo);
    setEditComp([...competences]); setEditExps([...experiences]); setEditForms([...formation]);
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); }

  async function saveEdit() {
    if (!profileId || !role) return;
    setSaving(true);
    const table = role === "founder" ? "profiles_founder" : "profiles_developer";
    const base: Record<string, unknown> = { nom: editNom, ecole: editEcole };
    if (role === "developer") {
      base.github = editGithub; base.linkedin = editLinkedin;
      base.dispo_heures_semaine = editDispo || null;
      base.competences = editComp;
    }
    // Toujours tenter d'enregistrer bio/exp/formation (ignoré si colonnes absentes)
    try { Object.assign(base, { bio: editBio, experiences: editExps, formation: editForms }); } catch {}
    await supabase.from(table).update(base).eq("id", profileId);
    setNom(editNom); setEcole(editEcole); setBio(editBio);
    setGithub(editGithub); setLinkedin(editLinkedin); setDispo(editDispo);
    setCompetences(editComp); setExperiences(editExps); setFormation(editForms);
    setSaving(false);
    setEditing(false);
  }

  // ── Avatar ────────────────────────────────────────────────────────────────────

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

  // ── Modals expérience ─────────────────────────────────────────────────────────

  function openExpModal(exp?: Experience) {
    setEditingExp(exp ?? null);
    setExpFields(exp
      ? { titre: exp.titre, entreprise: exp.entreprise, date_debut: exp.date_debut, date_fin: exp.date_fin ?? "", description: exp.description ?? "" }
      : { titre: "", entreprise: "", date_debut: "", date_fin: "", description: "" });
    setShowExpModal(true);
  }

  function saveExp() {
    if (!expFields.titre || !expFields.entreprise) return;
    const entry: Experience = {
      id: editingExp?.id ?? newId(), titre: expFields.titre, entreprise: expFields.entreprise,
      date_debut: expFields.date_debut, date_fin: expFields.date_fin || undefined,
      description: expFields.description || undefined,
    };
    setEditExps(editingExp ? editExps.map((e) => e.id === editingExp.id ? entry : e) : [...editExps, entry]);
    setShowExpModal(false);
  }

  function deleteExp(id: string) { setEditExps(editExps.filter((e) => e.id !== id)); }

  // ── Modals formation ──────────────────────────────────────────────────────────

  function openFormModal(f?: Formation) {
    setEditingForm(f ?? null);
    setFormFields(f
      ? { diplome: f.diplome, etablissement: f.etablissement, annee: f.annee ?? "", description: f.description ?? "" }
      : { diplome: "", etablissement: "", annee: "", description: "" });
    setShowFormModal(true);
  }

  function saveForm() {
    if (!formFields.diplome || !formFields.etablissement) return;
    const entry: Formation = {
      id: editingForm?.id ?? newId(), diplome: formFields.diplome,
      etablissement: formFields.etablissement, annee: formFields.annee || undefined,
      description: formFields.description || undefined,
    };
    setEditForms(editingForm ? editForms.map((f) => f.id === editingForm.id ? entry : f) : [...editForms, entry]);
    setShowFormModal(false);
  }

  function deleteForm(id: string) { setEditForms(editForms.filter((f) => f.id !== id)); }

  // ── Projet founder ────────────────────────────────────────────────────────────

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
    if (!confirm("Supprimer ce projet ?")) return;
    await supabase.from("projects").delete().eq("id", projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
    </div>
  );

  const isFounder = role === "founder";

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDU — Mode édition
  // ══════════════════════════════════════════════════════════════════════════════

  if (editing) {
    return (
      <div className="min-h-screen bg-slate-100 pb-24">
        {/* Header édition */}
        <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-800 font-semibold text-sm">
              ← Annuler
            </button>
            <h1 className="text-base font-black text-slate-900">Modifier le profil</h1>
            <button onClick={saveEdit} disabled={saving} className="btn-pink px-4 py-2 text-sm">
              {saving ? "..." : "Enregistrer"}
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">

          {/* Photo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Photo de profil</p>
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={nom} className="w-20 h-20 rounded-full object-cover border-2 border-slate-200" />
                ) : (
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-black ${isFounder ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                    {nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="btn-ghost px-4 py-2 text-sm">
                {uploadingAvatar ? "Envoi..." : "Changer la photo"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
          </div>

          {/* Infos de base */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Informations</p>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Nom complet</label>
              <input value={editNom} onChange={(e) => setEditNom(e.target.value)} className="input-field" placeholder="Ton nom" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">École / Université</label>
              <input value={editEcole} onChange={(e) => setEditEcole(e.target.value)} className="input-field" placeholder="HEC, 42, EPITECH..." />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Bio</label>
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} maxLength={300}
                className="input-field resize-none" placeholder="Présente-toi en quelques mots..." />
            </div>
          </div>

          {/* Liens (dev uniquement) */}
          {!isFounder && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Liens & disponibilité</p>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">GitHub</label>
                <input value={editGithub} onChange={(e) => setEditGithub(e.target.value)} className="input-field" placeholder="https://github.com/..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">LinkedIn</label>
                <input value={editLinkedin} onChange={(e) => setEditLinkedin(e.target.value)} className="input-field" placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Disponibilité (h/semaine)</label>
                <input type="number" value={editDispo} onChange={(e) => setEditDispo(Number(e.target.value))} className="input-field w-32" placeholder="10" />
              </div>
            </div>
          )}

          {/* Compétences (dev uniquement) */}
          {!isFounder && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Compétences</p>
              <div className="flex flex-wrap gap-2">
                {editComp.map((c) => (
                  <div key={c} className="flex items-center gap-1 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
                    <span className="text-sm font-semibold text-blue-600">{c}</span>
                    <button onClick={() => setEditComp(editComp.filter((x) => x !== c))} className="text-blue-400 hover:text-red-500 text-xs font-bold ml-1">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newComp} onChange={(e) => setNewComp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newComp.trim()) { setEditComp([...editComp, newComp.trim()]); setNewComp(""); } }}
                  placeholder="React, Node.js..." className="input-field flex-1 text-sm" />
                <button onClick={() => { if (newComp.trim()) { setEditComp([...editComp, newComp.trim()]); setNewComp(""); } }}
                  className="btn-pink px-4 py-2 text-sm">Ajouter</button>
              </div>
            </div>
          )}

          {/* Expériences */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Expériences</p>
              <button onClick={() => openExpModal()} className="text-sm font-semibold text-pink-500 hover:text-pink-700">+ Ajouter</button>
            </div>
            {editExps.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Aucune expérience ajoutée</p>
            ) : (
              <div className="flex flex-col gap-3">
                {editExps.map((exp) => (
                  <div key={exp.id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm">{exp.titre}</p>
                      <p className="text-xs text-slate-500">{exp.entreprise} · {exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openExpModal(exp)} className="text-xs text-slate-400 hover:text-slate-700">✏️</button>
                      <button onClick={() => deleteExp(exp.id)} className="text-xs text-slate-400 hover:text-red-500">✕</button>
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
              <button onClick={() => openFormModal()} className="text-sm font-semibold text-pink-500 hover:text-pink-700">+ Ajouter</button>
            </div>
            {editForms.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Aucune formation ajoutée</p>
            ) : (
              <div className="flex flex-col gap-3">
                {editForms.map((f) => (
                  <div key={f.id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm">{f.diplome}</p>
                      <p className="text-xs text-slate-500">{f.etablissement}{f.annee ? ` · ${f.annee}` : ""}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openFormModal(f)} className="text-xs text-slate-400 hover:text-slate-700">✏️</button>
                      <button onClick={() => deleteForm(f.id)} className="text-xs text-slate-400 hover:text-red-500">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={saveEdit} disabled={saving} className="btn-pink w-full py-4">
            {saving ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
          <button onClick={cancelEdit} className="btn-ghost w-full py-3">Annuler</button>
        </div>

        {/* Modal expérience */}
        {showExpModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-3">
              <h2 className="text-base font-black">{editingExp ? "Modifier" : "Ajouter"} une expérience</h2>
              <input value={expFields.titre} onChange={(e) => setExpFields({ ...expFields, titre: e.target.value })} placeholder="Titre du poste" className="input-field" />
              <input value={expFields.entreprise} onChange={(e) => setExpFields({ ...expFields, entreprise: e.target.value })} placeholder="Entreprise / Projet" className="input-field" />
              <div className="grid grid-cols-2 gap-2">
                <input value={expFields.date_debut} onChange={(e) => setExpFields({ ...expFields, date_debut: e.target.value })} placeholder="Début (ex: Jan 2024)" className="input-field text-sm py-2" />
                <input value={expFields.date_fin} onChange={(e) => setExpFields({ ...expFields, date_fin: e.target.value })} placeholder="Fin (vide=présent)" className="input-field text-sm py-2" />
              </div>
              <textarea value={expFields.description} onChange={(e) => setExpFields({ ...expFields, description: e.target.value })} placeholder="Description (optionnel)" rows={2} className="input-field resize-none" />
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
              <input value={formFields.diplome} onChange={(e) => setFormFields({ ...formFields, diplome: e.target.value })} placeholder="Diplôme / Certification" className="input-field" />
              <input value={formFields.etablissement} onChange={(e) => setFormFields({ ...formFields, etablissement: e.target.value })} placeholder="École / Établissement" className="input-field" />
              <input value={formFields.annee} onChange={(e) => setFormFields({ ...formFields, annee: e.target.value })} placeholder="Année (ex: 2024)" className="input-field" />
              <textarea value={formFields.description} onChange={(e) => setFormFields({ ...formFields, description: e.target.value })} placeholder="Description (optionnel)" rows={2} className="input-field resize-none" />
              <button onClick={saveForm} className="btn-pink w-full py-3">Valider</button>
              <button onClick={() => setShowFormModal(false)} className="btn-ghost w-full py-2">Annuler</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDU — Mode vue
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-100 pb-24">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-pink-500">Mon profil</p>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={openEdit} className="btn-ghost px-4 py-2 text-sm font-semibold">
              ✏️ Modifier
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">

        {/* Carte identité */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <div className="relative group shrink-0">
              <button onClick={() => fileInputRef.current?.click()}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={nom} className="w-20 h-20 rounded-full object-cover border-2 border-slate-200" />
                ) : (
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-black ${isFounder ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                    {nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs">
                  {uploadingAvatar ? "..." : "📷"}
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900">{nom || "—"}</h1>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isFounder ? "bg-pink-50 text-pink-600" : "bg-blue-50 text-blue-600"}`}>
                  {isFounder ? "Founder" : "Développeur"}
                </span>
              </div>
              {ecole && <p className="text-sm text-slate-500 mt-0.5">{ecole}</p>}
              {score !== null && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex gap-0.5">{[1,2,3,4,5].map((s) => <span key={s} className={`text-sm ${s <= Math.round(score) ? "text-amber-400" : "text-slate-200"}`}>★</span>)}</div>
                  <span className="text-sm font-bold text-slate-900">{score}/5</span>
                  <span className="text-xs text-slate-400">({reviewCount} avis)</span>
                </div>
              )}
            </div>
          </div>
          {bio && <p className="text-sm text-slate-600 leading-relaxed mt-4 pt-4 border-t border-slate-100">{bio}</p>}
        </div>

        {/* Liens dev */}
        {!isFounder && (dispo || github || linkedin) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Liens & dispo</p>
            <div className="flex flex-wrap gap-2">
              {dispo ? <span className="text-sm font-semibold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">⏱ {dispo}h/sem</span> : null}
              {github ? <a href={github} target="_blank" rel="noreferrer" className="text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors">GitHub ↗</a> : null}
              {linkedin ? <a href={linkedin} target="_blank" rel="noreferrer" className="text-sm font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors">LinkedIn ↗</a> : null}
            </div>
          </div>
        )}

        {/* Compétences dev */}
        {!isFounder && competences.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Compétences</p>
            <div className="flex flex-wrap gap-2">
              {competences.map((c) => (
                <span key={c} className="text-sm font-semibold bg-blue-50 border border-blue-100 text-blue-600 px-3 py-1.5 rounded-full">{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Expériences */}
        {experiences.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Expériences</p>
            <div className="flex flex-col divide-y divide-slate-100">
              {experiences.map((exp) => (
                <div key={exp.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="text-xl mt-0.5">💼</span>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{exp.titre}</p>
                    <p className="text-xs text-slate-500">{exp.entreprise} · {exp.date_debut}{exp.date_fin ? ` → ${exp.date_fin}` : " → Présent"}</p>
                    {exp.description && <p className="text-xs text-slate-400 mt-1">{exp.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formation */}
        {formation.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Formation</p>
            <div className="flex flex-col divide-y divide-slate-100">
              {formation.map((f) => (
                <div key={f.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="text-xl mt-0.5">🎓</span>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{f.diplome}</p>
                    <p className="text-xs text-slate-500">{f.etablissement}{f.annee ? ` · ${f.annee}` : ""}</p>
                    {f.description && <p className="text-xs text-slate-400 mt-1">{f.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA Founder */}
        {isFounder && (
          <button onClick={() => router.push("/projets/nouveau")} className="btn-pink w-full py-3">
            + Déposer un nouveau projet
          </button>
        )}

        {/* Projets founder */}
        {isFounder && projects.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Mes projets ({projects.length})</p>
            <div className="flex flex-col gap-3">
              {projects.map((p) => {
                const s = STATUT_PROJET[p.statut] ?? { label: p.statut, color: "bg-slate-100 text-slate-500" };
                return (
                  <div key={p.id} className="border border-slate-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-bold text-slate-900 text-sm">{p.titre}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${s.color}`}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {(p.statut === "matched" || p.statut === "en_cours") && <>
                        <button onClick={() => router.push(`/projets/${p.id}/gestion`)} className="text-xs font-semibold text-slate-500 hover:text-pink-500">🗂 Gestion</button>
                        <button onClick={() => handleLivrer(p.id)} className="text-xs font-semibold text-green-600 hover:text-green-800">✓ Livrer</button>
                      </>}
                      {(p.statut === "livre" || p.statut === "termine") && !reviewedProjects.has(p.id) && (
                        <button onClick={() => router.push(`/projets/${p.id}/review`)} className="text-xs font-semibold text-amber-500">⭐ Avis</button>
                      )}
                      {contractMap[p.id] && (
                        <button onClick={() => router.push(`/contrat/${contractMap[p.id]}`)} className="text-xs font-semibold text-slate-500 hover:text-pink-500">📄 Contrat</button>
                      )}
                      <button onClick={() => router.push(`/projets/${p.id}/candidats`)} className="text-xs font-semibold text-pink-500 hover:text-pink-700">Candidats →</button>
                      <button onClick={() => handleDeleteProject(p.id)} className="text-xs text-red-400 hover:text-red-600 ml-auto">Supprimer</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Candidatures dev */}
        {!isFounder && candidatures.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Mes candidatures ({candidatures.length})</p>
            <div className="flex flex-col gap-3">
              {candidatures.map((c) => {
                const s = STATUT_CAND[c.statut] ?? { label: c.statut, color: "bg-slate-100 text-slate-500" };
                return (
                  <div key={c.id} className="border border-slate-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-bold text-slate-900 text-sm">{c.projects.titre}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${s.color}`}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.statut === "accepted" && contractMap[c.project_id] && (
                        <button onClick={() => router.push(`/contrat/${contractMap[c.project_id]}`)} className="text-xs font-semibold text-slate-500 hover:text-pink-500">📄 Contrat</button>
                      )}
                      {c.statut === "accepted" && ["livre","termine"].includes(c.projects?.statut ?? "") && !reviewedProjects.has(c.project_id) && (
                        <button onClick={() => router.push(`/projets/${c.project_id}/review`)} className="text-xs font-semibold text-amber-500">⭐ Avis</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Aperçu public + déconnexion */}
        <div className="flex gap-3">
          <button onClick={() => router.push(`/profil/${userId}`)} className="flex-1 btn-ghost py-3 text-sm">
            Aperçu public
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
            className="flex-1 btn-ghost py-3 text-sm text-red-500 hover:text-red-700">
            Déconnexion
          </button>
        </div>

      </div>
      <BottomNav />
    </div>
  );
}
