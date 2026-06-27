import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Clé API Anthropic manquante" }, { status: 500 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId manquant" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: project } = await supabase
    .from("projects")
    .select("titre, description, stack_souhaitee, deadline")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

  const prompt = `Génère une roadmap de sprints pour ce projet :

Titre : ${project.titre}
Description : ${project.description ?? "Non renseignée"}
Stack : ${project.stack_souhaitee ?? "Non renseignée"}
Deadline : ${project.deadline ?? "Non renseignée"}

Génère exactement 3 à 5 sprints. Réponds UNIQUEMENT en JSON valide avec ce format exact, sans texte avant ou après :

{
  "sprints": [
    {
      "nom": "Sprint 1 – Nom court",
      "objectif": "Objectif principal du sprint en une phrase",
      "duree_jours": 14,
      "taches": ["Tâche 1", "Tâche 2", "Tâche 3"]
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

    try {
      return NextResponse.json(JSON.parse(content.text.trim()));
    } catch {
      const match = content.text.match(/\{[\s\S]*\}/);
      if (match) {
        try { return NextResponse.json(JSON.parse(match[0])); } catch { /* fall through */ }
      }
      return NextResponse.json({ error: "Format invalide", raw: content.text }, { status: 500 });
    }
  } catch (e) {
    console.error("[AI Roadmap]", e);
    return NextResponse.json({ error: "Erreur API Claude : " + (e as Error).message }, { status: 500 });
  }
}
