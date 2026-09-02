import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { startConversationSchema, validationError } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const parsed = startConversationSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const { projectId, developerId } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const limited = rateLimit(req, "create", user.id);
  if (!limited.ok) return limited.response;

  const { data: project } = await supabase
    .from("projects")
    .select("id, founder_id, profiles_founder(user_id)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

  const projectFounderUserId = (project.profiles_founder as unknown as { user_id: string } | null)?.user_id;
  const isFounder = projectFounderUserId === user.id;

  let targetDeveloperId: string;

  if (isFounder) {
    if (!developerId) return NextResponse.json({ error: "developerId requis" }, { status: 400 });
    // Le dev ciblé doit avoir candidaté sur ce projet
    const { data: cand } = await supabase
      .from("candidatures")
      .select("id").eq("project_id", projectId).eq("developer_id", developerId).maybeSingle();
    if (!cand) return NextResponse.json({ error: "Ce développeur n'a pas candidaté sur ce projet." }, { status: 403 });
    targetDeveloperId = developerId;
  } else {
    // Le dev ne peut démarrer une discussion que sur un projet où il a candidaté
    const { data: myDevProfile } = await supabase
      .from("profiles_developer").select("id").eq("user_id", user.id).maybeSingle();
    if (!myDevProfile) return NextResponse.json({ error: "Profil développeur introuvable" }, { status: 403 });

    const { data: cand } = await supabase
      .from("candidatures")
      .select("id").eq("project_id", projectId).eq("developer_id", myDevProfile.id).maybeSingle();
    if (!cand) return NextResponse.json({ error: "Tu dois avoir candidaté sur ce projet pour lancer la discussion." }, { status: 403 });
    targetDeveloperId = myDevProfile.id;
  }

  // Get-or-create (idempotent)
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .eq("developer_id", targetDeveloperId)
    .maybeSingle();

  if (existing) return NextResponse.json({ conversationId: existing.id });

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ project_id: projectId, founder_id: project.founder_id, developer_id: targetDeveloperId })
    .select("id")
    .maybeSingle();

  if (error || !created) return NextResponse.json({ error: "Erreur lors de la création de la conversation." }, { status: 500 });

  return NextResponse.json({ conversationId: created.id });
}
