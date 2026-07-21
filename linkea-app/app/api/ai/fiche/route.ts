import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkUsage, trackUsage, MONTHLY_TOKEN_LIMIT } from "@/lib/ai-usage";
import { aiFicheSchema, validationError } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Clé API Anthropic manquante" }, { status: 500 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { ok, used } = await checkUsage(supabase, user.id);
  if (!ok) {
    return NextResponse.json({
      error: `Limite mensuelle atteinte (${used.toLocaleString()} / ${MONTHLY_TOKEN_LIMIT.toLocaleString()} tokens). Reviens le mois prochain !`,
    }, { status: 429 });
  }

  const parsed = aiFicheSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const { idee, stack, deadline } = parsed.data;

  const prompt = `Tu es expert en rédaction de fiches projet pour une plateforme de freelancing tech.

À partir de cette idée de projet (parfois une simple description, parfois la transcription d'un entretien avec le porteur de projet) :
"${idee}"
${stack ? `Stack souhaitée : ${stack}` : ""}
${deadline ? `Deadline : ${deadline}` : ""}

Génère une fiche projet attractive et claire. Réponds UNIQUEMENT en JSON valide avec ce format exact :

{
  "titre": "Titre accrocheur du projet (max 60 caractères)",
  "description": "Description claire du projet en 3-4 phrases, sans markdown (pas de ** ni de listes).",
  "stack_souhaitee": "Liste COURTE de 2 à 4 technologies séparées par des virgules (ex: 'React, Node.js, PostgreSQL'). Si le texte contient une recommandation technique faite par Linkeo pendant la conversation, reprends exactement ces technologies. Sinon, déduis toi-même 2-3 technologies adaptées au type de projet décrit. Ne mets 'Au choix du développeur' qu'en tout dernier recours, si le projet est vraiment trop vague pour se prononcer. Ne mets JAMAIS une phrase complète ici, uniquement des noms de technologies.",
  "fonctionnalites_mvp": ["Fonctionnalité 1", "Fonctionnalité 2", "Fonctionnalité 3", "Fonctionnalité 4"],
  "profil_dev_ideal": "Description du profil développeur idéal pour ce projet, sans markdown",
  "budget_estime_eur": "Nombre entier en euros si un budget approximatif a été mentionné dans le texte, sinon null",
  "delai_semaines": "Nombre entier de semaines si un délai a été mentionné ou peut être déduit (ex: '2 mois' → 8), sinon null"
}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") return NextResponse.json({ error: "Réponse invalide" }, { status: 500 });

    const total = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    if (total > 0) await trackUsage(supabase, user.id, total);

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
    console.error("[AI Fiche]", e);
    return NextResponse.json({ error: "Erreur API Claude : " + (e as Error).message }, { status: 500 });
  }
}
