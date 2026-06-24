"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Plus, Upload, LayoutGrid, List, Map, FolderOpen,
  ChevronLeft, ChevronRight, X, Calendar, AlertCircle,
  CheckSquare, Send, Download, Paperclip, FileText,
  Play, CheckCircle2, Clock, Trash2, Zap,
  Check, Image as ImageIcon, SlidersHorizontal,
  Sparkles, MoreHorizontal, GripVertical, ChevronDown,
  Brain, Lightbulb, BarChart3, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

type TaskComment   = { id: string; task_id: string; user_id: string; content: string; created_at: string; };
type TaskChecklist = { id: string; task_id: string; titre: string; done: boolean; ordre: number; };
type Member        = { user_id: string; nom: string; role: "founder" | "developer"; };
type Deliverable   = {
  id: string; project_id: string; sprint_id: string | null; uploaded_by: string;
  nom: string; file_url: string; file_type: string | null; file_size: number | null;
  description: string | null; created_at: string;
};

type AIMessage = { role: "user" | "assistant"; content: string; };

// ── Constantes ────────────────────────────────────────────────────────────────

const COLONNES: { key: Task["statut"]; label: string; desc: string; color: string; dot: string }[] = [
  { key: "todo",     label: "À faire",      desc: "Tâches à démarrer",  color: "#6b7280", dot: "#d1d5db" },
  { key: "en_cours", label: "En cours",     desc: "Actuellement en cours", color: "#3b82f6", dot: "#93c5fd" },
  { key: "review",   label: "À valider",    desc: "En attente de validation", color: "#f59e0b", dot: "#fcd34d" },
  { key: "done",     label: "Terminé",      desc: "Tâches accomplies",  color: "#10b981", dot: "#6ee7b7" },
];

const PRIO: Record<Task["priorite"], { dot: string; label: string }> = {
  haute:   { dot: "#f43f5e", label: "Haute"   },
  normale: { dot: "#94a3b8", label: "Normale" },
  basse:   { dot: "#10b981", label: "Basse"   },
};

