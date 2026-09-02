import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache, revalidateTag } from "next/cache";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const userIdSchema = z.string().uuid();

// Profil public d'un développeur : identique pour tous les visiteurs, changent rarement
// → cache 5 min, invalidé à la demande via POST (revalidateTag) quand le dev enregistre son profil.
function getCachedDevProfile(userId: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from("profiles_developer")
        .select("id, user_id, nom, ecole, bio, competences, dispo_heures_semaine, github, linkedin, avatar_url, experiences, formation")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    ["dev-profile", userId],
    { revalidate: 300, tags: [`profile-${userId}`] }
  )();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return NextResponse.json({ error: "userId invalide" }, { status: 400 });

  const profile = await getCachedDevProfile(userId);
  if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" } }
  );
}

// Invalidation à la demande : appelé juste après l'enregistrement du profil.
export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return NextResponse.json({ error: "userId invalide" }, { status: 400 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
  if (!user || user.id !== userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  // Appelé depuis une Route Handler (pas une Server Action) → expiration immédiate
  // plutôt que profile="max" (stale-while-revalidate), pour que le dev voie tout de
  // suite son profil à jour après avoir enregistré.
  revalidateTag(`profile-${userId}`, { expire: 0 });
  return NextResponse.json({ ok: true });
}
