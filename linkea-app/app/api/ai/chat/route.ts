import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkUsage, trackUsage, MONTHLY_TOKEN_LIMIT } from "@/lib/ai-usage";
import { aiChatSchema } from "@/lib/validation";

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
  const token = authHeader.slice(7);

  const parsed = aiChatSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Données invalides", details: parsed.error.issues.map((i) => i.message) }), { status: 400 });
  }
  const { messages, projectId } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  const { ok, used } = await checkUsage(supabase, user.id);
  if (!ok) {
    return new Response(JSON.stringify({
      error: `Limite mensuelle atteinte (${used.toLocaleString()} / ${MONTHLY_TOKEN_LIMIT.toLocaleString()} tokens). Reviens le mois prochain !`,
    }), { status: 429 });
  }

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

  const isIntake = !projectId;

  const intakeSystemPrompt = `Tu es Linkeo, l'assistant qui aide les porteurs de projet à déposer leur besoin sur Linkea, une plateforme qui met en relation des porteurs de projet avec des développeurs freelances.

La personne en face de toi n'y connaît souvent RIEN en informatique. Ton seul but : l'aider à exprimer son besoin par des questions simples, sans AUCUN jargon technique.

## RÈGLES DE LANGAGE (très important)
- N'utilise JAMAIS les mots "stack", "MVP", "roadmap", "sprint", "backlog", "scope", "feature"
- Remplace-les toujours par du langage courant : au lieu de "stack technique" dis "des outils ou technologies en particulier" ; au lieu de "MVP" dis "la version de départ, l'essentiel pour démarrer" ; au lieu de "feature" dis "fonctionnalité" ou "truc que ça doit faire"
- N'utilise JAMAIS de markdown : pas d'astérisques pour du gras (**texte**), pas de listes à puces avec des tirets, pas de titres avec #. Écris en phrases simples et naturelles, comme dans un message texte.
- Sois chaleureux, patient, jamais condescendant — comme si tu expliquais à un ami qui n'y connaît rien
- Pose UNE SEULE question à la fois (deux maximum), jamais une liste de questions d'un coup
- Donne un exemple concret dans ta question si ça peut aider la personne à répondre plus facilement

## CE QUE TU DOIS COMPRENDRE (dans cet ordre, sans lister ça à l'utilisateur)
1. Le problème résolu et pour qui (à qui ça sert)
2. Les 2-3 choses les plus importantes que le projet doit faire dès le départ
3. Le type concret de projet (site vitrine, appli mobile, boutique en ligne, plateforme avec comptes utilisateurs, etc.) — c'est TOI qui en déduis les technologies adaptées, ne demande JAMAIS "quelle stack veux-tu". Si la personne mentionne déjà une contrainte technique précise (ex: "ça doit marcher avec mon site Shopify"), prends-la en compte.
4. Budget approximatif et délai souhaité — optionnel aussi

## RECOMMANDATION TECHNIQUE (important)
Une fois que tu comprends bien le type de projet, propose TOI-MÊME 2-3 technologies adaptées, dans une phrase simple, en expliquant en une ligne pourquoi (ex: "Pour ton appli mobile, je partirais sur Flutter — ça permet de sortir une version iPhone et Android en même temps, donc moins cher et plus rapide" ou "Pour ton site avec des réservations, je te propose React et Node.js, des technologies solides et très utilisées par les développeurs freelances ici"). Ne demande jamais à la personne de choisir elle-même une technologie qu'elle ne connaît pas — c'est ton rôle de la conseiller. Préfère autant que possible des technologies parmi celles-ci, qui sont les plus demandées sur la plateforme : React, Next.js, Node.js, TypeScript, Vue.js, Flutter, Swift, Kotlin, Python, Laravel.

## QUAND TU AS ASSEZ D'INFOS
Dès que tu as compris les points 1 et 2, ET que tu as proposé ta recommandation technique (point 3) dans la conversation, termine ta réponse par cette ligne exacte, seule, sur sa propre ligne :
{"ready_for_fiche":true}
Ne mets cette ligne que quand tu es vraiment prêt — jamais dès le premier message.

## PREMIER MESSAGE
Si c'est le tout premier message de la conversation, présente-toi en une phrase et pose directement la première question (le problème résolu / pour qui), sans jargon et sans liste.`;

  const systemPrompt = isIntake ? intakeSystemPrompt : `Tu es Linkeo, un chef de projet expert avec 15 ans d'expérience dans la gestion de projets tech, SaaS et produits digitaux. Tu combines la rigueur des méthodes classiques (Waterfall, PMI) avec l'agilité des méthodes modernes (Scrum, Kanban, SAFe).

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
            model: isIntake ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
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
          // Track token usage after stream
          const final = await response.finalMessage();
          const total = (final.usage?.input_tokens ?? 0) + (final.usage?.output_tokens ?? 0);
          if (total > 0) await trackUsage(supabase, user.id, total);
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