const TABS = ["kanban", "liste", "roadmap", "fichiers"] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  kanban:   "Tableau",
  liste:    "Liste",
  roadmap:  "Planning",
  fichiers: "Fichiers",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function isOverdue(due: string | null | undefined) {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function fileSize(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

function fileIcon(t: string | null) {
  if (!t) return Paperclip;
  if (t.startsWith("image/")) return ImageIcon;
  if (t === "application/pdf") return FileText;
  return Paperclip;
}

function Avatar({ member, size = 20 }: { member: Member; size?: number }) {
  const bg = member.role === "founder"
    ? "linear-gradient(135deg,#f43f5e,#8b5cf6)"
    : "linear-gradient(135deg,#3b82f6,#6366f1)";
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, background: bg,
        border: "1.5px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
    >
      {member.nom[0].toUpperCase()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Page principale
// ══════════════════════════════════════════════════════════════════════════════

export default function GestionPage() {
  const router   = useRouter();
  const { id: projectId } = useParams<{ id: string }>();

  const [role, setRole]     = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectTitre, setProjectTitre] = useState("");
  const [members, setMembers]   = useState<Member[]>([]);
  const [sprints, setSprints]   = useState<Sprint[]>([]);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | "all">("all");
  const [activeTab, setActiveTab] = useState<Tab>("kanban");
  const [loading, setLoading]   = useState(true);
  const [sprintCollapsed, setSprintCollapsed] = useState(false);

  const [filterAssigne, setFilterAssigne] = useState<string>("all");
  const [filterPrio, setFilterPrio]       = useState<string>("all");

  // Panel
  const [panelTask, setPanelTask]         = useState<Task | null>(null);
  const [panelComments, setPanelComments] = useState<TaskComment[]>([]);
  const [panelChecklist, setPanelChecklist] = useState<TaskChecklist[]>([]);
  const [newComment, setNewComment]       = useState("");
  const [newCheckItem, setNewCheckItem]   = useState("");
  const [panelLoading, setPanelLoading]   = useState(false);
  const [savingPanel, setSavingPanel]     = useState(false);
  const [editTitle, setEditTitle]         = useState("");
  const [editDesc, setEditDesc]           = useState("");
  const [editDue, setEditDue]             = useState("");
  const [editPrio, setEditPrio]           = useState<Task["priorite"]>("normale");
  const [editSprint, setEditSprint]       = useState("");
  const [editAssigne, setEditAssigne]     = useState("");

  // Inline quick-add
  const [quickAddCol, setQuickAddCol] = useState<Task["statut"] | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  // Modal sprint
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [sprintNom, setSprintNom]     = useState("");
  const [sprintObj, setSprintObj]     = useState("");
  const [sprintDebut, setSprintDebut] = useState("");
  const [sprintFin, setSprintFin]     = useState("");
  const [savingSprint, setSavingSprint] = useState(false);

  // Modal tâche (pleine)
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitre, setTaskTitre]   = useState("");
  const [taskDesc, setTaskDesc]     = useState("");
  const [taskPrio, setTaskPrio]     = useState<Task["priorite"]>("normale");
  const [taskSprint, setTaskSprint] = useState("");
  const [taskAssigne, setTaskAssigne] = useState("");
  const [taskDue, setTaskDue]       = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Fichiers
  const [showFileModal, setShowFileModal] = useState(false);
  const [pendingFile, setPendingFile]     = useState<File | null>(null);
  const [fileDesc, setFileDesc]           = useState("");
  const [fileSprint, setFileSprint]       = useState("");
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState<string | null>(null);

  // ── AI Agent Panel ──────────────────────────────────────────────────────────
  // Amine connecte ici son agent IA
  const [showAI, setShowAI]             = useState(false);
  const [aiMessages, setAiMessages]     = useState<AIMessage[]>([]);
  const [aiInput, setAiInput]           = useState("");
  const [aiLoading, setAiLoading]       = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  async function aiSend(message?: string) {
    const text = message ?? aiInput.trim();
    if (!text || aiLoading) return;
    setAiMessages((prev) => [...prev, { role: "user", content: text }]);
    setAiInput("");
    setAiLoading(true);

    // ── TODO Amine: connecter l'agent IA ici ──────────────────────────────
    // Contexte disponible: tasks, sprints, members, selectedSprintId, projectTitre
    // Remplacer le setTimeout par l'appel à l'API de l'agent
    await new Promise((r) => setTimeout(r, 800));
    setAiMessages((prev) => [...prev, {
      role: "assistant",
      content: "Agent IA en cours d'intégration par Amine. Les données du projet sont disponibles : " +
        `${tasks.length} tâches, ${sprints.length} sprints, ${members.length} membres.`,
    }]);
    // ─────────────────────────────────────────────────────────────────────

    setAiLoading(false);
  }

  useEffect(() => {
    if (aiScrollRef.current) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [aiMessages]);

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

  // ── Panel ────────────────────────────────────────────────────────────────────

  async function openPanel(task: Task) {
    setPanelTask(task);
    setEditTitle(task.titre); setEditDesc(task.description ?? "");
    setEditDue(task.due_date ?? ""); setEditPrio(task.priorite);
    setEditSprint(task.sprint_id ?? ""); setEditAssigne(task.assigne_a ?? "");
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
    const update = { titre: editTitle, description: editDesc || null,
      due_date: editDue || null, priorite: editPrio,
      sprint_id: editSprint || null, assigne_a: editAssigne || null };
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
      task_id: panelTask.id, titre: newCheckItem.trim(), done: false, ordre: panelChecklist.length,
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

  async function quickAddTask(statut: Task["statut"]) {
    if (!quickAddTitle.trim()) { setQuickAddCol(null); return; }
    const payload = {
      project_id: projectId,
      sprint_id: selectedSprintId !== "all" ? selectedSprintId : null,
      titre: quickAddTitle.trim(), statut, priorite: "normale" as Task["priorite"],
      assigne_a: null, description: null, due_date: null,
    };
    const { data } = await supabase.from("tasks").insert(payload).select().maybeSingle();
    if (data) setTasks((prev) => [...prev, data as Task]);
    setQuickAddTitle(""); setQuickAddCol(null);
  }

  async function handleCreateTask() {
    if (!taskTitre.trim()) return;
    setSavingTask(true);
    const { data } = await supabase.from("tasks").insert({
      project_id: projectId, sprint_id: taskSprint || null,
      titre: taskTitre.trim(), description: taskDesc || null,
      statut: "todo", priorite: taskPrio,
      assigne_a: taskAssigne || null, due_date: taskDue || null,
    }).select().maybeSingle();
    if (data) setTasks((prev) => [...prev, data as Task]);
    setTaskTitre(""); setTaskDesc(""); setTaskPrio("normale");
    setTaskSprint(""); setTaskAssigne(""); setTaskDue("");
    setShowTaskModal(false); setSavingTask(false);
  }

  async function moveTask(task: Task, dir: "next" | "prev") {
    const order: Task["statut"][] = ["todo","en_cours","review","done"];
    const newStatut = order[order.indexOf(task.statut) + (dir === "next" ? 1 : -1)];
    if (!newStatut) return;
    await supabase.from("tasks").update({ statut: newStatut }).eq("id", task.id);
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, statut: newStatut } : t));
    if (panelTask?.id === task.id) setPanelTask((p) => p ? { ...p, statut: newStatut } : null);
  }

  async function deleteTask(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (panelTask?.id === id) setPanelTask(null);
  }

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

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPendingFile(file); setFileDesc("");
    setFileSprint(selectedSprintId === "all" ? (sprints[0]?.id ?? "") : selectedSprintId);
    setShowFileModal(true); e.target.value = "";
  }

  async function uploadFile() {
    if (!pendingFile || !userId) return;
    setUploading(true);
    setUploadError(null);
    const ext = pendingFile.name.split(".").pop();
    const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
    const { error: storageError } = await supabase.storage.from("project-files").upload(path, pendingFile);
    if (storageError) {
      console.error("Storage upload error:", storageError);
      setUploadError(storageError.message || "Erreur lors de l'upload. Vérifie les permissions du bucket.");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
    const { data, error: dbError } = await supabase.from("deliverables").insert({
      project_id: projectId, sprint_id: fileSprint || null, uploaded_by: userId,
      nom: pendingFile.name, file_url: urlData.publicUrl,
      file_type: pendingFile.type, file_size: pendingFile.size, description: fileDesc || null,
    }).select().maybeSingle();
    if (dbError) {
      console.error("DB insert error:", dbError);
      setUploadError(dbError.message || "Erreur lors de l'enregistrement.");
      setUploading(false);
      return;
    }
    if (data) setDeliverables((prev) => [data as Deliverable, ...prev]);
    setPendingFile(null); setShowFileModal(false); setUploading(false); setUploadError(null);
  }

  async function deleteFile(d: Deliverable) {
    if (d.uploaded_by !== userId && role !== "founder") return;
    await supabase.from("deliverables").delete().eq("id", d.id);
    setDeliverables((prev) => prev.filter((f) => f.id !== d.id));
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const sprintFiltered = selectedSprintId === "all"
    ? tasks : tasks.filter((t) => t.sprint_id === selectedSprintId);

  const filtered = sprintFiltered
    .filter((t) => filterAssigne === "all" || t.assigne_a === filterAssigne)
    .filter((t) => filterPrio === "all" || t.priorite === filterPrio);

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);
  const donePct = sprintFiltered.length > 0
    ? Math.round(sprintFiltered.filter((t) => t.statut === "done").length / sprintFiltered.length * 100) : 0;
  const daysLeft = selectedSprint
    ? Math.ceil((new Date(selectedSprint.date_fin).getTime() - Date.now()) / 86400000) : null;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen pb-24" style={{ background: "#f9f9fb" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20"
        style={{
          background: "rgba(249,249,251,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 h-11">
            <button onClick={() => router.push("/messages")} className="btn-icon" style={{ width: 30, height: 30 }}>
              <ArrowLeft size={14} strokeWidth={2} />
            </button>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>Projets</span>
              <ChevronRight size={11} style={{ color: "var(--subtle)" }} />
              <span className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{projectTitre}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowAI(!showAI)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-200"
                style={{
                  background: showAI ? "linear-gradient(135deg,#8b5cf6,#6366f1)" : "rgba(139,92,246,0.08)",
                  color: showAI ? "#fff" : "var(--violet)",
                  border: "1px solid rgba(139,92,246,0.2)",
                  boxShadow: showAI ? "0 2px 8px rgba(139,92,246,0.3)" : "none",
                }}
              >
                <Sparkles size={11} strokeWidth={2} /> Assistant IA
              </button>
              {activeTab !== "fichiers" && activeTab !== "roadmap" && (
                <button onClick={() => setShowTaskModal(true)} className="btn-primary text-xs" style={{ padding: "6px 12px", gap: 4 }}>
                  <Plus size={12} strokeWidth={2.5} /> Nouvelle tâche
                </button>
              )}
              {activeTab === "fichiers" && (
                <label className="btn-primary text-xs cursor-pointer" style={{ padding: "6px 12px", gap: 4, display: "flex", alignItems: "center" }}>
                  <Upload size={12} strokeWidth={2.5} /> Ajouter un fichier
                  <input type="file" className="hidden" onChange={onFileSelect} />
                </label>
              )}
              {role === "founder" && activeTab !== "fichiers" && (
                <button
                  onClick={() => setShowSprintModal(true)}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
                  style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted)", border: "1px solid rgba(0,0,0,0.08)" }}
                >
                  <Plus size={11} strokeWidth={2.5} /> Phase
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {TABS.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="shrink-0 text-xs font-semibold px-4 py-2.5 transition-all relative"
                  style={{
                    color: active ? "var(--text)" : "var(--muted)",
                    borderBottom: active ? "2px solid var(--text)" : "2px solid transparent",
                  }}
                >
                  {TAB_LABELS[tab]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-4">

        {/* ── Sprint bar ──────────────────────────────────────────────────── */}
        {activeTab !== "fichiers" && (
          <>
            {/* Sprint pills + actions */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <button
                onClick={() => setSelectedSprintId("all")}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md transition-all"
                style={{
                  background: selectedSprintId === "all" ? "var(--text)" : "transparent",
                  color: selectedSprintId === "all" ? "#fff" : "var(--muted)",
                }}
              >
                Tout
              </button>
              {sprints.map((s) => {
                const active = selectedSprintId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSprintId(s.id)}
                    className="shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all"
                    style={{
                      background: active ? "#fff" : "transparent",
                      color: active ? "var(--text)" : "var(--muted)",
                      border: active ? "1px solid rgba(0,0,0,0.1)" : "1px solid transparent",
                      boxShadow: active ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    {s.statut === "en_cours" && <Zap size={10} style={{ color: "var(--rose)" }} />}
                    {s.statut === "termine"  && <Check size={10} style={{ color: "var(--green)" }} />}
                    {s.statut === "a_venir"  && <Clock size={10} style={{ color: "var(--muted)" }} />}
                    {s.nom}
                  </button>
                );
              })}
              <div className="h-4 w-px shrink-0" style={{ background: "rgba(0,0,0,0.1)" }} />
              {/* Filtres inline */}
              <select
                value={filterAssigne}
                onChange={(e) => setFilterAssigne(e.target.value)}
                className="shrink-0 text-xs font-semibold px-2 py-1.5 rounded-md bg-transparent"
                style={{ color: filterAssigne !== "all" ? "var(--rose)" : "var(--muted)", border: "none", cursor: "pointer" }}
              >
                <option value="all">Tous les membres</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
              </select>
              <select
                value={filterPrio}
                onChange={(e) => setFilterPrio(e.target.value)}
                className="shrink-0 text-xs font-semibold px-2 py-1.5 rounded-md bg-transparent"
                style={{ color: filterPrio !== "all" ? "var(--rose)" : "var(--muted)", border: "none", cursor: "pointer" }}
              >
                <option value="all">Toutes les priorités</option>
                <option value="haute">🔴 Haute priorité</option>
                <option value="normale">⚪ Priorité normale</option>
                <option value="basse">🟢 Basse priorité</option>
              </select>
              <span className="ml-auto text-xs shrink-0" style={{ color: "var(--subtle)" }}>{filtered.length} tâche{filtered.length > 1 ? "s" : ""}</span>
            </div>

            {/* Sprint info (collapsible) */}
            {selectedSprint && (
              <div
                className="rounded-xl mb-4 overflow-hidden transition-all duration-300"
                style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}
              >
                <button
                  onClick={() => setSprintCollapsed(!sprintCollapsed)}
                  className="w-full flex items-center gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                      background: selectedSprint.statut === "en_cours" ? "var(--rose)"
                        : selectedSprint.statut === "termine" ? "var(--green)" : "var(--muted)"
                    }} />
                    <span className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>{selectedSprint.nom}</span>
                    {selectedSprint.objectif && (
                      <span className="text-xs truncate hidden sm:block" style={{ color: "var(--muted)" }}>
                        — {selectedSprint.objectif}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${donePct}%`,
                            background: donePct === 100 ? "var(--green)" : "var(--rose)",
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{donePct}%</span>
                    </div>
                    {daysLeft !== null && selectedSprint.statut !== "termine" && (
                      <span className="text-xs font-semibold hidden sm:block"
                        style={{ color: daysLeft < 3 ? "var(--rose)" : "var(--subtle)" }}>
                        J-{Math.max(0, daysLeft)}
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      style={{ color: "var(--subtle)", transform: sprintCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                    />
                  </div>
                </button>

                {!sprintCollapsed && (
                  <div className="px-4 pb-3 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                    <div className="flex items-center gap-1 pt-2">
                      <span className="text-xs" style={{ color: "var(--subtle)" }}>
                        {fmtDate(selectedSprint.date_debut)} → {fmtDate(selectedSprint.date_fin)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-2">
                      {COLONNES.map((col) => {
                        const count = sprintFiltered.filter((t) => t.statut === col.key).length;
                        return (
                          <span key={col.key} className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.dot }} />
                            {count}
                          </span>
                        );
                      })}
                    </div>
                    {role === "founder" && (
                      <div className="flex gap-1.5 ml-auto pt-2">
                        {selectedSprint.statut === "a_venir" && (
                          <button
                            onClick={() => updateSprintStatut(selectedSprint, "en_cours")}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                            style={{ background: "rgba(59,130,246,0.07)", color: "var(--blue)", border: "1px solid rgba(59,130,246,0.15)" }}
                          >
                            <Play size={10} strokeWidth={2.5} /> Démarrer
                          </button>
                        )}
                        {selectedSprint.statut === "en_cours" && (
                          <button
                            onClick={() => updateSprintStatut(selectedSprint, "termine")}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                            style={{ background: "rgba(16,185,129,0.07)", color: "var(--green)", border: "1px solid rgba(16,185,129,0.15)" }}
                          >
                            <CheckCircle2 size={10} strokeWidth={2.5} /> Terminer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ══ Kanban ══════════════════════════════════════════════════════════ */}
        {activeTab === "kanban" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {COLONNES.map((col) => {
              const colTasks = filtered.filter((t) => t.statut === col.key);
              return (
                <div key={col.key}>
                  {/* En-tête colonne */}
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <div className="w-2 h-2 rounded-sm" style={{ background: col.dot }} />
                    <span className="text-xs font-semibold flex-1" style={{ color: col.color }}>{col.label}</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--subtle)" }}>{colTasks.length}</span>
                    <button
                      onClick={() => { setQuickAddCol(col.key); setQuickAddTitle(""); }}
                      className="w-5 h-5 rounded flex items-center justify-center transition-all"
                      style={{ color: "var(--subtle)" }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "var(--text)"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "var(--subtle)"}
                    >
                      <Plus size={13} strokeWidth={2} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {/* Quick-add input */}
                    {quickAddCol === col.key && (
                      <div
                        className="rounded-lg p-2"
                        style={{ background: "#fff", border: "1.5px solid rgba(139,92,246,0.3)", boxShadow: "0 0 0 3px rgba(139,92,246,0.06)" }}
                      >
                        <input
                          autoFocus
                          value={quickAddTitle}
                          onChange={(e) => setQuickAddTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") quickAddTask(col.key);
                            if (e.key === "Escape") setQuickAddCol(null);
                          }}
                          placeholder="Titre de la tâche..."
                          className="w-full text-xs bg-transparent focus:outline-none"
                          style={{ color: "var(--text)" }}
                        />
                        <div className="flex gap-1.5 mt-1.5">
                          <button onClick={() => quickAddTask(col.key)} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-1"
                            style={{ background: "var(--text)", color: "#fff" }}>
                            Créer
                          </button>
                          <button onClick={() => setQuickAddCol(null)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted)" }}>
                            <X size={12} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    )}

                    {colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        members={members}
                        sprints={sprints}
                        showSprint={selectedSprintId === "all"}
                        onOpen={() => openPanel(task)}
                        onMove={(dir) => moveTask(task, dir)}
                        onDelete={() => deleteTask(task.id)}
                      />
                    ))}

                    {colTasks.length === 0 && quickAddCol !== col.key && (
                      <button
                        onClick={() => { setQuickAddCol(col.key); setQuickAddTitle(""); }}
                        className="w-full text-xs py-3 rounded-lg transition-all duration-200 text-left px-3"
                        style={{ color: "var(--subtle)", border: "1.5px dashed rgba(0,0,0,0.08)" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.15)";
                          (e.currentTarget as HTMLElement).style.color = "var(--muted)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.08)";
                          (e.currentTarget as HTMLElement).style.color = "var(--subtle)";
                        }}
                      >
                        + Ajouter une tâche
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ Liste ════════════════════════════════════════════════════════════ */}
        {activeTab === "liste" && (
          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: "var(--rose-soft)" }}>
                  <CheckSquare size={20} style={{ color: "var(--rose)" }} />
                </div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text)" }}>Aucune tâche</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Commence par créer une tâche.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {["Tâche","Statut","Priorité","Assigné","Échéance",""].map((h, i) => (
                      <th key={i}
                        className={cn("text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider",
                          i > 1 ? "hidden md:table-cell" : i === 1 ? "hidden sm:table-cell" : "")}
                        style={{ color: "var(--subtle)" }}
                      >{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((task) => {
                    const col = COLONNES.find((c) => c.key === task.statut)!;
                    const member = members.find((m) => m.user_id === task.assigne_a);
                    const overdue = isOverdue(task.due_date) && task.statut !== "done";
                    return (
                      <tr key={task.id} onClick={() => openPanel(task)} className="group cursor-pointer"
                        style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.015)"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIO[task.priorite].dot }} />
                            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{task.titre}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 hidden sm:table-cell">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{ background: `${col.dot}20`, color: col.color }}>
                            {col.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span className="text-xs" style={{ color: "var(--muted)" }}>{PRIO[task.priorite].label}</span>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          {member ? <Avatar member={member} size={20} /> : <span style={{ color: "var(--subtle)" }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5 hidden lg:table-cell">
                          {task.due_date ? (
                            <span className="text-xs font-medium" style={{ color: overdue ? "var(--rose)" : "var(--subtle)" }}>
                              {overdue && "⚠ "}{fmtDate(task.due_date)}
                            </span>
                          ) : <span style={{ color: "var(--subtle)" }}>—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                            className="opacity-0 group-hover:opacity-100 btn-icon transition-opacity"
                            style={{ width: 24, height: 24, color: "var(--rose)" }}>
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ══ Roadmap ══════════════════════════════════════════════════════════ */}
        {activeTab === "roadmap" && (
          <div className="flex flex-col gap-3">
            {sprints.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-xl"
                style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>Aucun sprint</p>
                {role === "founder" && (
                  <button onClick={() => setShowSprintModal(true)} className="btn-primary text-sm mt-3" style={{ padding: "8px 16px" }}>
                    Créer le premier sprint
                  </button>
                )}
              </div>
            ) : (() => {
              const allDates = sprints.flatMap((s) => [new Date(s.date_debut), new Date(s.date_fin)]);
              const minDate  = new Date(Math.min(...allDates.map((d) => d.getTime())));
              const maxDate  = new Date(Math.max(...allDates.map((d) => d.getTime())));
              const totalDays = Math.max((maxDate.getTime() - minDate.getTime()) / 86400000, 1);
              return (
                <>
                  <div className="flex justify-between px-1 mb-1">
                    <span className="text-xs" style={{ color: "var(--subtle)" }}>{fmtDate(minDate.toISOString())}</span>
                    <span className="text-xs" style={{ color: "var(--subtle)" }}>{fmtDate(maxDate.toISOString())}</span>
                  </div>
                  {sprints.map((s) => {
                    const start    = (new Date(s.date_debut).getTime() - minDate.getTime()) / 86400000;
                    const duration = (new Date(s.date_fin).getTime() - new Date(s.date_debut).getTime()) / 86400000;
                    const leftPct  = (start / totalDays) * 100;
                    const widthPct = Math.max((duration / totalDays) * 100, 5);
                    const sprintTasks = tasks.filter((t) => t.sprint_id === s.id);
                    const pct = sprintTasks.length > 0
                      ? Math.round(sprintTasks.filter((t) => t.statut === "done").length / sprintTasks.length * 100) : 0;
                    return (
                      <div key={s.id} className="rounded-xl p-4"
                        style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{
                              background: s.statut === "en_cours" ? "var(--rose)"
                                : s.statut === "termine" ? "var(--green)" : "var(--muted)"
                            }} />
                            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{s.nom}</span>
                            {s.objectif && <span className="text-xs" style={{ color: "var(--muted)" }}>— {s.objectif}</span>}
                          </div>
                          <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>
                            {pct}% · {fmtDate(s.date_debut)} → {fmtDate(s.date_fin)}
                          </span>
                        </div>
                        <div className="relative h-6 rounded-full overflow-hidden mb-3"
                          style={{ background: "rgba(0,0,0,0.05)" }}>
                          <div className="absolute h-full rounded-full flex items-center px-2"
                            style={{
                              left: `${leftPct}%`, width: `${widthPct}%`,
                              background: s.statut === "en_cours"
                                ? "linear-gradient(90deg,#f43f5e,#8b5cf6)"
                                : s.statut === "termine"
                                ? "linear-gradient(90deg,#10b981,#34d399)"
                                : "linear-gradient(90deg,#cbd5e1,#e2e8f0)",
                            }}>
                            <span className="text-white font-bold truncate" style={{ fontSize: 10 }}>{s.nom}</span>
                          </div>
                          {(() => {
                            const todayPct = ((Date.now() - minDate.getTime()) / 86400000 / totalDays) * 100;
                            if (todayPct < 0 || todayPct > 100) return null;
                            return <div className="absolute top-0 bottom-0 w-0.5 z-10"
                              style={{ left: `${todayPct}%`, background: "rgba(244,63,94,0.6)" }} />;
                          })()}
                        </div>
                        {sprintTasks.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sprintTasks.map((t) => {
                              const col = COLONNES.find((c) => c.key === t.statut)!;
                              return (
                                <button key={t.id} onClick={() => openPanel(t)}
                                  className="text-xs px-2 py-0.5 rounded font-medium"
                                  style={{ background: `${col.dot}25`, color: col.color }}>
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

        {/* ══ Fichiers ═════════════════════════════════════════════════════════ */}
        {activeTab === "fichiers" && (
          <div className="flex flex-col gap-4">
            {deliverables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-xl"
                style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: "var(--rose-soft)" }}>
                  <FolderOpen size={20} style={{ color: "var(--rose)" }} />
                </div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text)" }}>Aucun fichier</p>
                <label className="btn-primary text-sm mt-3 cursor-pointer" style={{ padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Upload size={13} /> Uploader
                  <input type="file" className="hidden" onChange={onFileSelect} />
                </label>
              </div>
            ) : (
              <>
                {sprints.filter((s) => deliverables.some((d) => d.sprint_id === s.id)).map((s) => (
                  <div key={s.id}>
                    <p className="label mb-2">{s.nom}</p>
                    <div className="flex flex-col gap-1.5">
                      {deliverables.filter((d) => d.sprint_id === s.id).map((d) => (
                        <FileRow key={d.id} d={d} members={members} userId={userId} role={role}
                          onDelete={() => deleteFile(d)} />
                      ))}
                    </div>
                  </div>
                ))}
                {deliverables.filter((d) => !d.sprint_id).length > 0 && (
                  <div>
                    <p className="label mb-2">Général</p>
                    <div className="flex flex-col gap-1.5">
                      {deliverables.filter((d) => !d.sprint_id).map((d) => (
                        <FileRow key={d.id} d={d} members={members} userId={userId} role={role}
                          onDelete={() => deleteFile(d)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ Panel tâche ══════════════════════════════════════════════════════ */}
      {panelTask && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setPanelTask(null)} />
          <div
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm z-40 flex flex-col"
            style={{
              background: "#fff",
              borderLeft: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "-4px 0 32px rgba(0,0,0,0.08)",
            }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <div className="flex gap-1.5">
                <button onClick={() => moveTask(panelTask, "prev")} disabled={panelTask.statut === "todo"}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted)" }}>
                  <ChevronLeft size={12} strokeWidth={2} /> Reculer
                </button>
                <button onClick={() => moveTask(panelTask, "next")} disabled={panelTask.statut === "done"}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted)" }}>
                  Avancer <ChevronRight size={12} strokeWidth={2} />
                </button>
              </div>
              <div className="flex gap-1">
                <button onClick={() => deleteTask(panelTask.id)} className="btn-icon" style={{ width: 28, height: 28, color: "var(--rose)" }}>
                  <Trash2 size={12} strokeWidth={2} />
                </button>
                <button onClick={() => setPanelTask(null)} className="btn-icon" style={{ width: 28, height: 28 }}>
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {/* Statut */}
              {(() => {
                const col = COLONNES.find((c) => c.key === panelTask.statut)!;
                return (
                  <span className="text-xs font-semibold px-2 py-1 rounded self-start"
                    style={{ background: `${col.dot}25`, color: col.color }}>
                    {col.label}
                  </span>
                );
              })()}

              {/* Titre */}
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-lg font-bold bg-transparent w-full focus:outline-none"
                style={{ color: "var(--text)", letterSpacing: "-0.02em", borderBottom: "2px solid rgba(0,0,0,0.07)", paddingBottom: 6 }}
                placeholder="Titre"
              />

              {/* Description */}
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="text-sm resize-none focus:outline-none rounded-lg p-2.5"
                style={{ background: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.07)", color: "var(--text-2)" }}
                placeholder="Description..."
              />

              {/* Métadonnées 2 cols */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Priorité", el: (
                    <select value={editPrio} onChange={(e) => setEditPrio(e.target.value as Task["priorite"])} className="input-field text-xs py-1.5">
                      <option value="basse">Basse</option>
                      <option value="normale">Normale</option>
                      <option value="haute">Haute</option>
                    </select>
                  )},
                  { label: "Échéance", el: (
                    <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="input-field text-xs py-1.5" />
                  )},
                  { label: "Sprint", el: (
                    <select value={editSprint} onChange={(e) => setEditSprint(e.target.value)} className="input-field text-xs py-1.5">
                      <option value="">Aucun</option>
                      {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                    </select>
                  )},
                  { label: "Assigné", el: (
                    <select value={editAssigne} onChange={(e) => setEditAssigne(e.target.value)} className="input-field text-xs py-1.5">
                      <option value="">Personne</option>
                      {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                    </select>
                  )},
                ].map(({ label, el }) => (
                  <div key={label}>
                    <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--subtle)" }}>{label}</label>
                    {el}
                  </div>
                ))}
              </div>

              <button onClick={savePanelTask} disabled={savingPanel} className="btn-primary w-full py-2 text-sm">
                {savingPanel ? "Enregistrement..." : "Enregistrer"}
              </button>

              {/* Checklist */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckSquare size={12} style={{ color: "var(--subtle)" }} />
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--subtle)" }}>
                    Checklist {panelChecklist.length > 0 && `(${panelChecklist.filter((c) => c.done).length}/${panelChecklist.length})`}
                  </p>
                </div>
                {panelChecklist.length > 0 && (
                  <div className="h-1 rounded-full overflow-hidden mb-2.5" style={{ background: "rgba(0,0,0,0.06)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.round(panelChecklist.filter((c) => c.done).length / panelChecklist.length * 100)}%`,
                      background: "var(--green)",
                    }} />
                  </div>
                )}
                <div className="flex flex-col gap-1 mb-2">
                  {panelChecklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <button onClick={() => toggleCheckItem(item)}
                        className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                        style={{ background: item.done ? "var(--green)" : "transparent", border: `1.5px solid ${item.done ? "var(--green)" : "rgba(0,0,0,0.2)"}` }}>
                        {item.done && <Check size={8} strokeWidth={3} color="white" />}
                      </button>
                      <span className="text-sm flex-1" style={{
                        color: item.done ? "var(--subtle)" : "var(--text)",
                        textDecoration: item.done ? "line-through" : "none" }}>
                        {item.titre}
                      </span>
                      <button onClick={() => deleteCheckItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 btn-icon transition-opacity"
                        style={{ width: 18, height: 18, color: "var(--rose)" }}>
                        <X size={9} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCheckItem()}
                    placeholder="Ajouter..." className="input-field text-xs py-1.5 flex-1" />
                  <button onClick={addCheckItem} disabled={!newCheckItem.trim()} className="btn-ghost px-2.5 py-1.5 text-xs">+</button>
                </div>
              </div>

              {/* Commentaires */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare size={12} style={{ color: "var(--subtle)" }} />
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--subtle)" }}>
                    Commentaires {panelComments.length > 0 && `(${panelComments.length})`}
                  </p>
                </div>
                {panelLoading ? (
                  <div className="flex justify-center py-3"><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /></div>
                ) : (
                  <div className="flex flex-col gap-2.5 mb-2">
                    {panelComments.map((c) => {
                      const author = members.find((m) => m.user_id === c.user_id);
                      return (
                        <div key={c.id} className="flex gap-2 group">
                          {author && <Avatar member={author} size={24} />}
                          <div className="flex-1">
                            <div className="flex items-baseline gap-1.5 mb-0.5">
                              <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{author?.nom ?? "—"}</span>
                              <span className="text-xs" style={{ color: "var(--subtle)" }}>{fmtDate(c.created_at)}</span>
                            </div>
                            <div className="text-xs px-2.5 py-2 rounded-lg"
                              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)", color: "var(--text-2)" }}>
                              {c.content}
                            </div>
                          </div>
                          {c.user_id === userId && (
                            <button onClick={() => deleteComment(c.id)}
                              className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity self-start mt-4"
                              style={{ width: 18, height: 18, color: "var(--rose)" }}>
                              <X size={9} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                    placeholder="Commenter..." className="input-field text-xs py-1.5 flex-1" />
                  <button onClick={addComment} disabled={!newComment.trim()} className="btn-primary px-3 py-1.5">
                    <Send size={12} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ AI Agent Panel ═══════════════════════════════════════════════════ */}
      {showAI && (
        <>
          <div className="fixed inset-0 z-30 bg-black/10" onClick={() => setShowAI(false)} />
          <div
            className="fixed bottom-20 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "#fff",
              border: "1px solid rgba(139,92,246,0.2)",
              boxShadow: "0 8px 32px rgba(139,92,246,0.15), 0 2px 8px rgba(0,0,0,0.08)",
              maxHeight: "60vh",
            }}
          >
            {/* AI Header */}
            <div className="flex items-center gap-2.5 px-4 py-3"
              style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.07),rgba(99,102,241,0.05))", borderBottom: "1px solid rgba(139,92,246,0.12)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#6366f1)" }}>
                <Brain size={14} color="white" strokeWidth={2} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold" style={{ color: "var(--text)" }}>Agent IA Linkea</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Analyse ton projet en temps réel</p>
              </div>
              <button onClick={() => setShowAI(false)} className="btn-icon" style={{ width: 24, height: 24 }}>
                <X size={12} strokeWidth={2} />
              </button>
            </div>

            {/* Quick actions */}
            {aiMessages.length === 0 && (
              <div className="p-3 flex flex-col gap-1.5">
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--subtle)" }}>Actions rapides</p>
                {[
                  { icon: BarChart3, label: "Où en est-on ?", sub: "Résumé de l'avancement", prompt: "Analyse l'avancement du sprint actuel et donne-moi un résumé clair." },
                  { icon: Lightbulb, label: "Que faire ensuite ?", sub: "Suggestions de tâches", prompt: "Quelles tâches devrais-je créer maintenant pour avancer sur ce projet ?" },
                  { icon: Brain,     label: "Bilan du projet", sub: "Vue d'ensemble complète", prompt: "Fais-moi un bilan complet de l'état actuel du projet, les points positifs et les risques." },
                ].map(({ icon: Icon, label, sub, prompt }) => (
                  <button
                    key={label}
                    onClick={() => aiSend(prompt)}
                    className="flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl transition-all"
                    style={{ border: "1px solid rgba(0,0,0,0.07)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.05)";
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.2)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.07)";
                    }}
                  >
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(139,92,246,0.08)" }}>
                      <Icon size={12} style={{ color: "var(--violet)" }} strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{label}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            {aiMessages.length > 0 && (
              <div ref={aiScrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5" style={{ maxHeight: "35vh" }}>
                {aiMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className="text-xs px-3 py-2 rounded-xl max-w-[85%] leading-relaxed"
                      style={{
                        background: msg.role === "user"
                          ? "linear-gradient(135deg,#8b5cf6,#6366f1)"
                          : "rgba(0,0,0,0.04)",
                        color: msg.role === "user" ? "#fff" : "var(--text-2)",
                        border: msg.role === "assistant" ? "1px solid rgba(0,0,0,0.07)" : "none",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.07)" }}>
                      {[0,1,2].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full"
                          style={{ background: "var(--violet)", opacity: 0.5, animation: `pulse ${0.8 + i * 0.2}s ease-in-out infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            <div className="p-3 pt-2" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <div className="flex gap-1.5">
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aiSend()}
                  placeholder="Demande quelque chose..."
                  className="input-field text-xs py-2 flex-1"
                  style={{ borderColor: "rgba(139,92,246,0.2)" }}
                />
                <button
                  onClick={() => aiSend()}
                  disabled={!aiInput.trim() || aiLoading}
                  className="px-3 py-2 rounded-xl text-white flex items-center justify-center disabled:opacity-40 transition-all"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#6366f1)", minWidth: 36 }}
                >
                  <Send size={12} strokeWidth={2} />
                </button>
              </div>
              {aiMessages.length > 0 && (
                <button onClick={() => setAiMessages([])} className="text-xs mt-1.5 w-full text-center" style={{ color: "var(--subtle)" }}>
                  Effacer la conversation
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══ Modal Upload ════════════════════════════════════════════════════════ */}
      {showFileModal && pendingFile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="card w-full max-w-sm p-5 flex flex-col gap-3">
            <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>Partager un fichier</h2>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg)", border: "1px solid rgba(0,0,0,0.07)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--rose-soft)" }}>
                <Paperclip size={14} style={{ color: "var(--rose)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{pendingFile.name}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{fileSize(pendingFile.size)}</p>
              </div>
            </div>
            <textarea placeholder="Description (optionnel)" value={fileDesc} onChange={(e) => setFileDesc(e.target.value)}
              rows={2} className="input-field resize-none text-sm" />
            {sprints.length > 0 && (
              <select value={fileSprint} onChange={(e) => setFileSprint(e.target.value)} className="input-field">
                <option value="">— Aucun sprint —</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            )}
            {uploadError && (
              <div className="rounded-xl px-3 py-2.5 text-xs font-medium"
                style={{ background: "var(--rose-soft)", color: "var(--rose)", border: "1px solid var(--rose-border)" }}>
                ⚠ {uploadError}
              </div>
            )}
            <button onClick={uploadFile} disabled={uploading} className="btn-primary w-full py-2.5">
              {uploading ? "Envoi en cours..." : "Envoyer le fichier"}
            </button>
            <button onClick={() => { setShowFileModal(false); setPendingFile(null); setUploadError(null); }} className="btn-ghost w-full py-2.5">Annuler</button>
          </div>
        </div>
      )}

      {/* ══ Modal Sprint ════════════════════════════════════════════════════════ */}
      {showSprintModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="card w-full max-w-sm p-5 flex flex-col gap-3">
            <div>
              <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>Nouvelle phase</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Une phase regroupe un ensemble de tâches sur une période donnée.</p>
            </div>
            <input placeholder="Nom (ex: Phase 1 — Connexion)" value={sprintNom} onChange={(e) => setSprintNom(e.target.value)} className="input-field" />
            <input placeholder="Objectif (optionnel)" value={sprintObj} onChange={(e) => setSprintObj(e.target.value)} className="input-field" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--subtle)" }}>Début</label>
                <input type="date" value={sprintDebut} onChange={(e) => setSprintDebut(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--subtle)" }}>Fin</label>
                <input type="date" value={sprintFin} onChange={(e) => setSprintFin(e.target.value)} className="input-field" />
              </div>
            </div>
            <button onClick={createSprint} disabled={savingSprint || !sprintNom || !sprintDebut || !sprintFin} className="btn-primary w-full py-2.5">
              {savingSprint ? "Création..." : "Créer cette phase"}
            </button>
            <button onClick={() => setShowSprintModal(false)} className="btn-ghost w-full py-2.5">Annuler</button>
          </div>
        </div>
      )}

      {/* ══ Modal Tâche ═════════════════════════════════════════════════════════ */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="card w-full max-w-sm p-5 flex flex-col gap-3 max-h-[85vh] overflow-y-auto">
            <h2 className="font-bold text-base" style={{ color: "var(--text)" }}>Nouvelle tâche</h2>
            <input placeholder="Ex : Créer la page d'accueil" value={taskTitre} onChange={(e) => setTaskTitre(e.target.value)} className="input-field" autoFocus />
            <textarea placeholder="Description (optionnel)" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)}
              rows={2} className="input-field resize-none text-sm" />
            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: "var(--subtle)" }}>Priorité</label>
              <div className="flex gap-1.5">
                {(["basse","normale","haute"] as Task["priorite"][]).map((p) => (
                  <button key={p} onClick={() => setTaskPrio(p)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-all capitalize"
                    style={{
                      background: taskPrio === p ? (p === "haute" ? "var(--rose-soft)" : p === "basse" ? "rgba(16,185,129,0.08)" : "rgba(0,0,0,0.05)") : "rgba(0,0,0,0.03)",
                      color: taskPrio === p ? (p === "haute" ? "var(--rose)" : p === "basse" ? "var(--green)" : "var(--text)") : "var(--muted)",
                      border: `1.5px solid ${taskPrio === p ? (p === "haute" ? "var(--rose-border)" : p === "basse" ? "rgba(16,185,129,0.2)" : "rgba(0,0,0,0.1)") : "rgba(0,0,0,0.06)"}`,
                    }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: PRIO[p].dot }} />
                    {PRIO[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sprints.length > 0 && (
                <select value={taskSprint} onChange={(e) => setTaskSprint(e.target.value)} className="input-field text-sm">
                  <option value="">Sprint</option>
                  {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              )}
              {members.length > 0 && (
                <select value={taskAssigne} onChange={(e) => setTaskAssigne(e.target.value)} className="input-field text-sm">
                  <option value="">Assigner</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                </select>
              )}
            </div>
            <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="input-field" />
            <button onClick={handleCreateTask} disabled={savingTask || !taskTitre.trim()} className="btn-primary w-full py-2.5">
              {savingTask ? "Création..." : "Créer la tâche"}
            </button>
            <button onClick={() => setShowTaskModal(false)} className="btn-ghost w-full py-2.5">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Composants
// ══════════════════════════════════════════════════════════════════════════════

function TaskCard({ task, members, sprints, showSprint, onOpen, onMove, onDelete }: {
  task: Task; members: Member[]; sprints: Sprint[]; showSprint: boolean;
  onOpen: () => void; onMove: (dir: "next"|"prev") => void; onDelete: () => void;
}) {
  const member  = members.find((m) => m.user_id === task.assigne_a);
  const sprint  = sprints.find((s) => s.id === task.sprint_id);
  const overdue = isOverdue(task.due_date) && task.statut !== "done";

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-lg p-2.5 transition-all duration-150"
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.08)";
      }}
    >
      <p className="text-sm font-medium leading-snug mb-2" style={{ color: "var(--text)" }}>{task.titre}</p>

      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PRIO[task.priorite].dot }} />
        {task.due_date && (
          <span className="text-xs flex items-center gap-0.5" style={{ color: overdue ? "var(--rose)" : "var(--subtle)" }}>
            {overdue && <AlertCircle size={9} />}{fmtDate(task.due_date)}
          </span>
        )}
        {showSprint && sprint && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.07)", color: "var(--violet)", fontSize: 10 }}>
            {sprint.nom}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {member && <Avatar member={member} size={16} />}
          {/* Actions au hover */}
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onMove("prev")} disabled={task.statut === "todo"}
              className="w-5 h-5 rounded flex items-center justify-center disabled:opacity-20"
              style={{ background: "rgba(0,0,0,0.06)", color: "var(--muted)" }}>
              <ChevronLeft size={10} strokeWidth={2} />
            </button>
            <button onClick={() => onMove("next")} disabled={task.statut === "done"}
              className="w-5 h-5 rounded flex items-center justify-center disabled:opacity-20"
              style={{ background: "rgba(0,0,0,0.06)", color: "var(--muted)" }}>
              <ChevronRight size={10} strokeWidth={2} />
            </button>
            <button onClick={onDelete}
              className="w-5 h-5 rounded flex items-center justify-center"
              style={{ background: "var(--rose-soft)", color: "var(--rose)" }}>
              <X size={9} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileRow({ d, members, userId, role, onDelete }: {
  d: Deliverable; members: Member[]; userId: string | null; role: string | null; onDelete: () => void;
}) {
  const uploader = members.find((m) => m.user_id === d.uploaded_by);
  const FileIcon = fileIcon(d.file_type);
  const canDelete = d.uploaded_by === userId || role === "founder";

  return (
    <div className="group flex items-center gap-3 p-3 rounded-xl transition-all"
      style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.07)" }}
      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.11)"}
      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,0,0,0.07)"}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "var(--rose-soft)" }}>
        <FileIcon size={16} style={{ color: "var(--rose)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{d.nom}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {uploader && <span className="text-xs" style={{ color: "var(--subtle)" }}>{uploader.nom}</span>}
          {d.file_size && <span className="text-xs" style={{ color: "var(--subtle)" }}>{fileSize(d.file_size)}</span>}
          <span className="text-xs" style={{ color: "var(--subtle)" }}>{fmtDate(d.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <a href={d.file_url} target="_blank" rel="noreferrer"
          className="btn-icon" style={{ width: 28, height: 28, color: "var(--blue)" }}
          onClick={(e) => e.stopPropagation()}>
          <Download size={13} strokeWidth={2} />
        </a>
        {canDelete && (
          <button onClick={onDelete} className="btn-icon opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ width: 28, height: 28, color: "var(--rose)" }}>
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
