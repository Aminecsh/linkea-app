"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  titre: string;
  description: string;
  stack_souhaitee: string;
  deadline: string;
  statut: string;
  profiles_founder: {
    nom: string;
    ecole?: string;
    user_id: string;
    avatar_url?: string;
  };
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitre, setEditTitre] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStack, setEditStack] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      const { data: proj } = await supabase
        .from("projects")
        .select("id, titre, description, stack_souhaitee, deadline, statut, profiles_founder(nom, ecole, user_id, avatar_url)")
        .eq("id", id)
        .maybeSingle();

      if (!proj) { router.push("/projets"); return; }
      const p = proj as unknown as Project;
      setProject(p);

      const fp = Array.isArray(p.profiles_founder) ? p.profiles_founder[0] : p.profiles_founder;
      if (fp?.user_id === user.id && p.statut === "pending") {
        setIsOwner(true);
      }

      if (r === "developer") {
        const { data: profile } = await supabase
          .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
        if (profile) {
          setDeveloperId(profile.id);
          const { data: cand } = await supabase
            .from("candidatures").select("id").eq("project_id", id).eq("developer_id", profile.id).maybeSingle();
          setHasApplied(!!cand);
        }
      }

      setLoading(false);
    }
    load();
  }, [id, router]);

  function startEdit() {
    if (!project) return;
    setEditTitre(project.titre ?? "");
    setEditDesc(project.description ?? "");
    setEditStack(project.stack_souhaitee ?? "");
    setEditDeadline(project.deadline ?? "");
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!project || saving) return;
    if (!editTitre.trim()) { setSaveError("Le titre est requis."); return; }
    setSaving(true);
    setSaveError(null);

    const { error } = await supabase.from("projects").update({
      titre: editTitre.trim(),
      description: editDesc.trim() || null,
      stack_souhaitee: editStack.trim() || null,
      deadline: editDeadline.trim() || null,
    }).eq("id", project.id);

    if (error) {
      setSaveError("Erreur lors de la sauvegarde.");
      setSaving(false);
      return;
    }

    setProject((prev) => prev ? {
      ...prev,
      titre: editTitre.trim(),
      description: editDesc.trim(),
      stack_souhaitee: editStack.trim(),
      deadline: editDeadline.trim(),
    } : prev);
    setSaving(false);
    setEditing(false);
  }

  async function handleCandidater() {
    if (!developerId || applying || hasApplied) return;
    setApplying(true);

    await supabase.from("candidatures").insert({
      project_id: id,
      developer_id: developerId,
      statut: "pending",
    });

    const projRaw = project as unknown as { founder_id?: string };
    if (projRaw?.founder_id) {
      const { data: founderData } = await supabase
        .from("profiles_founder").select("user_id, email").eq("id", projRaw.founder_id).maybeSingle();
      if (founderData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: founderData.user_id,
          type: "nouveau_candidat",
          title: "Nouveau candidat 🎉",
          body: `Un dev a candidaté sur "${project?.titre}"`,
          link: `/projets/${id}/candidats`,
        });
      }
    }

    setHasApplied(true);
    setApplying(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!project) return null;

  const stacks = project.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm font-medium">
            ← Retour
          </button>
          {isOwner && !editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Modifier
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">

          {editing ? (
            /* ── Mode édition ── */
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-slate-900">Modifier le projet</p>
                <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600">Annuler</button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Titre *</label>
                <input
                  value={editTitre}
                  onChange={(e) => setEditTitre(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-400 transition-colors"
                  placeholder="Titre du projet"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={4}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-400 transition-colors resize-none"
                  placeholder="Décris ton projet..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Stack souhaitée</label>
                <input
                  value={editStack}
                  onChange={(e) => setEditStack(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-400 transition-colors"
                  placeholder="ex: React, Node.js, PostgreSQL"
                />
                <p className="text-[11px] text-slate-400 mt-1">Sépare les technologies par des virgules</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Deadline</label>
                <input
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-400 transition-colors"
                />
              </div>

              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{saveError}</p>
              )}

              <button
                onClick={saveEdit}
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-bold bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : "Enregistrer les modifications"}
              </button>
            </div>
          ) : (
            /* ── Mode lecture ── */
            <>
              {/* Founder */}
              <button
                onClick={() => router.push(`/profil/${project.profiles_founder?.user_id}`)}
                className="flex items-center gap-3 mb-5 group w-full text-left"
              >
                {project.profiles_founder?.avatar_url ? (
                  <img src={project.profiles_founder.avatar_url} alt={project.profiles_founder.nom}
                    className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0 group-hover:opacity-80 transition-opacity" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-lg font-black shrink-0 group-hover:opacity-80 transition-opacity">
                    {project.profiles_founder?.nom?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div>
                  <p className="font-bold text-slate-900 group-hover:text-pink-500 transition-colors">{project.profiles_founder?.nom}</p>
                  {project.profiles_founder?.ecole && (
                    <p className="text-xs text-slate-400">{project.profiles_founder.ecole}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">Voir le profil →</p>
                </div>
              </button>

              <h1 className="text-2xl font-black text-slate-900 mb-2">{project.titre}</h1>

              <div className="flex flex-wrap gap-2 mb-5">
                {project.deadline && (
                  <span className="text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1.5 rounded-full">
                    📅 {project.deadline}
                  </span>
                )}
                <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full">
                  En attente d'un dev
                </span>
              </div>

              {stacks.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Stack souhaitée</p>
                  <div className="flex flex-wrap gap-2">
                    {stacks.map((s) => (
                      <span key={s} className="text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {project.description && (
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Description</p>
                  <p className="text-slate-600 text-sm leading-relaxed">{project.description}</p>
                </div>
              )}

              {role === "developer" && (
                <button
                  onClick={handleCandidater}
                  disabled={hasApplied || applying}
                  className={`w-full py-4 rounded-xl text-sm font-bold transition-all ${
                    hasApplied
                      ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
                      : "btn-pink"
                  }`}
                >
                  {applying ? "Envoi..." : hasApplied ? "✓ Candidature envoyée" : "Candidater à ce projet"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
