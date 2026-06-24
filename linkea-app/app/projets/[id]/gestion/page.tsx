"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Sprint = {
  id: string; nom: string; objectif?: string;
  date_debut: string; date_fin: string;
  statut: "a_venir" | "en_cours" | "termine";
};

type Task = {
  id: string; sprint_id: string | null; titre: string; description?: string | null;
  statut: "todo" | "en_cours" | "review" | "done";
  priorite: "basse" | "normale" | "haute";
  assigne_a: string | null; due_date?: string | null;
};

type TaskComment = { id: string; task_id: string; user_id: string; content: string; created_at: string; };
type TaskChecklist = { id: string; task_id: string; titre: string; done: boolean; ordre: number; };
type Member = { user_id: string; nom: string; role: "founder" | "developer"; };
type Deliverable = {
  id: string; project_id: string; sprint_id: string | null; uploaded_by: string;
  nom: string; file_url: string; file_type: string | null; file_size: number | null;
  description: string | null; created_at: string;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const COLONNES: { key: Task["statut"]; label: string; color: string; dot: string }[] = [
  { key: "todo",      label: "À faire",   color: "bg-slate-100 text-slate-600",  dot: "bg-slate-400" },
  { key: "en_cours",  label: "En cours",  color: "bg-blue-50 text-blue-600",     dot: "bg-blue-500" },
  { key: "review",    label: "Review",    color: "bg-amber-50 text-amber-600",   dot: "bg-amber-500" },
  { key: "done",      label: "Terminé",   color: "bg-green-50 text-green-600",   dot: "bg-green-500" },
];

const PRIO: Record<string, string> = {
  haute:   "bg-red-50 text-red-500 border-red-200",
  normale: "bg-slate-50 text-slate-500 border-slate-200",
  basse:   "bg-green-50 text-green-500 border-green-200",
};

const TABS = ["kanban", "liste", "roadmap", "fichiers"] as const;
type Tab = typeof TABS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileIcon(t: string | null) {
  if (!t) return "📎";
  if (t.startsWith("image/")) return "🖼️";
  if (t === "application/pdf") return "📄";
  if (t.includes("zip") || t.includes("rar")) return "🗜️";
  if (t.includes("word") || t.includes("document")) return "📝";
  if (t.includes("sheet") || t.includes("excel")) return "📊";
  if (t.includes("video")) return "🎬";
  return "📎";
}

function fileSize(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

function isOverdue(due: string | null | undefined) {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ══════════════════════════════════════════════════════════════════════════════
// Page principale
// ══════════════════════════════════════════════════════════════════════════════

export default function GestionPage() {
  const router = useRouter();
  const { id: projectId } = useParams<{ id: string }>();

  const [role, setRole]               = useState<string | null>(null);
  const [userId, setUserId]           = useState<string | null>(null);
  const [projectTitre, setProjectTitre] = useState("");
  const [members, setMembers]         = useState<Member[]>([]);
  const [sprints, setSprints]         = useState<Sprint[]>([]);
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | "all">("all");
  const [activeTab, setActiveTab]     = useState<Tab>("kanban");
  const [loading, setLoading]         = useState(true);

  // Filtres kanban / liste
  const [filterAssigne, setFilterAssigne] = useState<string>("all");
  const [filterPrio, setFilterPrio]       = useState<string>("all");

  // Panel détail tâche
  const [panelTask, setPanelTask]     = useState<Task | null>(null);
  const [panelComments, setPanelComments] = useState<TaskComment[]>([]);
  const [panelChecklist, setPanelChecklist] = useState<TaskChecklist[]>([]);
  const [newComment, setNewComment]   = useState("");
  const [newCheckItem, setNewCheckItem] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [savingPanel, setSavingPanel] = useState(false);

  // Édition inline dans le panel
  const [editTitle, setEditTitle]     = useState("");
  const [editDesc, setEditDesc]       = useState("");
  const [editDue, setEditDue]         = useState("");
  const [editPrio, setEditPrio]       = useState<Task["priorite"]>("normale");
  const [editSprint, setEditSprint]   = useState("");
  const [editAssigne, setEditAssigne] = useState("");

  // Modal sprint
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [sprintNom, setSprintNom]     = useState("");
  const [sprintObj, setSprintObj]     = useState("");
  const [sprintDebut, setSprintDebut] = useState("");
  const [sprintFin, setSprintFin]     = useState("");
  const [savingSprint, setSavingSprint] = useState(false);

  // Modal nouvelle tâche rapide
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitre, setTaskTitre]     = useState("");
  const [taskDesc, setTaskDesc]       = useState("");
  const [taskPrio, setTaskPrio]       = useState<Task["priorite"]>("normale");
  const [taskSprint, setTaskSprint]   = useState("");
  const [taskAssigne, setTaskAssigne] = useState("");
  const [taskDue, setTaskDue]         = useState("");
  const [savingTask, setSavingTask]   = useState(false);

  // Fichiers
  const [showFileModal, setShowFileModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileDesc, setFileDesc]       = useState("");
  const [fileSprint, setFileSprint]   = useState("");
  const [uploading, setUploading]     = useState(false);

  // ── Chargement ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);

      const { data: proj } = await supabase
        .from("projects")
        .select("titre, statut, profiles_founder(nom, user_id)")
        .eq("id", projectId).maybeSingle();

      if (!proj || !["matched","en_cours"].includes(proj.statut)) {
        router.push(`/projets/${projectId}`); return;
      }
      setProjectTitre(proj.titre);

      const membersArr: Member[] = [];
      const fp = proj.profiles_founder as unknown as { nom: string; user_id: string } | null;
      if (fp) membersArr.push({ user_id: fp.user_id, nom: fp.nom, role: "founder" });

      const { data: conv } = await supabase
        .from("conversations")
        .select("profiles_developer(nom, user_id)")
        .eq("project_id", projectId).maybeSingle();
      const dp = conv?.profiles_developer as unknown as { nom: string; user_id: string } | null;
      if (dp) membersArr.push({ user_id: dp.user_id, nom: dp.nom, role: "developer" });
      setMembers(membersArr);

      const [{ data: sprintsData }, { data: tasksData }, { data: deliData }] = await Promise.all([
        supabase.from("sprints").select("*").eq("project_id", projectId).order("date_debut"),
        supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("deliverables").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      ]);

      const spList = (sprintsData as Sprint[]) ?? [];
      setSprints(spList);
      setTasks((tasksData as Task[]) ?? []);
      setDeliverables((deliData as Deliverable[]) ?? []);

      const enCours = spList.find((s) => s.statut === "en_cours");
      if (enCours) setSelectedSprintId(enCours.id);

      setLoading(false);
    }
    load();
  }, [projectId, router]);

  // ── Panel détail ────────────────────────────────────────────────────────────

  async function openPanel(task: Task) {
    setPanelTask(task);
    setEditTitle(task.titre);
    setEditDesc(task.description ?? "");
    setEditDue(task.due_date ?? "");
    setEditPrio(task.priorite);
    setEditSprint(task.sprint_id ?? "");
    setEditAssigne(task.assigne_a ?? "");
    setPanelLoading(true);

    const [{ data: comments }, { data: checklist }] = await Promise.all([
      supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at"),
      supabase.from("task_checklists").select("*").eq("task_id", task.id).order("ordre"),
    ]);
    setPanelComments((comments as TaskComment[]) ?? []);
    setPanelChecklist((checklist as TaskChecklist[]) ?? []);
    setPanelLoading(false);
  }

  async function savePanelTask() {
    if (!panelTask) return;
    setSavingPanel(true);
    const update = {
      titre: editTitle, description: editDesc || null,
      due_date: editDue || null, priorite: editPrio,
      sprint_id: editSprint || null, assigne_a: editAssigne || null,
    };
    await supabase.from("tasks").update(update).eq("id", panelTask.id);
    setTasks((prev) => prev.map((t) => t.id === panelTask.id ? { ...t, ...update } : t));
    setPanelTask((prev) => prev ? { ...prev, ...update } : null);
    setSavingPanel(false);
  }

  async function addComment() {
    if (!newComment.trim() || !panelTask || !userId) return;
    const { data } = await supabase.from("task_comments").insert({
      task_id: panelTask.id, user_id: userId, content: newComment.trim(),
    }).select().maybeSingle();
    if (data) setPanelComments((prev) => [...prev, data as TaskComment]);
    setNewComment("");
  }

  async function deleteComment(id: string) {
    await supabase.from("task_comments").delete().eq("id", id);
    setPanelComments((prev) => prev.filter((c) => c.id !== id));
  }

  async function addCheckItem() {
    if (!newCheckItem.trim() || !panelTask) return;
    const { data } = await supabase.from("task_checklists").insert({
      task_id: panelTask.id, titre: newCheckItem.trim(),
      done: false, ordre: panelChecklist.length,
    }).select().maybeSingle();
    if (data) setPanelChecklist((prev) => [...prev, data as TaskChecklist]);
    setNewCheckItem("");
  }

  async function toggleCheckItem(item: TaskChecklist) {
    await supabase.from("task_checklists").update({ done: !item.done }).eq("id", item.id);
    setPanelChecklist((prev) => prev.map((c) => c.id === item.id ? { ...c, done: !c.done } : c));
  }

  async function deleteCheckItem(id: string) {
    await supabase.from("task_checklists").delete().eq("id", id);
    setPanelChecklist((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Tâches ──────────────────────────────────────────────────────────────────

  async function handleCreateTask() {
    if (!taskTitre.trim()) return;
    setSavingTask(true);
    const payload = {
      project_id: projectId, sprint_id: taskSprint || null,
      titre: taskTitre.trim(), description: taskDesc || null,
      statut: "todo" as Task["statut"], priorite: taskPrio,
      assigne_a: taskAssigne || null, due_date: taskDue || null,
    };
    const { data } = await supabase.from("tasks").insert(payload).select().maybeSingle();
    if (data) setTasks((prev) => [...prev, data as Task]);
    setTaskTitre(""); setTaskDesc(""); setTaskPrio("normale");
    setTaskSprint(""); setTaskAssigne(""); setTaskDue("");
    setShowTaskModal(false); setSavingTask(false);
  }

  async function moveTask(task: Task, dir: "next" | "prev") {
    const order: Task["statut"][] = ["todo","en_cours","review","done"];
    const idx = order.indexOf(task.statut);
    const newIdx = dir === "next" ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= order.length) return;
    const newStatut = order[newIdx];
    await supabase.from("tasks").update({ statut: newStatut }).eq("id", task.id);
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, statut: newStatut } : t));
    if (panelTask?.id === task.id) setPanelTask((p) => p ? { ...p, statut: newStatut } : null);
  }

  async function deleteTask(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (panelTask?.id === id) setPanelTask(null);
  }

  // ── Sprints ─────────────────────────────────────────────────────────────────

  async function createSprint() {
    if (!sprintNom || !sprintDebut || !sprintFin) return;
    setSavingSprint(true);
    const { data } = await supabase.from("sprints").insert({
      project_id: projectId, nom: sprintNom, objectif: sprintObj || null,
      date_debut: sprintDebut, date_fin: sprintFin, statut: "a_venir",
    }).select().maybeSingle();
    if (data) { setSprints((prev) => [...prev, data as Sprint]); setSelectedSprintId(data.id); }
    setSprintNom(""); setSprintObj(""); setSprintDebut(""); setSprintFin("");
    setShowSprintModal(false); setSavingSprint(false);
  }

  async function updateSprintStatut(sprint: Sprint, statut: Sprint["statut"]) {
    await supabase.from("sprints").update({ statut }).eq("id", sprint.id);
    setSprints((prev) => prev.map((s) => s.id === sprint.id ? { ...s, statut } : s));
  }

  // ── Fichiers ─────────────────────────────────────────────────────────────────

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPendingFile(file); setFileDesc("");
    setFileSprint(selectedSprintId === "all" ? (sprints[0]?.id ?? "") : selectedSprintId);
    setShowFileModal(true); e.target.value = "";
  }

  async function uploadFile() {
    if (!pendingFile || !userId) return;
    setUploading(true);
    const ext = pendingFile.name.split(".").pop();
    const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("project-files").upload(path, pendingFile);
    if (error) { setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
    const { data } = await supabase.from("deliverables").insert({
      project_id: projectId, sprint_id: fileSprint || null, uploaded_by: userId,
      nom: pendingFile.name, file_url: urlData.publicUrl,
      file_type: pendingFile.type, file_size: pendingFile.size, description: fileDesc || null,
    }).select().maybeSingle();
    if (data) setDeliverables((prev) => [data as Deliverable, ...prev]);
    setPendingFile(null); setShowFileModal(false); setUploading(false);
  }

  async function deleteFile(d: Deliverable) {
    if (d.uploaded_by !== userId && role !== "founder") return;
    await supabase.from("deliverables").delete().eq("id", d.id);
    setDeliverables((prev) => prev.filter((f) => f.id !== d.id));
  }

  // ── Filtrage ─────────────────────────────────────────────────────────────────

  const sprintFiltered = selectedSprintId === "all"
    ? tasks
    : tasks.filter((t) => t.sprint_id === selectedSprintId);

  const filtered = sprintFiltered
    .filter((t) => filterAssigne === "all" || t.assigne_a === filterAssigne)
    .filter((t) => filterPrio === "all" || t.priorite === filterPrio);

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);
  const donePct = sprintFiltered.length > 0
    ? Math.round(sprintFiltered.filter((t) => t.statut === "done").length / sprintFiltered.length * 100) : 0;
  const daysLeft = selectedSprint
    ? Math.ceil((new Date(selectedSprint.date_fin).getTime() - Date.now()) / 86400000) : null;

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // Rendu
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm shrink-0">←</button>
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-slate-900 text-base truncate">{projectTitre}</h1>
              <p className="text-xs text-slate-400">Gestion de projet</p>
            </div>
            {activeTab !== "fichiers" && activeTab !== "roadmap" && (
              <button onClick={() => setShowTaskModal(true)} className="btn-pink px-4 py-2 text-sm shrink-0">+ Tâche</button>
            )}
            {activeTab === "fichiers" && (
              <label className="btn-pink px-4 py-2 text-sm shrink-0 cursor-pointer">
                ⬆️ Fichier <input type="file" className="hidden" onChange={onFileSelect} />
              </label>
            )}
            {role === "founder" && activeTab !== "fichiers" && (
              <button onClick={() => setShowSprintModal(true)} className="btn-ghost px-4 py-2 text-sm shrink-0">+ Sprint</button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`shrink-0 text-xs font-semibold px-4 py-1.5 rounded-full transition-all ${
                  activeTab === tab ? "bg-pink-500 text-white" : "text-slate-500 hover:text-slate-800"
                }`}>
                {{ kanban:"🗂 Kanban", liste:"☰ Liste", roadmap:"🗓 Roadmap", fichiers:"📁 Fichiers" }[tab]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">

        {/* ── Sprint selector + info ─────────────────────────────────────── */}
        {activeTab !== "fichiers" && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              <button onClick={() => setSelectedSprintId("all")}
                className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
                  selectedSprintId === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}>Tout</button>
              {sprints.map((s) => (
                <button key={s.id} onClick={() => setSelectedSprintId(s.id)}
                  className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
                    selectedSprintId === s.id
                      ? s.statut === "en_cours" ? "bg-pink-500 text-white border-pink-500"
                        : s.statut === "termine" ? "bg-green-500 text-white border-green-500"
                        : "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}>{s.nom}</button>
              ))}
            </div>

            {selectedSprint && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 flex flex-wrap gap-4 items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-bold text-slate-900">{selectedSprint.nom}</h2>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      selectedSprint.statut === "en_cours" ? "bg-blue-50 text-blue-600"
                      : selectedSprint.statut === "termine" ? "bg-green-50 text-green-600"
                      : "bg-slate-100 text-slate-500"
                    }`}>
                      {selectedSprint.statut === "en_cours" ? "En cours" : selectedSprint.statut === "termine" ? "Terminé" : "À venir"}
                    </span>
                  </div>
                  {selectedSprint.objectif && <p className="text-sm text-slate-500 mb-1">{selectedSprint.objectif}</p>}
                  <div className="flex gap-3 text-xs text-slate-400">
                    <span>📅 {fmtDate(selectedSprint.date_debut)} → {fmtDate(selectedSprint.date_fin)}</span>
                    {daysLeft !== null && selectedSprint.statut !== "termine" && (
                      <span className={daysLeft < 3 ? "text-red-500 font-bold" : ""}>{daysLeft > 0 ? `${daysLeft}j restants` : "Expiré"}</span>
                    )}
                  </div>
                </div>
                <div className="w-full sm:w-44">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Avancement</span><span className="font-bold">{donePct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-2 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full transition-all" style={{ width: `${donePct}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{sprintFiltered.filter((t) => t.statut === "done").length}/{sprintFiltered.length} tâches</p>
                </div>
                {role === "founder" && (
                  <div className="flex gap-2">
                    {selectedSprint.statut === "a_venir" && (
                      <button onClick={() => updateSprintStatut(selectedSprint, "en_cours")}
                        className="text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">▶ Démarrer</button>
                    )}
                    {selectedSprint.statut === "en_cours" && (
                      <button onClick={() => updateSprintStatut(selectedSprint, "termine")}
                        className="text-xs font-semibold text-green-600 border border-green-200 bg-green-50 px-3 py-1.5 rounded-full hover:bg-green-100 transition-colors">✓ Terminer</button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Filtres */}
            {activeTab !== "roadmap" && (
              <div className="flex gap-2 mb-4 flex-wrap">
                <select value={filterAssigne} onChange={(e) => setFilterAssigne(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-full px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-pink-300">
                  <option value="all">👤 Tous</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                </select>
                <select value={filterPrio} onChange={(e) => setFilterPrio(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-full px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-pink-300">
                  <option value="all">🎯 Priorité</option>
                  <option value="haute">Haute</option>
                  <option value="normale">Normale</option>
                  <option value="basse">Basse</option>
                </select>
                {(filterAssigne !== "all" || filterPrio !== "all") && (
                  <button onClick={() => { setFilterAssigne("all"); setFilterPrio("all"); }}
                    className="text-xs font-semibold text-pink-500 hover:text-pink-700 px-3 py-1.5">✕ Réinitialiser</button>
                )}
                <span className="text-xs text-slate-400 self-center ml-auto">{filtered.length} tâche{filtered.length > 1 ? "s" : ""}</span>
              </div>
            )}
          </>
        )}

        {/* ══ Vue Kanban ══════════════════════════════════════════════════════ */}
        {activeTab === "kanban" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {COLONNES.map((col) => {
              const colTasks = filtered.filter((t) => t.statut === col.key);
              return (
                <div key={col.key} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-xs font-bold text-slate-700">{col.label}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-semibold">{colTasks.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 min-h-[100px]">
                    {colTasks.map((task) => (
                      <KanbanCard key={task.id} task={task} members={members} sprints={sprints}
                        showSprint={selectedSprintId === "all"}
                        onOpen={() => openPanel(task)}
                        onMove={(dir) => moveTask(task, dir)}
                        onDelete={() => deleteTask(task.id)}
                        checklistCount={0}
                      />
                    ))}
                    <button onClick={() => setShowTaskModal(true)}
                      className="text-xs text-slate-400 hover:text-pink-500 py-2 border-2 border-dashed border-slate-200 hover:border-pink-300 rounded-xl transition-all">
                      + Ajouter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ Vue Liste ════════════════════════════════════════════════════════ */}
        {activeTab === "liste" && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">Aucune tâche.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-widest text-slate-400">
                    <th className="text-left px-4 py-3">Tâche</th>
                    <th className="text-left px-4 py-3 hidden sm:table-cell">Statut</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Priorité</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Assigné</th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Échéance</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((task) => {
                    const col = COLONNES.find((c) => c.key === task.statut)!;
                    const member = members.find((m) => m.user_id === task.assigne_a);
                    const overdue = isOverdue(task.due_date) && task.statut !== "done";
                    return (
                      <tr key={task.id}
                        onClick={() => openPanel(task)}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors group">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{task.titre}</p>
                          {task.description && <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{task.description}</p>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.color}`}>{col.label}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIO[task.priorite]}`}>{task.priorite}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {member ? (
                            <div className="flex items-center gap-1.5">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black ${member.role === "founder" ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
                                {member.nom[0].toUpperCase()}
                              </div>
                              <span className="text-xs text-slate-600">{member.nom}</span>
                            </div>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {task.due_date ? (
                            <span className={`text-xs font-semibold ${overdue ? "text-red-500" : "text-slate-500"}`}>
                              {overdue ? "⚠️ " : ""}{fmtDate(task.due_date)}
                            </span>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                            className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs px-2 py-1">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ══ Vue Roadmap ══════════════════════════════════════════════════════ */}
        {activeTab === "roadmap" && (
          <div className="flex flex-col gap-4">
            {sprints.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-sm mb-3">Aucun sprint créé.</p>
                {role === "founder" && (
                  <button onClick={() => setShowSprintModal(true)} className="btn-pink px-6 py-2 text-sm">Créer le premier sprint</button>
                )}
              </div>
            ) : (() => {
              const allDates = sprints.flatMap((s) => [new Date(s.date_debut), new Date(s.date_fin)]);
              const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
              const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));
              const totalDays = Math.max((maxDate.getTime() - minDate.getTime()) / 86400000, 1);
              return (
                <>
                  {/* Légende dates */}
                  <div className="flex justify-between text-xs text-slate-400 px-1">
                    <span>{fmtDate(minDate.toISOString())}</span>
                    <span>{fmtDate(maxDate.toISOString())}</span>
                  </div>
                  {sprints.map((s) => {
                    const start = (new Date(s.date_debut).getTime() - minDate.getTime()) / 86400000;
                    const duration = (new Date(s.date_fin).getTime() - new Date(s.date_debut).getTime()) / 86400000;
                    const leftPct = (start / totalDays) * 100;
                    const widthPct = Math.max((duration / totalDays) * 100, 5);
                    const sprintTasks = tasks.filter((t) => t.sprint_id === s.id);
                    const doneTasks = sprintTasks.filter((t) => t.statut === "done").length;
                    const pct = sprintTasks.length > 0 ? Math.round(doneTasks / sprintTasks.length * 100) : 0;
                    const color = s.statut === "en_cours" ? "from-pink-400 to-purple-500"
                      : s.statut === "termine" ? "from-green-400 to-emerald-500"
                      : "from-slate-300 to-slate-400";
                    return (
                      <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-slate-900">{s.nom}</h3>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                s.statut === "en_cours" ? "bg-blue-50 text-blue-600"
                                : s.statut === "termine" ? "bg-green-50 text-green-600"
                                : "bg-slate-100 text-slate-500"
                              }`}>{s.statut === "en_cours" ? "En cours" : s.statut === "termine" ? "Terminé" : "À venir"}</span>
                            </div>
                            {s.objectif && <p className="text-xs text-slate-400 mt-0.5">{s.objectif}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400">{fmtDate(s.date_debut)} → {fmtDate(s.date_fin)}</p>
                            <p className="text-xs font-semibold text-slate-600 mt-0.5">{doneTasks}/{sprintTasks.length} tâches · {pct}%</p>
                          </div>
                        </div>

                        {/* Barre timeline */}
                        <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden mb-3">
                          <div
                            className={`absolute h-full bg-gradient-to-r ${color} rounded-full flex items-center px-3`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          >
                            <span className="text-xs font-bold text-white truncate">{s.nom}</span>
                          </div>
                          {/* Marqueur aujourd'hui */}
                          {(() => {
                            const todayPct = ((Date.now() - minDate.getTime()) / 86400000 / totalDays) * 100;
                            if (todayPct < 0 || todayPct > 100) return null;
                            return <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10" style={{ left: `${todayPct}%` }} />;
                          })()}
                        </div>

                        {/* Tâches du sprint */}
                        {sprintTasks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {sprintTasks.map((t) => {
                              const col = COLONNES.find((c) => c.key === t.statut)!;
                              return (
                                <button key={t.id} onClick={() => openPanel(t)}
                                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all hover:shadow-sm ${col.color}`}>
                                  {t.titre}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        )}

        {/* ══ Vue Fichiers ═════════════════════════════════════════════════════ */}
        {activeTab === "fichiers" && (
          <div className="flex flex-col gap-4">
            {deliverables.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                <p className="text-4xl mb-3">📁</p>
                <p className="text-slate-400 text-sm mb-4">Aucun fichier partagé.</p>
                <label className="btn-pink px-6 py-2 text-sm cursor-pointer inline-block">
                  ⬆️ Uploader un fichier <input type="file" className="hidden" onChange={onFileSelect} />
                </label>
              </div>
            ) : (
              <>
                {sprints.filter((s) => deliverables.some((d) => d.sprint_id === s.id)).map((s) => (
                  <div key={s.id}>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{s.nom}</p>
                    <div className="flex flex-col gap-2">
                      {deliverables.filter((d) => d.sprint_id === s.id).map((d) => (
                        <FileCard key={d.id} d={d} members={members} userId={userId} role={role}
                          onDelete={() => deleteFile(d)} sprints={sprints} />
                      ))}
                    </div>
                  </div>
                ))}
                {deliverables.filter((d) => !d.sprint_id).length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Général</p>
                    <div className="flex flex-col gap-2">
                      {deliverables.filter((d) => !d.sprint_id).map((d) => (
                        <FileCard key={d.id} d={d} members={members} userId={userId} role={role}
                          onDelete={() => deleteFile(d)} sprints={sprints} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ Panel détail tâche ════════════════════════════════════════════════ */}
      {panelTask && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setPanelTask(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-40 flex flex-col overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex gap-2">
                <button onClick={() => moveTask(panelTask, "prev")} disabled={panelTask.statut === "todo"}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-30 transition-colors">← Reculer</button>
                <button onClick={() => moveTask(panelTask, "next")} disabled={panelTask.statut === "done"}
                  className="text-xs px-3 py-1.5 rounded-lg bg-pink-50 text-pink-600 hover:bg-pink-100 disabled:opacity-30 transition-colors">Avancer →</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => deleteTask(panelTask.id)}
                  className="text-xs text-slate-400 hover:text-red-500 px-2 py-1.5 transition-colors">Supprimer</button>
                <button onClick={() => setPanelTask(null)}
                  className="text-slate-400 hover:text-slate-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

              {/* Statut badge */}
              {(() => {
                const col = COLONNES.find((c) => c.key === panelTask.statut)!;
                return <span className={`text-xs font-bold px-3 py-1 rounded-full self-start ${col.color}`}>{col.label}</span>;
              })()}

              {/* Titre */}
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                className="text-xl font-black text-slate-900 bg-transparent border-0 border-b-2 border-transparent hover:border-slate-200 focus:border-pink-400 focus:outline-none pb-1 w-full transition-colors"
                placeholder="Titre de la tâche" />

              {/* Description */}
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-pink-200 w-full"
                placeholder="Description..." />

              {/* Métadonnées */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Priorité</label>
                  <select value={editPrio} onChange={(e) => setEditPrio(e.target.value as Task["priorite"])} className="input-field text-xs py-2">
                    <option value="basse">Basse</option>
                    <option value="normale">Normale</option>
                    <option value="haute">Haute</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Échéance</label>
                  <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="input-field text-xs py-2" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Sprint</label>
                  <select value={editSprint} onChange={(e) => setEditSprint(e.target.value)} className="input-field text-xs py-2">
                    <option value="">— Aucun —</option>
                    {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Assigné à</label>
                  <select value={editAssigne} onChange={(e) => setEditAssigne(e.target.value)} className="input-field text-xs py-2">
                    <option value="">— Personne —</option>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={savePanelTask} disabled={savingPanel}
                className="btn-pink w-full py-2.5 text-sm">{savingPanel ? "Enregistrement..." : "Enregistrer les modifications"}</button>

              {/* Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Checklist</p>
                  {panelChecklist.length > 0 && (
                    <span className="text-xs text-slate-400">{panelChecklist.filter((c) => c.done).length}/{panelChecklist.length}</span>
                  )}
                </div>
                {panelChecklist.length > 0 && (
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-green-400 rounded-full transition-all"
                      style={{ width: `${Math.round(panelChecklist.filter((c) => c.done).length / panelChecklist.length * 100)}%` }} />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 mb-2">
                  {panelChecklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <button onClick={() => toggleCheckItem(item)}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                          item.done ? "bg-green-500 border-green-500 text-white" : "border-slate-300 hover:border-pink-400"
                        }`}>
                        {item.done && <span className="text-xs">✓</span>}
                      </button>
                      <span className={`text-sm flex-1 ${item.done ? "line-through text-slate-400" : "text-slate-700"}`}>{item.titre}</span>
                      <button onClick={() => deleteCheckItem(item.id)}
                        className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs">✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCheckItem()}
                    placeholder="Ajouter un élément..."
                    className="input-field text-sm py-2 flex-1" />
                  <button onClick={addCheckItem} disabled={!newCheckItem.trim()}
                    className="btn-ghost px-3 py-2 text-sm shrink-0">+</button>
                </div>
              </div>

              {/* Commentaires */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                  Commentaires {panelComments.length > 0 && `(${panelComments.length})`}
                </p>
                {panelLoading ? (
                  <div className="text-xs text-slate-400 text-center py-4">Chargement...</div>
                ) : (
                  <div className="flex flex-col gap-3 mb-3">
                    {panelComments.map((c) => {
                      const author = members.find((m) => m.user_id === c.user_id);
                      const isMe = c.user_id === userId;
                      return (
                        <div key={c.id} className="flex gap-2.5 group">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 ${
                            author?.role === "founder" ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"
                          }`}>{author?.nom?.[0]?.toUpperCase() ?? "?"}</div>
                          <div className="flex-1">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-bold text-slate-700">{author?.nom ?? "—"}</span>
                              <span className="text-xs text-slate-400">{fmtDate(c.created_at)}</span>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-700">{c.content}</div>
                          </div>
                          {isMe && (
                            <button onClick={() => deleteComment(c.id)}
                              className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs self-start mt-4">✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                    placeholder="Laisser un commentaire..."
                    className="input-field text-sm py-2 flex-1" />
                  <button onClick={addComment} disabled={!newComment.trim()}
                    className="btn-pink px-4 py-2 text-sm shrink-0">Envoyer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Upload ────────────────────────────────────────────────────── */}
      {showFileModal && pendingFile && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="text-lg font-black text-slate-900">Partager un fichier</h2>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <span className="text-2xl">{fileIcon(pendingFile.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{pendingFile.name}</p>
                <p className="text-xs text-slate-400">{fileSize(pendingFile.size)}</p>
              </div>
            </div>
            <textarea placeholder="Description (optionnel)" value={fileDesc} onChange={(e) => setFileDesc(e.target.value)}
              rows={2} className="input-field resize-none" />
            {sprints.length > 0 && (
              <select value={fileSprint} onChange={(e) => setFileSprint(e.target.value)} className="input-field">
                <option value="">— Aucun sprint —</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            )}
            <button onClick={uploadFile} disabled={uploading} className="btn-pink w-full py-3">
              {uploading ? "Upload en cours..." : "⬆️ Envoyer"}
            </button>
            <button onClick={() => { setShowFileModal(false); setPendingFile(null); }} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}

      {/* ── Modal Sprint ────────────────────────────────────────────────────── */}
      {showSprintModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="text-lg font-black text-slate-900">Nouveau sprint</h2>
            <input placeholder="Nom (ex: Sprint 1 – Auth)" value={sprintNom} onChange={(e) => setSprintNom(e.target.value)} className="input-field" />
            <input placeholder="Objectif (optionnel)" value={sprintObj} onChange={(e) => setSprintObj(e.target.value)} className="input-field" />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Début</label>
                <input type="date" value={sprintDebut} onChange={(e) => setSprintDebut(e.target.value)} className="input-field" /></div>
              <div><label className="text-xs font-semibold text-slate-500 mb-1 block">Fin</label>
                <input type="date" value={sprintFin} onChange={(e) => setSprintFin(e.target.value)} className="input-field" /></div>
            </div>
            <button onClick={createSprint} disabled={savingSprint || !sprintNom || !sprintDebut || !sprintFin} className="btn-pink w-full py-3">
              {savingSprint ? "Création..." : "Créer le sprint"}
            </button>
            <button onClick={() => setShowSprintModal(false)} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}

      {/* ── Modal Nouvelle tâche ────────────────────────────────────────────── */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-black text-slate-900">Nouvelle tâche</h2>
            <input placeholder="Titre" value={taskTitre} onChange={(e) => setTaskTitre(e.target.value)} className="input-field" />
            <textarea placeholder="Description (optionnel)" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={2} className="input-field resize-none" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Priorité</label>
                <div className="flex gap-1">
                  {(["basse","normale","haute"] as Task["priorite"][]).map((p) => (
                    <button key={p} onClick={() => setTaskPrio(p)}
                      className={`flex-1 text-xs font-semibold py-2 rounded-xl border transition-all capitalize ${taskPrio === p ? PRIO[p] : "bg-white text-slate-400 border-slate-200"}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Échéance</label>
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="input-field py-2" />
              </div>
            </div>
            {sprints.length > 0 && (
              <select value={taskSprint} onChange={(e) => setTaskSprint(e.target.value)} className="input-field">
                <option value="">— Sprint —</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            )}
            {members.length > 0 && (
              <select value={taskAssigne} onChange={(e) => setTaskAssigne(e.target.value)} className="input-field">
                <option value="">— Assigné à —</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom} ({m.role})</option>)}
              </select>
            )}
            <button onClick={handleCreateTask} disabled={savingTask || !taskTitre.trim()} className="btn-pink w-full py-3">
              {savingTask ? "Création..." : "Créer la tâche"}
            </button>
            <button onClick={() => setShowTaskModal(false)} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Composants
// ══════════════════════════════════════════════════════════════════════════════

function KanbanCard({ task, members, sprints, showSprint, onOpen, onMove, onDelete, checklistCount }: {
  task: Task; members: Member[]; sprints: Sprint[]; showSprint: boolean; checklistCount: number;
  onOpen: () => void; onMove: (dir: "next"|"prev") => void; onDelete: () => void;
}) {
  const member = members.find((m) => m.user_id === task.assigne_a);
  const sprint = sprints.find((s) => s.id === task.sprint_id);
  const overdue = isOverdue(task.due_date) && task.statut !== "done";

  return (
    <div onClick={onOpen}
      className="bg-white border border-slate-200 rounded-xl p-3 hover:border-pink-200 hover:shadow-sm transition-all group cursor-pointer">
      <p className="text-sm font-semibold text-slate-900 leading-snug mb-2">{task.titre}</p>

      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PRIO[task.priorite]}`}>{task.priorite}</span>
        {showSprint && sprint && (
          <span className="text-xs font-semibold bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full">{sprint.nom}</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {member && (
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black ${member.role === "founder" ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gradient-to-br from-blue-400 to-indigo-500"}`}>
              {member.nom[0].toUpperCase()}
            </div>
          )}
          {task.due_date && (
            <span className={`text-xs font-semibold ${overdue ? "text-red-500" : "text-slate-400"}`}>
              {overdue ? "⚠️" : "📅"} {fmtDate(task.due_date)}
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onMove("prev")} disabled={task.statut === "todo"}
            className="text-xs px-1.5 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-20">←</button>
          <button onClick={() => onMove("next")} disabled={task.statut === "done"}
            className="text-xs px-1.5 py-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-20">→</button>
          <button onClick={onDelete}
            className="text-xs px-1.5 py-1 rounded bg-slate-100 text-red-400 hover:bg-red-50">✕</button>
        </div>
      </div>
    </div>
  );
}

function FileCard({ d, members, userId, role, onDelete, sprints }: {
  d: Deliverable; members: Member[]; userId: string | null; role: string | null;
  onDelete: () => void; sprints: Sprint[];
}) {
  const uploader = members.find((m) => m.user_id === d.uploaded_by);
  const sprint = sprints.find((s) => s.id === d.sprint_id);
  const canDelete = d.uploaded_by === userId || role === "founder";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 hover:border-pink-200 transition-all group">
      <span className="text-3xl shrink-0">{fileIcon(d.file_type)}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm truncate">{d.nom}</p>
        {d.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{d.description}</p>}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {uploader && <span className="text-xs text-slate-400">{uploader.nom}</span>}
          {d.file_size && <span className="text-xs text-slate-400">{fileSize(d.file_size)}</span>}
          <span className="text-xs text-slate-400">{fmtDate(d.created_at)}</span>
          {sprint && <span className="text-xs font-semibold bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full">{sprint.nom}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a href={d.file_url} target="_blank" rel="noreferrer"
          className="text-xs font-semibold text-slate-500 hover:text-pink-500 border border-slate-200 hover:border-pink-300 px-3 py-1.5 rounded-full transition-all">⬇️</a>
        {canDelete && (
          <button onClick={onDelete}
            className="text-xs text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all px-2 py-1.5">✕</button>
        )}
      </div>
    </div>
  );
}
