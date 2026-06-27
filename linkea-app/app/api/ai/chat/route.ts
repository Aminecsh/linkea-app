import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STATUT_LABELS: Record<string, string> = {
  a_venir: "À venir", en_cours: "En cours", termine: "Terminé",
  todo: "À faire", review: "En review", done: "Terminé",
};
const PRIO_LABELS: Record<string, string> = { haute: "🔴 Haute", normale: "🟡 Normale", basse: "🟢 Basse" };

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Clé API Anthropic manquante" }), { status: 500 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  }

  const { messages, projectId } = await req.json();
  if (!messages?.length) return new Response(JSON.stringify({ error: "Messages manquants" }), { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let projectContext = "";
  if (projectId) {
    const [{ data: project }, { data: sprints }, { data: tasks }] = await Promise.all([
      supabase.from("projects").select("titre, description, stack_souhaitee, deadline, statut").eq("id", projectId).maybeSingle(),
      supabase.from("sprints").select("id, nom, objectif, statut, date_debut, date_fin").eq("project_id", projectId).order("date_debut"),
      supabase.from("tasks").select("titre, statut, priorite, sprint_id, due_date").eq("project_id", projectId).order("created_at"),
    ]);

    if (project) {
      projectContext += `
Projet : ${project.titre}
Description : ${project.description ?? "Non renseignée"}
Stack souhaitée : ${project.stack_souhaitee ?? "Non renseignée"}
Deadline : ${project.deadline ?? "Non renseignée"}
Statut : ${project.statut}`;
    }

    if (sprints?.length) {
      const sprintList = sprints.map(s => {
        const sprintTasks = (tasks ?? []).filter(t => t.sprint_id === s.id);
        const done = sprintTasks.filter(t => t.statut === "done").length;
        const total = sprintTasks.length;
        return `  • [${STATUT_LABELS[s.statut] ?? s.statut}] ${s.nom}${s.objectif ? ` — ${s.objectif}` : ""}${total ? ` (${done}/${total} tâches terminées)` : ""} | ${s.date_debut} → ${s.date_fin}`;
      }).join("\n");
      projectContext += `\n\nSprints (${sprints.length}) :\n${sprintList}`;
    }

    if (tasks?.length) {
      const now = new Date();
      const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.statut !== "done");
      const inProgress = tasks.filter(t => t.statut === "en_cours");
      const todo = tasks.filter(t => t.statut === "todo");
      const done = tasks.filter(t => t.statut === "done");

      projectContext += `\n\nRésumé des tâches (${tasks.length} total) :
  • À faire : ${todo.length} | En cours : ${inProgress.length} | Terminées : ${done.length}`;

      if (overdue.length) {
        projectContext += `\n  ⚠️ ${overdue.length} tâche(s) en retard : ${overdue.map(t => `"${t.titre}"`).join(", ")}`;
      }

      if (inProgress.length) {
        projectContext += `\n\nTâches en cours :\n${inProgress.map(t => `  • ${PRIO_LABELS[t.priorite] ?? ""} ${t.titre}`).join("\n")}`;
      }

      const highPrioTodo = todo.filter(t => t.priorite === "haute");
      if (highPrioTodo.length) {
        projectContext += `\n\nTâches haute priorité à faire :\n${highPrioTodo.map(t => `  • ${t.titre}`).join("\n")}`;
      }
    }
  }

  const systemPrompt = `Tu es Linkeo, un chef de projet expert avec 15 ans d'expérience dans la gestion de projets tech, SaaS et produits digitaux. Tu combines la rigueur des méthodes classiques (Waterfall, PMI) avec l'agilité des méthodes modernes (Scrum, Kanban, SAFe).

## PERSONNALITÉ & SOFT SKILLS
- Proactif : tu proposes sans attendre qu'on te demande
- Direct et solution-oriented : face à un problème, tu proposes toujours au moins une solution concrète
- Calme sous pression : tu ne paniques jamais, tu analyses et tu agis
- Bienveillant mais exigeant : tu pousses à livrer de la qualité sans valider des plans irréalistes
- Adaptable : tu ajustes ton langage selon l'interlocuteur (technique avec les devs, vulgarisé avec les clients)

## PLANIFICATION & ORGANISATION
- Décompose n'importe quel projet en tâches claires avec priorités, deadlines et responsables
- Crée des plans d'action structurés : qui fait quoi, pour quand
- Identifie les dépendances entre tâches (ex: tâche B bloquée par tâche A)
- Génère des roadmaps réalistes, des sprints et des backlogs complets
- Priorise avec le framework MoSCoW (Must/Should/Could/Won't)

## GESTION DES RISQUES
- Anticipe les problèmes avant qu'ils arrivent
- Propose systématiquement un plan B pour chaque risque identifié
- Alerte immédiatement si un délai, un budget ou une ressource est en danger
- Ne valide jamais un plan irréaliste pour faire plaisir — tu dis la vérité

## COMMUNICATION
- Reformule toujours les objectifs pour confirmer que tout le monde est aligné
- Adapte le niveau de détail : technique avec les devs, synthétique avec les founders
- Pose les bonnes questions avant d'agir — jamais d'hypothèses non vérifiées

## FORMAT DE TES RÉPONSES
- Structure toujours tes réponses avec des titres et listes claires
- Pour les tâches : [PRIORITÉ] Nom — Responsable — Deadline — Statut
- Pour les risques : ⚠️ RISQUE : description → Impact → Plan B
- Pour les jalons : 🎯 JALON : objectif — Date cible
- Pour les dépendances : 🔗 DÉPENDANCE : Tâche A doit être finie avant Tâche B
- Termine toujours par : "👉 Prochaine étape recommandée : ..."

## SUGGESTIONS DE SUIVI
À la toute fin de chaque réponse, ajoute TOUJOURS un bloc JSON sur une seule ligne avec 2-3 suggestions de questions de suivi pertinentes, dans ce format exact (après un saut de ligne) :
{"suggestions":["Question de suivi 1 ?","Question de suivi 2 ?","Question de suivi 3 ?"]}

## RÈGLES ABSOLUES
- Tu ne fais jamais d'hypothèses sans demander confirmation
- Tu ne donnes pas de délais sans connaître les ressources disponibles
- Tu proposes toujours une prochaine action concrète
- Quand tu parles de tâches ou sprints, utilise les données réelles du projet ci-dessous

## CONTEXTE PLATEFORME
Tu opères sur Linkea, une plateforme qui met en relation des founders de startups avec des développeurs freelances.
${projectContext ? `\n## ÉTAT ACTUEL DU PROJET\n${projectContext}` : ""}

## MÉTHODE PAR DÉFAUT
Agile/Scrum avec sprints de 1-2 semaines, sauf si le founder précise une autre préférence.`;

  try {
    const anthropic = new Anthropic({ apiKey });

    const stream = new ReadableStream({
      async start(controller) {
        const encode = (s: string) => new TextEncoder().encode(s);
        try {
          const response = await anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 1500,
            system: systemPrompt,
            messages: messages.map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          });

          for await (const chunk of response) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              controller.enqueue(encode(`data: ${JSON.stringify({ token: chunk.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encode("data: [DONE]\n\n"));
        } catch (e) {
          controller.enqueue(encode(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("[AI Chat]", e);
    return new Response(JSON.stringify({ error: "Erreur API Claude : " + (e as Error).message }), { status: 500 });
  }
}
