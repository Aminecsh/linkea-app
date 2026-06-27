import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { trackUsage } from "@/lib/ai-usage";

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

  const { idee, stack, deadline } = await req.json();
  if (!idee) return NextResponse.json({ error: "Idée manquante" }, { status: 400 });

  const prompt = `Tu es expert en rédaction de fiches projet pour une plateforme de freelancing tech.

À partir de cette idée de projet :
"${idee}"
${stack ? `Stack souhaitée : ${stack}` : ""}
${deadline ? `Deadline : ${deadline}` : ""}

Génère une fiche projet attractive et claire. Réponds UNIQUEMENT en JSON valide avec ce format exact :

{
  "titre": "Titre accrocheur du projet (max 60 caractères)",
  "description": "Description claire du projet en 3-4 phrases.",
  "stack_souhaitee": "Stack technique recommandée (ex: React, Node.js, PostgreSQL)",
  "fonctionnalites_mvp": ["Fonctionnalité 1", "Fonctionnalité 2", "Fonctionnalité 3", "Fonctionnalité 4"],
  "profil_dev_ideal": "Description du profil développeur idéal pour ce projet"
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

    if (user) {
      const total = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      if (total > 0) await trackUsage(supabase, user.id, total);
    }

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
