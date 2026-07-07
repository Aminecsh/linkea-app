import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkUsage, trackUsage } from "@/lib/ai-usage";
import { aiMatchingSchema, validationError } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { usage } = await checkUsage(supabase, user.id).then((r) => ({ usage: r }));
  if (!usage.ok) {
    return NextResponse.json({
      error: `Limite mensuelle atteinte (${usage.used.toLocaleString()} / 100 000 tokens). Reviens le mois prochain !`,
    }, { status: 429 });
  }

  const parsed = aiMatchingSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const { projectId, devs } = parsed.data;

  const { data: project } = await supabase
    .from("projects")
    .select("titre, description, stack_souhaitee, deadline")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

  // On limite à 15 devs pour contrôler le coût
  const devsToScore = devs.slice(0, 15);

  const devsDesc = devsToScore.map((d, i) =>
    `Dev ${i + 1} (id: ${d.id}) :
- Nom : ${d.nom}
- Compétences : ${(d.competences ?? []).join(", ") || "Non renseignées"}
- École : ${d.ecole ?? "Non renseignée"}
- Disponibilité : ${d.dispo_heures_semaine ?? "?"}h/semaine
- Note : ${d.score !== undefined ? `${d.score}/5 (${d.reviewCount} avis)` : "Nouveau (pas encore noté)"}`
  ).join("\n\n");

  const prompt = `Tu es un expert en matching entre projets tech et développeurs freelances.

PROJET À POURVOIR :
- Titre : ${project.titre}
- Description : ${project.description ?? "Non renseignée"}
- Stack souhaitée : ${project.stack_souhaitee ?? "Non renseignée"}
- Deadline : ${project.deadline ?? "Non renseignée"}

DÉVELOPPEURS DISPONIBLES :
${devsDesc}

Pour chaque développeur, attribue un score de compatibilité de 0 à 100 basé sur :
- Adéquation des compétences avec la stack du projet (50%)
- Disponibilité suffisante pour la deadline (20%)
- Note et expérience (avis clients) (20%)
- Formation et profil global (10%)

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{
  "scores": [
    {
      "devId": "id-exact-du-dev",
      "score": 85,
      "reason": "Phrase courte expliquant le score principal",
      "strengths": ["Point fort 1", "Point fort 2"],
      "concern": "Un seul point à surveiller ou null"
    }
  ]
}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") return NextResponse.json({ error: "Réponse invalide" }, { status: 500 });

    // Track token usage
    const totalTokens = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    await trackUsage(supabase, user.id, totalTokens);

    try {
      return NextResponse.json(JSON.parse(content.text.trim()));
    } catch {
      const match = content.text.match(/\{[\s\S]*\}/);
      if (match) return NextResponse.json(JSON.parse(match[0]));
      return NextResponse.json({ error: "Format invalide" }, { status: 500 });
    }
  } catch (e) {
    console.error("[AI Matching]", e);
    return NextResponse.json({ error: "Erreur Claude : " + (e as Error).message }, { status: 500 });
  }
}
