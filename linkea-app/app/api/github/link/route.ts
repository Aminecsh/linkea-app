import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { uuid, githubRepoRegex, validationError } from "@/lib/validation";

const linkSchema = z.object({
  projectId: uuid,
  repo: z.string().trim().regex(githubRepoRegex, "Format attendu : owner/repo"),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const parsed = linkSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const { projectId, repo } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // Vérifie que l'appelant est bien le développeur assigné à ce projet
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, profiles_developer(user_id)")
    .eq("project_id", projectId)
    .maybeSingle();

  const devUserId = (conv?.profiles_developer as unknown as { user_id: string } | null)?.user_id;
  if (!devUserId || devUserId !== user.id) {
    return NextResponse.json({ error: "Seul le développeur assigné peut lier un repo." }, { status: 403 });
  }

  const { error } = await supabase.from("projects").update({ github_repo: repo }).eq("id", projectId);
  if (error) return NextResponse.json({ error: "Erreur lors de l'enregistrement." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
