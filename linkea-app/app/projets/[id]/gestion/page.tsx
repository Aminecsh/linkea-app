"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Sprint = {
  id: string;
  nom: string;
  objectif?: string;
  date_debut: string;
  date_fin: string;
  statut: "a_venir" | "en_cours" | "termine";
};

type Task = {
  id: string;
  sprint_id: string | null;
  titre: string;
  description?: string;
  statut: "todo" | "en_cours" | "review" | "done";
  priorite: "basse" | "normale" | "haute";
  assigne_a: string | null;
};

type Member = { user_id: string; nom: string; role: "founder" | "developer" };

const COLONNES: { key: Task["statut"]; label: string; color: string }[] = [
  { key: "todo",     label: "À faire",    color: "bg-slate-100 text-slate-600" },
  { key: "en_cours", label: "En cours",   color: "bg-blue-50 text-blue-600" },
  { key: "review",   label: "En review",  color: "bg-amber-50 text-amber-600" },
  { key: "done",     label: "Terminé",    color: "bg-green-50 text-green-600" },
];

const PRIORITE_STYLE: Record<string, string> = {
  haute:   "bg-red-50 text-red-500 border-red-200",
  normale: "bg-slate-50 text-slate-500 border-slate-200",
  basse:   "bg-green-50 text-green-500 border-green-200",
};

