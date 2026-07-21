"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppNav from "@/components/AppNav";
import { validateProjectFile } from "@/lib/fileUpload";
import AIPanel, { type RoadmapSprint, type HealthData } from "@/components/AIPanel";
import { sendNotif } from "@/lib/notifications";
import {
  Plus, Upload, LayoutGrid, List, CalendarRange, Folder,
  Paperclip, Image as ImageIcon, FileText, FileArchive, Film, FileSpreadsheet,
  Calendar, AlertTriangle, Check, X, Download, ChevronLeft, ChevronRight,
  Home, Users, MessageCircle, Sparkles, TrendingUp, Clock, GitBranch, RefreshCw, ExternalLink,
} from "lucide-react";

// ── Tokens ────────────────────────────────────────────────────────────────────

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#E5E5EA", canvas: "#F5F5F7", surface: "#FFFFFF" } as const;

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 13px", borderRadius: 11,
  border: `1px solid ${C.hairline}`, background: C.surface,
  fontSize: 13, color: C.ink, outline: "none",
};

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "1.2px", color: C.muted, marginBottom: 6,
};

const btnInk: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10, background: C.rose, color: "#fff",
  border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
};

const btnGhost: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 11, background: C.surface, color: C.muted,
  border: `1px solid ${C.hairline}`, fontSize: 13, fontWeight: 600, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
};

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

type CommitActivity = {
  sha: string; message: string; ai_summary: string | null;
  author_name: string | null; author_login: string | null;
  url: string; committed_at: string;
};
type ActivityDigest = { summary_fr: string; commit_count: number; digest_date: string };

type TaskComment = { id: string; task_id: string; user_id: string; content: string; created_at: string; };
type TaskChecklist = { id: string; task_id: string; titre: string; done: boolean; ordre: number; };
type Member = { user_id: string; nom: string; role: "founder" | "developer"; };
type Deliverable = {
  id: string; project_id: string; sprint_id: string | null; uploaded_by: string;
  nom: string; file_url: string; file_type: string | null; file_size: number | null;
  description: string | null; created_at: string;
};

// ── Constantes ────────────────────────────────────────────────────────────────

const COLONNES: { key: Task["statut"]; label: string; dot: string }[] = [
  { key: "todo",      label: "À faire",  dot: "#C7C7CC"  },
  { key: "en_cours",  label: "En cours", dot: "#4A7BF7"  },
  { key: "review",    label: "Review",   dot: "#FF9500"  },
  { key: "done",      label: "Terminé",  dot: "#34C759"  },
];

function prioStyle(p: Task["priorite"]): React.CSSProperties {
  const map: Record<Task["priorite"], { bg: string; color: string }> = {
    haute:   { bg: "rgba(255,59,48,0.12)",  color: "#D70015" },
    normale: { bg: "rgba(74,123,247,0.10)", color: "#3565DB" },
    basse:   { bg: "rgba(0,0,0,0.05)",      color: C.muted   },
  };
  return {
    fontSize: 11, fontWeight: p === "haute" ? 700 : 600, padding: "2px 9px", borderRadius: 100,
    border: "none", background: map[p].bg, color: map[p].color,
    textTransform: "capitalize",
  };
}

function statutBadge(s: Sprint["statut"] | Task["statut"]): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    en_cours: { bg: "rgba(74,123,247,0.12)", color: "#3565DB" },
    done:     { bg: "rgba(52,199,89,0.14)",  color: "#248A3D" },
    termine:  { bg: "rgba(52,199,89,0.14)",  color: "#248A3D" },
    review:   { bg: "rgba(255,149,0,0.14)",  color: "#C93400" },
    a_venir:  { bg: "rgba(0,0,0,0.05)",      color: C.muted   },
    todo:     { bg: "rgba(0,0,0,0.05)",      color: C.muted   },
  };
  const v = map[s] ?? { bg: "rgba(0,0,0,0.05)", color: C.muted };
  return {
    fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 100,
    border: "none", background: v.bg, color: v.color,
  };
}

const TABS = ["apercu", "taches", "roadmap", "fichiers"] as const;
type Tab = typeof TABS[number];

const TAB_META: Record<Tab, { label: string; icon: React.ReactNode }> = {
  apercu:   { label: "Vue d'ensemble", icon: <Home          size={12} strokeWidth={2} /> },
  taches:   { label: "Tâches",         icon: <LayoutGrid    size={12} strokeWidth={2} /> },
  roadmap:  { label: "Roadmap",        icon: <CalendarRange size={12} strokeWidth={2} /> },
  fichiers: { label: "Fichiers",       icon: <Folder        size={12} strokeWidth={2} /> },
};

