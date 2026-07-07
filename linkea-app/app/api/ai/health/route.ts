import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { aiHealthSchema, validationError } from "@/lib/validation";

export type HealthIndicator = {
  label: string;
  value: string;
  status: "good" | "warn" | "bad";
};

export type HealthData = {
  score: number;
  label: string;
  color: string;
  indicators: HealthIndicator[];
  recommendations: string[];
};

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const parsed = aiHealthSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const { projectId } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const [{ data: project }, { data: sprints }, { data: tasks }] = await Promise.all([
    supabase.from("projects").select("titre, deadline, statut, created_at").eq("id", projectId).maybeSingle(),
    supabase.from("sprints").select("id, statut, date_debut, date_fin").eq("project_id", projectId),
    supabase.from("tasks").select("id, statut, priorite, updated_at, due_date").eq("project_id", projectId),
  ]);

  if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

  const now = new Date();
  let score = 100;
  const indicators: HealthIndicator[] = [];
  const recommendations: string[] = [];

  // 1. Tâches terminées
  const totalTasks = tasks?.length ?? 0;
  const doneTasks = tasks?.filter(t => t.statut === "done").length ?? 0;
  if (totalTasks > 0) {
    const rate = (doneTasks / totalTasks) * 100;
    if (rate >= 70) {
      indicators.push({ label: "Avancement tâches", value: `${Math.round(rate)}%`, status: "good" });
    } else if (rate >= 35) {
      score -= 15;
      indicators.push({ label: "Avancement tâches", value: `${Math.round(rate)}%`, status: "warn" });
      recommendations.push("Relancer les tâches bloquées ou les redistribuer.");
    } else {
      score -= 30;
      indicators.push({ label: "Avancement tâches", value: `${Math.round(rate)}%`, status: "bad" });
      recommendations.push("Avancement faible — prioriser les tâches critiques immédiatement.");
    }
  } else {
    score -= 15;
    indicators.push({ label: "Tâches", value: "Aucune tâche créée", status: "warn" });
    recommendations.push("Créer des tâches et les répartir dans des sprints.");
  }

  // 2. Tâches en retard
  const overdue = tasks?.filter(t => t.due_date && new Date(t.due_date) < now && t.statut !== "done") ?? [];
  if (overdue.length > 0) {
    score -= Math.min(overdue.length * 8, 25);
    indicators.push({ label: "Tâches en retard", value: `${overdue.length}`, status: "bad" });
    recommendations.push(`Traiter les ${overdue.length} tâche(s) en retard en priorité.`);
  } else if (totalTasks > 0) {
    indicators.push({ label: "Tâches en retard", value: "Aucune", status: "good" });
  }

  // 3. Deadline projet
  if (project.deadline) {
    const deadline = new Date(project.deadline);
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
    const remaining = totalTasks - doneTasks;

    if (daysLeft < 0) {
      score -= 30;
      indicators.push({ label: "Deadline", value: `Dépassée (${Math.abs(daysLeft)}j)`, status: "bad" });
      recommendations.push("La deadline est dépassée — renegocier ou livrer au plus vite.");
    } else if (daysLeft <= 7 && remaining > 3) {
      score -= 20;
      indicators.push({ label: "Deadline", value: `${daysLeft}j · ${remaining} tâches restantes`, status: "bad" });
      recommendations.push("Deadline imminente avec trop de tâches restantes — couper le scope.");
    } else if (daysLeft <= 14) {
      score -= 5;
      indicators.push({ label: "Deadline", value: `${daysLeft}j restants`, status: "warn" });
    } else {
      indicators.push({ label: "Deadline", value: `${daysLeft}j restants`, status: "good" });
    }
  }

  // 4. Sprint actif
  const activeSprints = sprints?.filter(s => s.statut === "en_cours") ?? [];
  const allSprints = sprints ?? [];
  if (activeSprints.length > 0) {
    indicators.push({ label: "Sprint actif", value: "Oui", status: "good" });
  } else if (allSprints.length > 0) {
    score -= 10;
    indicators.push({ label: "Sprint actif", value: "Aucun sprint en cours", status: "warn" });
    recommendations.push("Démarrer un sprint pour structurer le travail en cours.");
  } else {
    score -= 20;
    indicators.push({ label: "Sprints", value: "Aucun sprint créé", status: "warn" });
    recommendations.push("Générer une roadmap IA et créer les premiers sprints.");
  }

  // 5. Activité récente (7 derniers jours)
  const recentTasks = tasks?.filter(t => {
    const ms = now.getTime() - new Date(t.updated_at).getTime();
    return ms < 7 * 86_400_000;
  }) ?? [];

  if (recentTasks.length > 0) {
    indicators.push({ label: "Activité (7j)", value: `${recentTasks.length} màj`, status: "good" });
  } else if (totalTasks > 0) {
    score -= 15;
    indicators.push({ label: "Activité (7j)", value: "Aucune mise à jour", status: "warn" });
    recommendations.push("Aucune activité cette semaine — faire un point d'équipe.");
  }

  score = Math.max(0, Math.min(100, score));

  let label: string;
  let color: string;
  if (score >= 80) { label = "Excellent"; color = "#10b981"; }
  else if (score >= 60) { label = "Bon"; color = "#059669"; }
  else if (score >= 40) { label = "Attention"; color = "#f59e0b"; }
  else { label = "Critique"; color = "#ef4444"; }

  return NextResponse.json({ score, label, color, indicators, recommendations } satisfies HealthData);
}