export default function GestionPage() {
  const router = useRouter();
  const { id: projectId } = useParams<{ id: string }>();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectTitre, setProjectTitre] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);

  // Modals
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // Formulaire sprint
  const [sprintNom, setSprintNom] = useState("");
  const [sprintObjectif, setSprintObjectif] = useState("");
  const [sprintDebut, setSprintDebut] = useState("");
  const [sprintFin, setSprintFin] = useState("");
  const [savingSprint, setSavingSprint] = useState(false);

  // Formulaire tâche
  const [taskTitre, setTaskTitre] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriorite, setTaskPriorite] = useState<Task["priorite"]>("normale");
  const [taskSprint, setTaskSprint] = useState<string>("");
  const [taskAssigne, setTaskAssigne] = useState<string>("");
  const [savingTask, setSavingTask] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? null;
      setRole(r);

      // Vérifier accès au projet
      const { data: proj } = await supabase
        .from("projects")
        .select("titre, statut, founder_id, profiles_founder(nom, user_id)")
        .eq("id", projectId)
        .maybeSingle();

      if (!proj) { router.push("/projets"); return; }
      if (!["matched", "en_cours"].includes(proj.statut)) { router.push(`/projets/${projectId}`); return; }
      setProjectTitre(proj.titre);

      // Membres (founder + dev via conversation)
      const membersArr: Member[] = [];
      const founderProfile = proj.profiles_founder as unknown as { nom: string; user_id: string };
      if (founderProfile) membersArr.push({ user_id: founderProfile.user_id, nom: founderProfile.nom, role: "founder" });

      const { data: conv } = await supabase
        .from("conversations")
        .select("profiles_developer(nom, user_id)")
        .eq("project_id", projectId)
        .maybeSingle();
      const devProfile = conv?.profiles_developer as unknown as { nom: string; user_id: string } | null;
      if (devProfile) membersArr.push({ user_id: devProfile.user_id, nom: devProfile.nom, role: "developer" });
      setMembers(membersArr);

      // Sprints
      const { data: sprintsData } = await supabase
        .from("sprints")
        .select("*")
        .eq("project_id", projectId)
        .order("date_debut", { ascending: true });
      setSprints((sprintsData as Sprint[]) ?? []);

      // Auto-sélectionner le sprint en cours
      const enCours = (sprintsData as Sprint[] ?? []).find((s) => s.statut === "en_cours");
      if (enCours) setSelectedSprintId(enCours.id);

      // Tâches
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      setTasks((tasksData as Task[]) ?? []);

      setLoading(false);
    }
    load();
  }, [projectId, router]);

  // ── Sprints ───────────────────────────────────────────────────────────────

  async function handleCreateSprint() {
    if (!sprintNom || !sprintDebut || !sprintFin) return;
    setSavingSprint(true);

    const { data } = await supabase.from("sprints").insert({
      project_id: projectId,
      nom: sprintNom,
      objectif: sprintObjectif || null,
      date_debut: sprintDebut,
      date_fin: sprintFin,
      statut: "a_venir",
    }).select().maybeSingle();

    if (data) {
      setSprints((prev) => [...prev, data as Sprint]);
      setSelectedSprintId(data.id);
    }

    setSprintNom(""); setSprintObjectif(""); setSprintDebut(""); setSprintFin("");
    setShowSprintModal(false);
    setSavingSprint(false);
  }

  async function handleSprintStatut(sprint: Sprint, statut: Sprint["statut"]) {
    await supabase.from("sprints").update({ statut }).eq("id", sprint.id);
    setSprints((prev) => prev.map((s) => s.id === sprint.id ? { ...s, statut } : s));
  }

  // ── Tâches ────────────────────────────────────────────────────────────────

  function openCreateTask() {
    setEditTask(null);
    setTaskTitre(""); setTaskDesc(""); setTaskPriorite("normale");
    setTaskSprint(selectedSprintId === "all" ? (sprints[0]?.id ?? "") : selectedSprintId);
    setTaskAssigne("");
    setShowTaskModal(true);
  }

  function openEditTask(task: Task) {
    setEditTask(task);
    setTaskTitre(task.titre);
    setTaskDesc(task.description ?? "");
    setTaskPriorite(task.priorite);
    setTaskSprint(task.sprint_id ?? "");
    setTaskAssigne(task.assigne_a ?? "");
    setShowTaskModal(true);
  }

  async function handleSaveTask() {
    if (!taskTitre.trim()) return;
    setSavingTask(true);

    const payload = {
      project_id: projectId,
      sprint_id: taskSprint || null,
      titre: taskTitre.trim(),
      description: taskDesc || null,
      priorite: taskPriorite,
      assigne_a: taskAssigne || null,
    };

    if (editTask) {
      await supabase.from("tasks").update(payload).eq("id", editTask.id);
      setTasks((prev) => prev.map((t) => t.id === editTask.id ? { ...t, ...payload } : t));
    } else {
      const { data } = await supabase.from("tasks").insert({ ...payload, statut: "todo" }).select().maybeSingle();
      if (data) setTasks((prev) => [...prev, data as Task]);
    }

    setShowTaskModal(false);
    setSavingTask(false);
  }

  async function handleMoveTask(task: Task, direction: "next" | "prev") {
    const order: Task["statut"][] = ["todo", "en_cours", "review", "done"];
    const idx = order.indexOf(task.statut);
    const newIdx = direction === "next" ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= order.length) return;
    const newStatut = order[newIdx];
    await supabase.from("tasks").update({ statut: newStatut }).eq("id", task.id);
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, statut: newStatut } : t));
  }

  async function handleDeleteTask(taskId: string) {
    await supabase.from("tasks").delete().eq("id", taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  // ── Filtrage ──────────────────────────────────────────────────────────────

  const filteredTasks = selectedSprintId === "all"
    ? tasks
    : tasks.filter((t) => t.sprint_id === selectedSprintId);

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);

  const daysLeft = selectedSprint
    ? Math.ceil((new Date(selectedSprint.date_fin).getTime() - Date.now()) / 86400000)
    : null;

  const donePct = filteredTasks.length > 0
    ? Math.round(filteredTasks.filter((t) => t.statut === "done").length / filteredTasks.length * 100)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-slate-900 text-base truncate">{projectTitre}</h1>
            <p className="text-xs text-slate-400">Gestion de projet</p>
          </div>
          <button onClick={openCreateTask} className="btn-pink px-4 py-2 text-sm shrink-0">
            + Tâche
          </button>
          {role === "founder" && (
            <button
              onClick={() => setShowSprintModal(true)}
              className="btn-ghost px-4 py-2 text-sm shrink-0"
            >
              + Sprint
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">

        {/* Sélecteur de sprint */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          <button
            onClick={() => setSelectedSprintId("all")}
            className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
              selectedSprintId === "all"
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            Tout
          </button>
          {sprints.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSprintId(s.id)}
              className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
                selectedSprintId === s.id
                  ? s.statut === "en_cours" ? "bg-pink-500 text-white border-pink-500"
                  : s.statut === "termine" ? "bg-green-500 text-white border-green-500"
                  : "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {s.nom}
            </button>
          ))}
        </div>

        {/* Infos sprint sélectionné */}
        {selectedSprint && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-bold text-slate-900">{selectedSprint.nom}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  selectedSprint.statut === "en_cours" ? "bg-blue-50 text-blue-600"
                  : selectedSprint.statut === "termine" ? "bg-green-50 text-green-600"
                  : "bg-slate-100 text-slate-500"
                }`}>
                  {selectedSprint.statut === "en_cours" ? "En cours"
                   : selectedSprint.statut === "termine" ? "Terminé"
                   : "À venir"}
                </span>
              </div>
              {selectedSprint.objectif && (
                <p className="text-sm text-slate-500 mb-2">{selectedSprint.objectif}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span>📅 {new Date(selectedSprint.date_debut).toLocaleDateString("fr-FR")} → {new Date(selectedSprint.date_fin).toLocaleDateString("fr-FR")}</span>
                {daysLeft !== null && selectedSprint.statut !== "termine" && (
                  <span className={daysLeft < 3 ? "text-red-500 font-bold" : ""}>
                    {daysLeft > 0 ? `${daysLeft}j restants` : "Expiré"}
                  </span>
                )}
              </div>
            </div>

            {/* Barre de progression */}
            <div className="w-full sm:w-48">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Avancement</span>
                <span className="font-bold">{donePct}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full transition-all"
                  style={{ width: `${donePct}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {filteredTasks.filter((t) => t.statut === "done").length}/{filteredTasks.length} tâches
              </p>
            </div>

            {/* Actions sprint (founder) */}
            {role === "founder" && (
              <div className="flex gap-2 flex-wrap">
                {selectedSprint.statut === "a_venir" && (
                  <button
                    onClick={() => handleSprintStatut(selectedSprint, "en_cours")}
                    className="text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    ▶ Démarrer
                  </button>
                )}
                {selectedSprint.statut === "en_cours" && (
                  <button
                    onClick={() => handleSprintStatut(selectedSprint, "termine")}
                    className="text-xs font-semibold text-green-600 border border-green-200 bg-green-50 px-3 py-1.5 rounded-full hover:bg-green-100 transition-colors"
                  >
                    ✓ Terminer
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* État vide : pas de sprint */}
        {sprints.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 mb-5">
            <p className="text-slate-400 text-sm mb-3">Aucun sprint créé pour l'instant.</p>
            {role === "founder" && (
              <button onClick={() => setShowSprintModal(true)} className="btn-pink px-6 py-2 text-sm">
                Créer le premier sprint
              </button>
            )}
          </div>
        )}

        {/* Kanban */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {COLONNES.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.statut === col.key);
            return (
              <div key={col.key} className="flex flex-col gap-2">
                {/* Header colonne */}
                <div className="flex items-center justify-between px-1">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">{colTasks.length}</span>
                </div>

                {/* Cartes */}
                <div className="flex flex-col gap-2 min-h-[120px]">
                  {colTasks.map((task) => {
                    const assignedMember = members.find((m) => m.user_id === task.assigne_a);
                    const sprintLabel = sprints.find((s) => s.id === task.sprint_id)?.nom;
                    return (
                      <div
                        key={task.id}
                        className="bg-white border border-slate-200 rounded-xl p-3 hover:border-pink-200 hover:shadow-sm transition-all group"
                      >
                        <p className="text-sm font-semibold text-slate-900 leading-snug mb-2">{task.titre}</p>

                        {task.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-2">{task.description}</p>
                        )}

                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIORITE_STYLE[task.priorite]}`}>
                            {task.priorite}
                          </span>
                          {sprintLabel && selectedSprintId === "all" && (
                            <span className="text-xs font-semibold bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full">
                              {sprintLabel}
                            </span>
                          )}
                        </div>

                        {assignedMember && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black ${assignedMember.role === "founder" ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                              {assignedMember.nom[0].toUpperCase()}
                            </div>
                            <span className="text-xs text-slate-500">{assignedMember.nom}</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-between mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleMoveTask(task, "prev")}
                              disabled={task.statut === "todo"}
                              className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-20 transition-colors"
                            >
                              ←
                            </button>
                            <button
                              onClick={() => handleMoveTask(task, "next")}
                              disabled={task.statut === "done"}
                              className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-20 transition-colors"
                            >
                              →
                            </button>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEditTask(task)}
                              className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Ajouter tâche rapide */}
                  <button
                    onClick={openCreateTask}
                    className="text-xs text-slate-400 hover:text-pink-500 py-2 border-2 border-dashed border-slate-200 hover:border-pink-300 rounded-xl transition-all"
                  >
                    + Ajouter
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modal Sprint ─────────────────────────────────────────────────── */}
      {showSprintModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="text-lg font-black text-slate-900">Nouveau sprint</h2>

            <input
              type="text"
              placeholder="Nom du sprint (ex: Sprint 1 – Auth)"
              value={sprintNom}
              onChange={(e) => setSprintNom(e.target.value)}
              className="input-field"
            />
            <input
              type="text"
              placeholder="Objectif (optionnel)"
              value={sprintObjectif}
              onChange={(e) => setSprintObjectif(e.target.value)}
              className="input-field"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Début</label>
                <input type="date" value={sprintDebut} onChange={(e) => setSprintDebut(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Fin</label>
                <input type="date" value={sprintFin} onChange={(e) => setSprintFin(e.target.value)} className="input-field" />
              </div>
            </div>

            <button onClick={handleCreateSprint} disabled={savingSprint || !sprintNom || !sprintDebut || !sprintFin} className="btn-pink w-full py-3">
              {savingSprint ? "Création..." : "Créer le sprint"}
            </button>
            <button onClick={() => setShowSprintModal(false)} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}

      {/* ── Modal Tâche ──────────────────────────────────────────────────── */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-black text-slate-900">{editTask ? "Modifier la tâche" : "Nouvelle tâche"}</h2>

            <input
              type="text"
              placeholder="Titre de la tâche"
              value={taskTitre}
              onChange={(e) => setTaskTitre(e.target.value)}
              className="input-field"
            />
            <textarea
              placeholder="Description (optionnel)"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              rows={3}
              className="input-field resize-none"
            />

            {/* Priorité */}
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-2 block">Priorité</label>
              <div className="flex gap-2">
                {(["basse", "normale", "haute"] as Task["priorite"][]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setTaskPriorite(p)}
                    className={`flex-1 text-xs font-semibold py-2 rounded-xl border transition-all capitalize ${
                      taskPriorite === p ? PRIORITE_STYLE[p] + " font-bold" : "bg-white text-slate-400 border-slate-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Sprint */}
            {sprints.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Sprint</label>
                <select value={taskSprint} onChange={(e) => setTaskSprint(e.target.value)} className="input-field">
                  <option value="">— Aucun sprint —</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.nom}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Assigné à */}
            {members.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Assigné à</label>
                <select value={taskAssigne} onChange={(e) => setTaskAssigne(e.target.value)} className="input-field">
                  <option value="">— Non assigné —</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.nom} ({m.role})</option>
                  ))}
                </select>
              </div>
            )}

            <button onClick={handleSaveTask} disabled={savingTask || !taskTitre.trim()} className="btn-pink w-full py-3">
              {savingTask ? "Enregistrement..." : editTask ? "Enregistrer" : "Créer la tâche"}
            </button>
            <button onClick={() => setShowTaskModal(false)} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