const PHASES = ["Cadrage", "Build", "Tests", "Livré"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function FileIcon({ t, size = 20 }: { t: string | null; size?: number }) {
  const style = { color: C.ink };
  if (!t) return <Paperclip size={size} strokeWidth={1.5} style={style} />;
  if (t.startsWith("image/")) return <ImageIcon size={size} strokeWidth={1.5} style={style} />;
  if (t === "application/pdf") return <FileText size={size} strokeWidth={1.5} style={style} />;
  if (t.includes("zip") || t.includes("rar")) return <FileArchive size={size} strokeWidth={1.5} style={style} />;
  if (t.includes("word") || t.includes("document")) return <FileText size={size} strokeWidth={1.5} style={style} />;
  if (t.includes("sheet") || t.includes("excel")) return <FileSpreadsheet size={size} strokeWidth={1.5} style={style} />;
  if (t.includes("video")) return <Film size={size} strokeWidth={1.5} style={style} />;
  return <Paperclip size={size} strokeWidth={1.5} style={style} />;
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
  const [activeTab, setActiveTab]     = useState<Tab>("apercu");
  const [taskView, setTaskView]       = useState<"kanban" | "liste">("kanban");
  const [convId, setConvId]           = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [now] = useState(() => Date.now());

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

  // IA
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [linkingRepo, setLinkingRepo] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [commits, setCommits] = useState<CommitActivity[]>([]);
  const [digest, setDigest] = useState<ActivityDigest | null>(null);
  const [syncingRepo, setSyncingRepo] = useState(false);

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
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Chargement ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      // getSession() is local — no network round-trip for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.push("/connexion"); return; }
      const userId = session.user.id;
      setUserId(userId);

      // Parallel: role + project + conversation (3 queries → 1 round-trip)
      const [{ data: roleData }, { data: proj }, { data: conv }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("projects")
          .select("titre, statut, github_repo, profiles_founder(nom, user_id)")
          .eq("id", projectId).maybeSingle(),
        supabase.from("conversations")
          .select("id, profiles_developer(nom, user_id)")
          .eq("project_id", projectId).maybeSingle(),
      ]);

      setRole(roleData?.role ?? null);

      if (!proj || !["matched", "en_cours"].includes(proj.statut)) {
        router.push(`/projets/${projectId}`); return;
      }
      setProjectTitre(proj.titre);
      setGithubRepo(proj.github_repo ?? null);

      const membersArr: Member[] = [];
      const fp = proj.profiles_founder as unknown as { nom: string; user_id: string } | null;
      if (fp) membersArr.push({ user_id: fp.user_id, nom: fp.nom, role: "founder" });
      const dp = conv?.profiles_developer as unknown as { nom: string; user_id: string } | null;
      if (dp) membersArr.push({ user_id: dp.user_id, nom: dp.nom, role: "developer" });
      if (conv?.id) setConvId(conv.id);
      setMembers(membersArr);

      // Parallel: sprints + tasks + deliverables
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

      // Health score — non-blocking, uses already-available session token
      if (session.access_token) {
        fetch("/api/ai/health", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify({ projectId }),
        }).then(r => r.ok ? r.json() : null).then(d => { if (d) setHealthData(d as HealthData); }).catch(() => {});

        if (proj.github_repo) syncGithub(session.access_token);
      }
    }
    load();
  }, [projectId, router]);

  // ── GitHub : liaison + synchronisation ──────────────────────────────────────

  async function syncGithub(accessToken: string) {
    setSyncingRepo(true);
    try {
      const res = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setCommits(data.commits ?? []);
        setDigest(data.digest ?? null);
      }
    } catch (e) {
      console.error("[GitHub sync]", e);
    } finally {
      setSyncingRepo(false);
    }
  }

  async function linkGithubRepo() {
    const cleaned = repoInput.trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
      setRepoError("Format attendu : owner/repo ou un lien github.com/owner/repo");
      return;
    }
    setRepoError("");
    setLinkingRepo(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/github/link", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ projectId, repo: cleaned }),
    });
    const data = await res.json();
    setLinkingRepo(false);
    if (!res.ok) { setRepoError(data.error ?? "Erreur lors de l'enregistrement."); return; }
    setGithubRepo(cleaned);
    if (session?.access_token) syncGithub(session.access_token);
  }

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

    // Notifier tous les autres membres du projet
    const assigneeName = taskAssigne ? members.find((m) => m.user_id === taskAssigne)?.nom : null;
    for (const member of members.filter((m) => m.user_id !== userId)) {
      const isAssignee = member.user_id === taskAssigne;
      sendNotif({
        userId: member.user_id,
        projectId,
        type: "task_assigned",
        title: isAssignee
          ? `Tâche assignée : "${taskTitre.trim()}"`
          : `Nouvelle tâche : "${taskTitre.trim()}"`,
        body: isAssignee
          ? `${projectTitre} · Tu es assigné(e) à cette tâche${taskPrio === "haute" ? " — priorité haute" : ""}.`
          : `${projectTitre} · Créée${assigneeName ? ` et assignée à ${assigneeName}` : ""}${taskPrio === "haute" ? " — priorité haute" : ""}.`,
      });
    }

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

    const other = members.find((m) => m.user_id !== userId);
    if (other) {
      const labels: Record<string, string> = { todo: "À faire", en_cours: "En cours", review: "En review", done: "Terminé" };
      sendNotif({
        userId: other.user_id,
        projectId,
        type: "task_status",
        title: `Tâche "${task.titre}" → ${labels[newStatut]}`,
        body: `${projectTitre} · Passage de "${labels[task.statut]}" à "${labels[newStatut]}"`,
      });
    }
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

    const other = members.find((m) => m.user_id !== userId);
    if (other) {
      const labels: Record<string, string> = { a_venir: "À venir", en_cours: "En cours", termine: "Terminé" };
      sendNotif({
        userId: other.user_id,
        projectId,
        type: "sprint_status",
        title: `Sprint "${sprint.nom}" — ${labels[statut]}`,
        body: `${projectTitre} · Le sprint est maintenant "${labels[statut]}".`,
      });
    }
  }

  // ── Roadmap IA ───────────────────────────────────────────────────────────────

  async function handleRoadmapGenerated(aiSprints: RoadmapSprint[]) {
    const today = new Date();
    const cursor = new Date(today);
    for (const s of aiSprints) {
      const debut = cursor.toISOString().slice(0, 10);
      cursor.setDate(cursor.getDate() + (s.duree_jours || 14));
      const fin = cursor.toISOString().slice(0, 10);
      const { data: newSprint } = await supabase.from("sprints").insert({
        project_id: projectId, nom: s.nom, objectif: s.objectif,
        date_debut: debut, date_fin: fin, statut: "a_venir",
      }).select().maybeSingle();
      if (newSprint) setSprints(prev => [...prev, newSprint as Sprint]);
    }
  }

  // ── Fichiers ─────────────────────────────────────────────────────────────────

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const check = validateProjectFile(file);
    if (!check.ok) { e.target.value = ""; alert(check.error); return; }
    setPendingFile(file); setFileDesc("");
    setFileSprint(selectedSprintId === "all" ? (sprints[0]?.id ?? "") : selectedSprintId);
    setShowFileModal(true); e.target.value = "";
  }

  async function uploadFile() {
    if (!pendingFile || !userId) return;
    const check = validateProjectFile(pendingFile);
    if (!check.ok) { setUploadError(check.error); return; }
    setUploading(true);
    setUploadError(null);
    const path = `${projectId}/${crypto.randomUUID()}.${check.ext}`;
    const { error: storageErr } = await supabase.storage.from("project-files").upload(path, pendingFile);
    if (storageErr) {
      setUploadError(storageErr.message);
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
    const { data, error: dbErr } = await supabase.from("deliverables").insert({
      project_id: projectId, sprint_id: fileSprint || null, uploaded_by: userId,
      nom: pendingFile.name, file_url: urlData.publicUrl,
      file_type: pendingFile.type, file_size: pendingFile.size, description: fileDesc || null,
    }).select().maybeSingle();
    if (dbErr) {
      setUploadError(dbErr.message);
      setUploading(false);
      return;
    }
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
    ? Math.ceil((new Date(selectedSprint.date_fin).getTime() - now) / 86400000) : null;

  // ── Vue d'ensemble : dérivations ─────────────────────────────────────────────

  const totalTasks    = tasks.length;
  const doneTasks     = tasks.filter((t) => t.statut === "done").length;
  const inProgTasks   = tasks.filter((t) => t.statut === "en_cours").length;
  const globalPct     = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;
  const sprintsDone   = sprints.filter((s) => s.statut === "termine").length;
  const currentSprint = sprints.find((s) => s.statut === "en_cours");
  const currentDaysLeft = currentSprint
    ? Math.max(0, Math.ceil((new Date(currentSprint.date_fin).getTime() - now) / 86400000)) : null;

  // Phase du projet : 0 Cadrage, 1 Build, 2 Tests, 3 Livré
  const phase =
    sprints.length === 0 || (sprintsDone === 0 && !currentSprint) ? 0
    : sprintsDone === sprints.length && globalPct === 100 ? 3
    : globalPct >= 80 ? 2
    : 1;

  // Résumé en français simple, calculé des vraies données
  const resumePhrases: string[] = [];
  if (digest) {
    resumePhrases.push(digest.summary_fr);
  } else if (totalTasks === 0) {
    resumePhrases.push("Le projet démarre — votre équipe prépare les premières tâches.");
  } else {
    resumePhrases.push(
      `${doneTasks} tâche${doneTasks > 1 ? "s" : ""} terminée${doneTasks > 1 ? "s" : ""} sur ${totalTasks}` +
      (inProgTasks > 0 ? `, ${inProgTasks} en cours en ce moment.` : ".")
    );
  }
  if (currentSprint) {
    resumePhrases.push(
      `Étape en cours : ${currentSprint.nom}` +
      (currentSprint.objectif ? ` — ${currentSprint.objectif}` : "") +
      (currentDaysLeft !== null ? ` (fin prévue le ${fmtDate(currentSprint.date_fin)}).` : ".")
    );
  }
  if (deliverables.length > 0) {
    resumePhrases.push(`Dernier fichier partagé : ${deliverables[0].nom}, le ${fmtDate(deliverables[0].created_at)}.`);
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${C.hairline}`, borderTopColor: C.ink, animation: "lk-spin 0.8s linear infinite" }} />
      <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // Rendu
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="pl-sidebar" style={{ minHeight: "100vh", background: C.canvas }}>
      <AppNav />
      <style>{`@keyframes lk-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 px-4 py-3" style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${C.hairline}` }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h1 className="truncate" style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: C.ink, margin: 0 }}>{projectTitre}</h1>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                {PHASES[phase]} · {globalPct}% réalisé
              </p>
            </div>
            {activeTab === "taches" && (
              <button onClick={() => setShowTaskModal(true)} style={{ ...btnInk, flexShrink: 0 }}><Plus size={13} strokeWidth={2.5} /> Tâche</button>
            )}
            {activeTab === "fichiers" && (
              <label style={{ ...btnInk, flexShrink: 0 }}>
                <Upload size={13} strokeWidth={2} /> Fichier <input type="file" className="hidden" onChange={onFileSelect} />
              </label>
            )}
            {role === "founder" && activeTab === "taches" && (
              <button onClick={() => setShowSprintModal(true)} style={{ ...btnGhost, flexShrink: 0 }}><Plus size={13} strokeWidth={2} /> Sprint</button>
            )}
            <button
              onClick={() => setShowAIPanel(true)}
              style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6,
                padding: healthData ? "0 10px 0 0" : "0",
                width: healthData ? "auto" : 36, height: 36,
                borderRadius: 11, background: C.rose, color: "#fff", fontSize: 15, border: "none", cursor: "pointer",
              }}
              title="Assistant IA"
            >
              <span style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✦</span>
              {healthData && (
                <span style={{ fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: healthData.color, flexShrink: 0 }} />
                  {healthData.score}
                </span>
              )}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {TABS.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 9, cursor: "pointer",
                  background: activeTab === tab ? C.ink : "transparent",
                  color: activeTab === tab ? "#fff" : C.muted,
                  border: activeTab === tab ? `1px solid ${C.ink}` : "1px solid transparent",
                }}>
                {TAB_META[tab].icon}{TAB_META[tab].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">

        {/* ── Sprint selector + info ─────────────────────────────────────── */}
        {(activeTab === "taches" || activeTab === "roadmap") && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              <button onClick={() => setSelectedSprintId("all")}
                style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "7px 15px", borderRadius: 9, cursor: "pointer",
                  background: selectedSprintId === "all" ? C.ink : C.surface,
                  color: selectedSprintId === "all" ? "#fff" : C.muted,
                  border: selectedSprintId === "all" ? `1px solid ${C.ink}` : `1px solid ${C.hairline}`,
                }}>Tout</button>
              {sprints.map((s) => (
                <button key={s.id} onClick={() => setSelectedSprintId(s.id)}
                  style={{
                    flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "7px 15px", borderRadius: 9, cursor: "pointer",
                    background: selectedSprintId === s.id ? C.ink : C.surface,
                    color: selectedSprintId === s.id ? "#fff" : C.muted,
                    border: selectedSprintId === s.id ? `1px solid ${C.ink}` : `1px solid ${C.hairline}`,
                  }}>{s.nom}</button>
              ))}
            </div>

            {selectedSprint && (
              <div className="flex flex-wrap gap-4 items-center" style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: C.ink, margin: 0 }}>{selectedSprint.nom}</h2>
                    <span style={statutBadge(selectedSprint.statut)}>
                      {selectedSprint.statut === "en_cours" ? "En cours" : selectedSprint.statut === "termine" ? "Terminé" : "À venir"}
                    </span>
                  </div>
                  {selectedSprint.objectif && <p style={{ fontSize: 13, color: C.muted, margin: "0 0 4px" }}>{selectedSprint.objectif}</p>}
                  <div className="flex gap-3" style={{ fontSize: 11, color: C.muted }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Calendar size={10} strokeWidth={2} /> {fmtDate(selectedSprint.date_debut)} → {fmtDate(selectedSprint.date_fin)}
                    </span>
                    {daysLeft !== null && selectedSprint.statut !== "termine" && (
                      <span style={{ color: daysLeft < 3 ? C.rose : C.muted, fontWeight: daysLeft < 3 ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
                        {daysLeft > 0 ? `${daysLeft}j restants` : "Expiré"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full sm:w-44">
                  <div className="flex justify-between mb-1" style={{ fontSize: 11, color: C.muted }}>
                    <span>Avancement</span><span style={{ fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{donePct}%</span>
                  </div>
                  <div style={{ height: 5, background: C.hairline, borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#4A7BF7", borderRadius: 99, transition: "width 0.3s", width: `${donePct}%` }} />
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{sprintFiltered.filter((t) => t.statut === "done").length}/{sprintFiltered.length} tâches</p>
                </div>
                {role === "founder" && (
                  <div className="flex gap-2">
                    {selectedSprint.statut === "a_venir" && (
                      <button onClick={() => updateSprintStatut(selectedSprint, "en_cours")}
                        style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: C.rose, border: "none", padding: "7px 14px", borderRadius: 9, cursor: "pointer" }}>Démarrer</button>
                    )}
                    {selectedSprint.statut === "en_cours" && (
                      <button onClick={() => updateSprintStatut(selectedSprint, "termine")}
                        style={{ fontSize: 12, fontWeight: 700, color: C.ink, background: C.surface, border: `1px solid ${C.ink}`, padding: "7px 14px", borderRadius: 9, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Check size={12} strokeWidth={2.5} /> Terminer
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Filtres + bascule kanban/liste */}
            {activeTab === "taches" && (
              <div className="flex gap-2 mb-4 flex-wrap">
                <div className="flex" style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: 2 }}>
                  {(["kanban", "liste"] as const).map((v) => (
                    <button key={v} onClick={() => setTaskView(v)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
                        padding: "5px 12px", borderRadius: 7, cursor: "pointer", border: "none",
                        background: taskView === v ? C.ink : "transparent",
                        color: taskView === v ? "#fff" : C.muted,
                      }}>
                      {v === "kanban" ? <LayoutGrid size={11} strokeWidth={2} /> : <List size={11} strokeWidth={2} />}
                      {v === "kanban" ? "Kanban" : "Liste"}
                    </button>
                  ))}
                </div>
                <select value={filterAssigne} onChange={(e) => setFilterAssigne(e.target.value)}
                  style={{ fontSize: 12, fontWeight: 600, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "6px 12px", background: C.surface, color: C.muted, outline: "none" }}>
                  <option value="all">Tous les membres</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                </select>
                <select value={filterPrio} onChange={(e) => setFilterPrio(e.target.value)}
                  style={{ fontSize: 12, fontWeight: 600, border: `1px solid ${C.hairline}`, borderRadius: 9, padding: "6px 12px", background: C.surface, color: C.muted, outline: "none" }}>
                  <option value="all">Priorité</option>
                  <option value="haute">Haute</option>
                  <option value="normale">Normale</option>
                  <option value="basse">Basse</option>
                </select>
                {(filterAssigne !== "all" || filterPrio !== "all") && (
                  <button onClick={() => { setFilterAssigne("all"); setFilterPrio("all"); }}
                    style={{ fontSize: 12, fontWeight: 600, color: C.rose, background: "none", border: "none", cursor: "pointer", padding: "6px 12px" }}>✕ Réinitialiser</button>
                )}
                <span className="self-center ml-auto" style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{filtered.length} tâche{filtered.length > 1 ? "s" : ""}</span>
              </div>
            )}
          </>
        )}

        {/* ══ Vue d'ensemble ══════════════════════════════════════════════════ */}
        {activeTab === "apercu" && (
          <div className="flex flex-col gap-4">

            {/* Timeline projet — 4 étapes */}
            <div style={{ background: C.surface, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "24px 24px 20px" }}>
              <div className="flex items-center" style={{ maxWidth: 640, margin: "0 auto" }}>
                {PHASES.map((p, i) => {
                  const done    = i < phase;
                  const current = i === phase;
                  return (
                    <div key={p} className="flex items-center" style={{ flex: i < PHASES.length - 1 ? 1 : "none" }}>
                      <div className="flex flex-col items-center gap-1.5" style={{ flexShrink: 0 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: done ? "#34C759" : current ? C.rose : "#EDEDF0",
                          boxShadow: current ? "0 0 0 5px rgba(212,83,126,0.15)" : "none",
                          transition: "box-shadow 0.3s",
                        }}>
                          {done
                            ? <Check size={14} strokeWidth={3} color="#fff" />
                            : <span style={{ width: 8, height: 8, borderRadius: "50%", background: current ? "#fff" : "#C7C7CC" }} />
                          }
                        </div>
                        <span style={{ fontSize: 12, fontWeight: current ? 700 : 600, color: done ? "#248A3D" : current ? C.rose : C.muted, whiteSpace: "nowrap" }}>
                          {p}
                        </span>
                      </div>
                      {i < PHASES.length - 1 && (
                        <div style={{ flex: 1, height: 3, borderRadius: 99, margin: "0 10px", marginBottom: 22, background: i < phase ? "#34C759" : "#EDEDF0" }} />
                      )}
                    </div>
                  );
                })}
              </div>
              {sprints.length > 0 && (
                <p className="text-center" style={{ fontSize: 12, color: C.muted, margin: "14px 0 0", fontVariantNumeric: "tabular-nums" }}>
                  Sprint {Math.min(sprintsDone + (currentSprint ? 1 : 0), sprints.length) || 1}/{sprints.length} · {globalPct}% du projet réalisé
                </p>
              )}
            </div>

            {/* Où en est le projet ? */}
            <div style={{ background: C.surface, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 20 }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(212,83,126,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Sparkles size={17} strokeWidth={2} style={{ color: C.rose }} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>Où en est le projet ?</h2>
              </div>
              <div className="flex flex-col gap-1.5">
                {resumePhrases.map((p, i) => (
                  <p key={i} style={{ fontSize: 14, lineHeight: 1.6, color: "#454C61", margin: 0 }}>{p}</p>
                ))}
              </div>
            </div>

            {/* Lier le repo GitHub — dev uniquement, tant que rien n'est lié */}
            {role === "developer" && !githubRepo && (
              <div style={{ background: C.surface, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 20 }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <GitBranch size={17} strokeWidth={2} style={{ color: C.ink }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>Lier ton repo GitHub</h2>
                    <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Linkeo traduira automatiquement tes commits pour le client.</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="owner/repo ou https://github.com/owner/repo"
                    style={{ flex: 1, minWidth: 220, padding: "10px 13px", borderRadius: 10, border: `1px solid ${C.hairline}`, fontSize: 13, color: C.ink, outline: "none" }}
                  />
                  <button onClick={linkGithubRepo} disabled={linkingRepo || !repoInput.trim()}
                    style={{ ...btnInk, opacity: linkingRepo || !repoInput.trim() ? 0.5 : 1 }}>
                    {linkingRepo ? "Liaison…" : "Lier"}
                  </button>
                </div>
                {repoError && <p style={{ fontSize: 12, color: "#FF3B30", margin: "8px 0 0" }}>{repoError}</p>}
                <p style={{ fontSize: 11, color: C.muted, margin: "8px 0 0" }}>Le repo doit être public pour l&apos;instant.</p>
              </div>
            )}

            {/* Métriques */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {([
                { label: "Avancement",  value: `${globalPct}%`,                            icon: TrendingUp, color: "#4A7BF7", bg: "rgba(74,123,247,0.12)"  },
                { label: "Tâches",      value: `${doneTasks}/${totalTasks}`,               icon: Check,      color: "#34C759", bg: "rgba(52,199,89,0.12)"   },
                { label: "Jours restants", value: currentDaysLeft !== null ? `${currentDaysLeft}j` : "—", icon: Clock, color: "#FF9500", bg: "rgba(255,149,0,0.12)" },
                { label: "Livrables",   value: `${deliverables.length}`,                   icon: Folder,     color: C.rose,    bg: "rgba(212,83,126,0.12)"  },
              ] as { label: string; value: string; icon: React.ElementType; color: string; bg: string }[]).map((kpi) => (
                <div key={kpi.label} style={{ background: C.surface, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "16px 18px" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: kpi.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <kpi.icon size={16} strokeWidth={2} style={{ color: kpi.color }} />
                  </div>
                  <p style={{ fontSize: 24, fontWeight: 700, color: C.ink, margin: "0 0 2px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{kpi.value}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, margin: 0 }}>{kpi.label}</p>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Mon équipe */}
              <div style={{ background: C.surface, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 20 }}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(74,123,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Users size={17} strokeWidth={2} style={{ color: "#4A7BF7" }} />
                  </div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>Mon équipe</h2>
                </div>
                <div className="flex flex-col gap-3">
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-3">
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{m.nom[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>
                          {m.nom}{m.user_id === userId ? " (vous)" : ""}
                        </p>
                        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{m.role === "founder" ? "Client" : "Développeur"}</p>
                      </div>
                      {m.user_id !== userId && (
                        <button
                          onClick={() => router.push(convId ? `/messages/${convId}` : "/messages")}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "7px 13px", borderRadius: 9, background: "rgba(212,83,126,0.10)", color: C.rose, border: "none", cursor: "pointer", flexShrink: 0 }}>
                          <MessageCircle size={12} strokeWidth={2} /> Contacter
                        </button>
                      )}
                    </div>
                  ))}
                  {members.length === 0 && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Équipe en cours de constitution.</p>}
                </div>
              </div>

              {/* Derniers livrables */}
              <div style={{ background: C.surface, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 20 }}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(52,199,89,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Folder size={17} strokeWidth={2} style={{ color: "#34C759" }} />
                  </div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>Derniers fichiers</h2>
                </div>
                {deliverables.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Aucun fichier pour l&apos;instant — ils apparaîtront ici dès qu&apos;un membre en partage un.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {deliverables.slice(0, 3).map((d) => (
                      <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-3 transition-opacity hover:opacity-70" style={{ textDecoration: "none" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <FileIcon t={d.file_type} size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>{d.nom}</p>
                          <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{fmtDate(d.created_at)}{d.file_size ? ` · ${fileSize(d.file_size)}` : ""}</p>
                        </div>
                        <Download size={14} strokeWidth={2} style={{ color: C.muted, flexShrink: 0 }} />
                      </a>
                    ))}
                    <button onClick={() => setActiveTab("fichiers")}
                      style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 600, color: C.rose, background: "none", border: "none", cursor: "pointer", padding: "4px 0", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Voir tous les fichiers <ChevronRight size={12} strokeWidth={2.2} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Journal d'activité GitHub */}
            {githubRepo && (
              <div style={{ background: C.surface, borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: 20 }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <GitBranch size={17} strokeWidth={2} style={{ color: C.ink }} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>Journal d&apos;activité</h2>
                      <a href={`https://github.com/${githubRepo}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: C.muted, display: "inline-flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                        {githubRepo} <ExternalLink size={10} strokeWidth={2} />
                      </a>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (session?.access_token) syncGithub(session.access_token);
                    }}
                    disabled={syncingRepo}
                    style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.hairline}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                    title="Actualiser"
                  >
                    <RefreshCw size={14} strokeWidth={2} style={{ color: C.muted, animation: syncingRepo ? "lk-spin 0.8s linear infinite" : "none" }} />
                  </button>
                </div>
                {commits.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                    {syncingRepo ? "Récupération des commits…" : "Aucun commit détecté pour l'instant."}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {commits.slice(0, 8).map((c) => (
                      <a key={c.sha} href={c.url} target="_blank" rel="noreferrer"
                        className="flex items-start gap-3 transition-opacity hover:opacity-70" style={{ textDecoration: "none" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{(c.author_name ?? c.author_login ?? "?")[0]?.toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 13, color: C.ink, margin: 0, lineHeight: 1.5 }}>{c.ai_summary ?? c.message}</p>
                          <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>
                            {c.author_name ?? c.author_login ?? "Inconnu"} · {fmtDate(c.committed_at)}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ Vue Kanban ══════════════════════════════════════════════════════ */}
        {activeTab === "taches" && taskView === "kanban" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {COLONNES.map((col) => {
              const colTasks = filtered.filter((t) => t.statut === col.key);
              return (
                <div key={col.key} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{col.label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{colTasks.length}</span>
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
                      style={{ fontSize: 12, color: C.muted, padding: "8px 0", border: `2px dashed ${C.hairline}`, borderRadius: 11, background: "none", cursor: "pointer" }}>
                      + Ajouter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ Vue Liste ════════════════════════════════════════════════════════ */}
        {activeTab === "taches" && taskView === "liste" && (
          <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.hairline}`, overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div className="text-center py-16" style={{ color: C.muted, fontSize: 13 }}>Aucune tâche.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                    {["Tâche","Statut","Priorité","Assigné","Échéance",""].map((h, i) => (
                      <th key={i} className={`text-left px-4 py-3 ${i===1?"hidden sm:table-cell":i===2||i===3?"hidden md:table-cell":i===4?"hidden lg:table-cell":""}`}
                        style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted }}>{h}</th>
                    ))}
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
                        className="cursor-pointer transition-colors group"
                        style={{ borderBottom: `1px solid ${C.hairline}` }}>
                        <td className="px-4 py-3">
                          <p style={{ fontWeight: 600, color: C.ink, margin: 0 }}>{task.titre}</p>
                          {task.description && <p className="line-clamp-1" style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>{task.description}</p>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span style={statutBadge(task.statut)}>{col.label}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span style={prioStyle(task.priorite)}>{task.priorite}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {member ? (
                            <div className="flex items-center gap-1.5">
                              <div style={{ width: 20, height: 20, borderRadius: 7, background: "#34C759", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{member.nom[0].toUpperCase()}</span>
                              </div>
                              <span style={{ fontSize: 12, color: C.ink }}>{member.nom}</span>
                            </div>
                          ) : <span style={{ fontSize: 12, color: C.hairline }}>—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {task.due_date ? (
                            <span style={{ fontSize: 12, fontWeight: 600, color: overdue ? C.rose : C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {overdue && <AlertTriangle size={11} strokeWidth={2} />}{fmtDate(task.due_date)}
                            </span>
                          ) : <span style={{ fontSize: 12, color: C.hairline }}>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                            className="opacity-0 group-hover:opacity-100 transition-all"
                            style={{ fontSize: 12, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>✕</button>
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
              <div className="text-center py-20" style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.hairline}` }}>
                <p style={{ color: C.muted, fontSize: 13, margin: "0 0 12px" }}>Aucun sprint créé.</p>
                {role === "founder" && (
                  <button onClick={() => setShowSprintModal(true)} style={btnInk}>Créer le premier sprint</button>
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
                  <div className="flex justify-between px-1" style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
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
                    const barBg = s.statut === "en_cours" ? C.ink : s.statut === "termine" ? C.muted : C.hairline;
                    const barText = s.statut === "a_venir" ? C.ink : "#fff";
                    return (
                      <div key={s.id} style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.hairline}`, padding: 20 }}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: C.ink, margin: 0 }}>{s.nom}</h3>
                              <span style={statutBadge(s.statut)}>{s.statut === "en_cours" ? "En cours" : s.statut === "termine" ? "Terminé" : "À venir"}</span>
                            </div>
                            {s.objectif && <p style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>{s.objectif}</p>}
                          </div>
                          <div className="text-right">
                            <p style={{ fontSize: 11, color: C.muted, margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmtDate(s.date_debut)} → {fmtDate(s.date_fin)}</p>
                            <p style={{ fontSize: 11, fontWeight: 600, color: C.ink, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>{doneTasks}/{sprintTasks.length} tâches · {pct}%</p>
                          </div>
                        </div>

                        {/* Barre timeline */}
                        <div className="relative overflow-hidden mb-3" style={{ height: 32, background: C.canvas, border: `1px solid ${C.hairline}`, borderRadius: 99 }}>
                          <div
                            className="absolute h-full flex items-center px-3"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: barBg, borderRadius: 99 }}
                          >
                            <span className="truncate" style={{ fontSize: 11, fontWeight: 700, color: barText }}>{s.nom}</span>
                          </div>
                          {/* Marqueur aujourd'hui */}
                          {(() => {
                            const todayPct = ((Date.now() - minDate.getTime()) / 86400000 / totalDays) * 100;
                            if (todayPct < 0 || todayPct > 100) return null;
                            return <div className="absolute top-0 bottom-0 z-10" style={{ left: `${todayPct}%`, width: 2, background: C.rose }} />;
                          })()}
                        </div>

                        {/* Tâches du sprint */}
                        {sprintTasks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {sprintTasks.map((t) => (
                              <button key={t.id} onClick={() => openPanel(t)}
                                style={{
                                  fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                                  border: `1px solid ${C.hairline}`, background: t.statut === "done" ? C.canvas : C.surface,
                                  color: t.statut === "done" ? C.muted : C.ink,
                                  textDecoration: t.statut === "done" ? "line-through" : "none",
                                }}>
                                {t.titre}
                              </button>
                            ))}
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
              <div className="text-center py-20" style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.hairline}` }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, border: `1px solid ${C.hairline}`, background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <Folder size={24} strokeWidth={1.5} style={{ color: C.muted }} />
                </div>
                <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>Aucun fichier partagé.</p>
                <label style={{ ...btnInk, cursor: "pointer" }}>
                  <Upload size={13} strokeWidth={2} /> Uploader un fichier <input type="file" className="hidden" onChange={onFileSelect} />
                </label>
              </div>
            ) : (
              <>
                {sprints.filter((s) => deliverables.some((d) => d.sprint_id === s.id)).map((s) => (
                  <div key={s.id}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: "0 0 8px" }}>{s.nom}</p>
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
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: "0 0 8px" }}>Général</p>
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
          <div className="fixed inset-0 z-30" style={{ background: "rgba(26,33,56,0.25)" }} onClick={() => setPanelTask(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md z-40 flex flex-col overflow-hidden" style={{ background: C.surface, borderLeft: `1px solid ${C.hairline}` }}>

            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.hairline}` }}>
              <div className="flex gap-2">
                <button onClick={() => moveTask(panelTask, "prev")} disabled={panelTask.statut === "todo"}
                  style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 9, background: C.canvas, color: C.muted, border: `1px solid ${C.hairline}`, cursor: "pointer", opacity: panelTask.statut === "todo" ? 0.3 : 1, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <ChevronLeft size={12} strokeWidth={2} /> Reculer
                </button>
                <button onClick={() => moveTask(panelTask, "next")} disabled={panelTask.statut === "done"}
                  style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 9, background: "#34C759", color: "#fff", border: "none", cursor: "pointer", opacity: panelTask.statut === "done" ? 0.3 : 1, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Avancer <ChevronRight size={12} strokeWidth={2} />
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => deleteTask(panelTask.id)}
                  style={{ fontSize: 12, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "6px 8px" }}>Supprimer</button>
                <button onClick={() => setPanelTask(null)}
                  style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 9, background: C.canvas, border: `1px solid ${C.hairline}`, cursor: "pointer", color: C.muted }}>
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

              {/* Statut badge */}
              {(() => {
                const col = COLONNES.find((c) => c.key === panelTask.statut)!;
                return <span className="self-start" style={statutBadge(panelTask.statut)}>{col.label}</span>;
              })()}

              {/* Titre */}
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 700, color: C.ink, background: "transparent", border: "none", borderBottom: `2px solid transparent`, outline: "none", paddingBottom: 4, width: "100%" }}
                onFocus={(e) => { e.target.style.borderBottomColor = C.rose; }}
                onBlur={(e) => { e.target.style.borderBottomColor = "transparent"; }}
                placeholder="Titre de la tâche" />

              {/* Description */}
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                style={{ ...inp, resize: "none", background: C.canvas, lineHeight: 1.5 }}
                placeholder="Description..." />

              {/* Métadonnées */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lbl}>Priorité</label>
                  <select value={editPrio} onChange={(e) => setEditPrio(e.target.value as Task["priorite"])} style={inp}>
                    <option value="basse">Basse</option>
                    <option value="normale">Normale</option>
                    <option value="haute">Haute</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Échéance</label>
                  <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} style={{ ...inp, fontVariantNumeric: "tabular-nums" }} />
                </div>
                <div>
                  <label style={lbl}>Sprint</label>
                  <select value={editSprint} onChange={(e) => setEditSprint(e.target.value)} style={inp}>
                    <option value="">— Aucun —</option>
                    {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Assigné à</label>
                  <select value={editAssigne} onChange={(e) => setEditAssigne(e.target.value)} style={inp}>
                    <option value="">— Personne —</option>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
                  </select>
                </div>
              </div>

              <button onClick={savePanelTask} disabled={savingPanel}
                style={{ ...btnInk, width: "100%", padding: "11px 0", opacity: savingPanel ? 0.6 : 1 }}>
                {savingPanel ? "Enregistrement..." : "Enregistrer les modifications"}
              </button>

              {/* Checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: 0 }}>Checklist</p>
                  {panelChecklist.length > 0 && (
                    <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{panelChecklist.filter((c) => c.done).length}/{panelChecklist.length}</span>
                  )}
                </div>
                {panelChecklist.length > 0 && (
                  <div className="overflow-hidden mb-3" style={{ height: 5, background: C.hairline, borderRadius: 99 }}>
                    <div style={{ height: "100%", background: "#4A7BF7", borderRadius: 99, transition: "width 0.3s", width: `${Math.round(panelChecklist.filter((c) => c.done).length / panelChecklist.length * 100)}%` }} />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 mb-2">
                  {panelChecklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <button onClick={() => toggleCheckItem(item)}
                        style={{ width: 16, height: 16, borderRadius: 5, border: item.done ? `1px solid ${C.ink}` : `1px solid ${C.hairline}`, background: item.done ? C.ink : C.surface, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", padding: 0 }}>
                        {item.done && <Check size={10} strokeWidth={3} style={{ color: "#fff" }} />}
                      </button>
                      <span className="flex-1" style={{ fontSize: 13, color: item.done ? C.muted : C.ink, textDecoration: item.done ? "line-through" : "none" }}>{item.titre}</span>
                      <button onClick={() => deleteCheckItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-all"
                        style={{ fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCheckItem()}
                    placeholder="Ajouter un élément..."
                    style={{ ...inp, flex: 1 }} />
                  <button onClick={addCheckItem} disabled={!newCheckItem.trim()}
                    style={{ ...btnGhost, flexShrink: 0, padding: "9px 13px", opacity: !newCheckItem.trim() ? 0.4 : 1 }}>+</button>
                </div>
              </div>

              {/* Commentaires */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: C.muted, margin: "0 0 12px" }}>
                  Commentaires {panelComments.length > 0 && `(${panelComments.length})`}
                </p>
                {panelLoading ? (
                  <div className="text-center py-4" style={{ fontSize: 11, color: C.muted }}>Chargement...</div>
                ) : (
                  <div className="flex flex-col gap-3 mb-3">
                    {panelComments.map((c) => {
                      const author = members.find((m) => m.user_id === c.user_id);
                      const isMe = c.user_id === userId;
                      return (
                        <div key={c.id} className="flex gap-2.5 group">
                          <div style={{ width: 28, height: 28, borderRadius: 9, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{author?.nom?.[0]?.toUpperCase() ?? "?"}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{author?.nom ?? "—"}</span>
                              <span style={{ fontSize: 11, color: C.muted }}>{fmtDate(c.created_at)}</span>
                            </div>
                            <div style={{ background: C.canvas, borderRadius: 11, padding: "8px 12px", fontSize: 13, color: C.ink }}>{c.content}</div>
                          </div>
                          {isMe && (
                            <button onClick={() => deleteComment(c.id)}
                              className="opacity-0 group-hover:opacity-100 transition-all self-start mt-4"
                              style={{ fontSize: 11, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>✕</button>
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
                    style={{ ...inp, flex: 1 }} />
                  <button onClick={addComment} disabled={!newComment.trim()}
                    style={{ ...btnInk, flexShrink: 0, opacity: !newComment.trim() ? 0.4 : 1 }}>Envoyer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Panel IA ────────────────────────────────────────────────────────── */}
      {showAIPanel && (
        <AIPanel
          projectId={projectId}
          projectTitre={projectTitre}
          onClose={() => setShowAIPanel(false)}
          onRoadmapGenerated={handleRoadmapGenerated}
          activeSprint={sprints.find(s => s.statut === "en_cours")}
          healthData={healthData ?? undefined}
        />
      )}

      {/* ── Modal Upload ────────────────────────────────────────────────────── */}
      {showFileModal && pendingFile && (
        <div className="fixed inset-0 flex items-end justify-center z-50 p-4" style={{ background: "rgba(26,33,56,0.35)" }}>
          <div className="w-full max-w-sm flex flex-col gap-4" style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 24 }}>
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>Partager un fichier</h2>
            <div className="flex items-center gap-3" style={{ background: C.canvas, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: "12px 16px" }}>
              <FileIcon t={pendingFile.type} size={22} />
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>{pendingFile.name}</p>
                <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{fileSize(pendingFile.size)}</p>
              </div>
            </div>
            <textarea placeholder="Description (optionnel)" value={fileDesc} onChange={(e) => setFileDesc(e.target.value)}
              rows={2} style={{ ...inp, resize: "none" }} />
            {sprints.length > 0 && (
              <select value={fileSprint} onChange={(e) => setFileSprint(e.target.value)} style={inp}>
                <option value="">— Aucun sprint —</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            )}
            {uploadError && (
              <p style={{ fontSize: 12, color: C.rose, background: C.surface, border: `1px solid ${C.rose}`, borderRadius: 11, padding: "8px 12px", margin: 0 }}>
                {uploadError}
              </p>
            )}
            <button onClick={uploadFile} disabled={uploading} style={{ ...btnInk, width: "100%", padding: "12px 0", opacity: uploading ? 0.6 : 1 }}>
              {uploading ? "Upload en cours..." : <><Upload size={13} strokeWidth={2} /> Envoyer</>}
            </button>
            <button onClick={() => { setShowFileModal(false); setPendingFile(null); setUploadError(null); }} style={{ ...btnGhost, width: "100%", padding: "12px 0" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Modal Sprint ────────────────────────────────────────────────────── */}
      {showSprintModal && (
        <div className="fixed inset-0 flex items-end justify-center z-50 p-4" style={{ background: "rgba(26,33,56,0.35)" }}>
          <div className="w-full max-w-sm flex flex-col gap-4" style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 24 }}>
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>Nouveau sprint</h2>
            <input placeholder="Nom (ex: Sprint 1 – Auth)" value={sprintNom} onChange={(e) => setSprintNom(e.target.value)} style={inp} />
            <input placeholder="Objectif (optionnel)" value={sprintObj} onChange={(e) => setSprintObj(e.target.value)} style={inp} />
            <div className="grid grid-cols-2 gap-3">
              <div><label style={lbl}>Début</label>
                <input type="date" value={sprintDebut} onChange={(e) => setSprintDebut(e.target.value)} style={{ ...inp, fontVariantNumeric: "tabular-nums" }} /></div>
              <div><label style={lbl}>Fin</label>
                <input type="date" value={sprintFin} onChange={(e) => setSprintFin(e.target.value)} style={{ ...inp, fontVariantNumeric: "tabular-nums" }} /></div>
            </div>
            <button onClick={createSprint} disabled={savingSprint || !sprintNom || !sprintDebut || !sprintFin}
              style={{ ...btnInk, width: "100%", padding: "12px 0", opacity: (savingSprint || !sprintNom || !sprintDebut || !sprintFin) ? 0.4 : 1 }}>
              {savingSprint ? "Création..." : "Créer le sprint"}
            </button>
            <button onClick={() => setShowSprintModal(false)} style={{ ...btnGhost, width: "100%", padding: "12px 0" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Modal Nouvelle tâche ────────────────────────────────────────────── */}
      {showTaskModal && (
        <div className="fixed inset-0 flex items-end justify-center z-50 p-4" style={{ background: "rgba(26,33,56,0.35)" }}>
          <div className="w-full max-w-sm flex flex-col gap-4 max-h-[90vh] overflow-y-auto" style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.hairline}`, padding: 24 }}>
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>Nouvelle tâche</h2>
            <input placeholder="Titre" value={taskTitre} onChange={(e) => setTaskTitre(e.target.value)} style={inp} />
            <textarea placeholder="Description (optionnel)" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={2} style={{ ...inp, resize: "none" }} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={lbl}>Priorité</label>
                <div className="flex gap-1">
                  {(["basse","normale","haute"] as Task["priorite"][]).map((p) => (
                    <button key={p} onClick={() => setTaskPrio(p)}
                      className="flex-1 capitalize"
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "8px 0", borderRadius: 9, cursor: "pointer",
                        background: taskPrio === p ? C.ink : C.surface,
                        color: taskPrio === p ? "#fff" : C.muted,
                        border: taskPrio === p ? `1px solid ${C.ink}` : `1px solid ${C.hairline}`,
                      }}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Échéance</label>
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} style={{ ...inp, fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
            {sprints.length > 0 && (
              <select value={taskSprint} onChange={(e) => setTaskSprint(e.target.value)} style={inp}>
                <option value="">— Sprint —</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            )}
            {members.length > 0 && (
              <select value={taskAssigne} onChange={(e) => setTaskAssigne(e.target.value)} style={inp}>
                <option value="">— Assigné à —</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom} ({m.role})</option>)}
              </select>
            )}
            <button onClick={handleCreateTask} disabled={savingTask || !taskTitre.trim()}
              style={{ ...btnInk, width: "100%", padding: "12px 0", opacity: (savingTask || !taskTitre.trim()) ? 0.4 : 1 }}>
              {savingTask ? "Création..." : "Créer la tâche"}
            </button>
            <button onClick={() => setShowTaskModal(false)} style={{ ...btnGhost, width: "100%", padding: "12px 0" }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Composants
// ══════════════════════════════════════════════════════════════════════════════

function KanbanCard({ task, members, sprints, showSprint, onOpen, onMove, onDelete }: {
  task: Task; members: Member[]; sprints: Sprint[]; showSprint: boolean; checklistCount: number;
  onOpen: () => void; onMove: (dir: "next"|"prev") => void; onDelete: () => void;
}) {
  const member = members.find((m) => m.user_id === task.assigne_a);
  const sprint = sprints.find((s) => s.id === task.sprint_id);
  const overdue = isOverdue(task.due_date) && task.statut !== "done";

  return (
    <div onClick={onOpen}
      className="transition-all group cursor-pointer"
      style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.35, margin: "0 0 8px" }}>{task.titre}</p>

      <div className="flex flex-wrap gap-1 mb-2">
        <span style={prioStyle(task.priorite)}>{task.priorite}</span>
        {showSprint && sprint && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.canvas, color: C.muted }}>{sprint.nom}</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {member && (
            <div style={{ width: 20, height: 20, borderRadius: 7, background: "#34C759", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{member.nom[0].toUpperCase()}</span>
            </div>
          )}
          {task.due_date && (
            <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? C.rose : C.muted, display: "inline-flex", alignItems: "center", gap: 3 }}>
              {overdue ? <AlertTriangle size={10} strokeWidth={2} /> : <Calendar size={10} strokeWidth={2} />} {fmtDate(task.due_date)}
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onMove("prev")} disabled={task.statut === "todo"}
            style={{ fontSize: 11, padding: "3px 7px", borderRadius: 6, background: C.canvas, color: C.muted, border: `1px solid ${C.hairline}`, cursor: "pointer", opacity: task.statut === "todo" ? 0.2 : 1 }}>←</button>
          <button onClick={() => onMove("next")} disabled={task.statut === "done"}
            style={{ fontSize: 11, padding: "3px 7px", borderRadius: 6, background: C.canvas, color: C.muted, border: `1px solid ${C.hairline}`, cursor: "pointer", opacity: task.statut === "done" ? 0.2 : 1 }}>→</button>
          <button onClick={onDelete}
            style={{ fontSize: 11, padding: "3px 7px", borderRadius: 6, background: C.canvas, color: C.rose, border: `1px solid ${C.hairline}`, cursor: "pointer" }}>✕</button>
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
    <div className="flex items-center gap-4 transition-all group" style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileIcon t={d.file_type} size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>{d.nom}</p>
        {d.description && <p className="line-clamp-1" style={{ fontSize: 11, color: C.muted, margin: "2px 0 0" }}>{d.description}</p>}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {uploader && <span style={{ fontSize: 11, color: C.muted }}>{uploader.nom}</span>}
          {d.file_size && <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{fileSize(d.file_size)}</span>}
          <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{fmtDate(d.created_at)}</span>
          {sprint && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.canvas, color: C.muted }}>{sprint.nom}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a href={d.file_url} target="_blank" rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.hairline}`, background: C.surface, color: C.ink }}>
          <Download size={14} strokeWidth={2} />
        </a>
        {canDelete && (
          <button onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-all"
            style={{ fontSize: 12, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>✕</button>
        )}
      </div>
    </div>
  );
}
