import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const accessToken = authHeader.slice(7);

  // Client avec le token de l'utilisateur pour identifier qui fait la demande
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Session invalide" }, { status: 401 });
  }

  // Client admin avec service role key pour supprimer l'utilisateur
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Service role key manquante — configure SUPABASE_SERVICE_ROLE_KEY dans .env.local" }, { status: 500 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Supprimer les données liées (les cascades Supabase gèrent le reste via FK)
  await Promise.allSettled([
    supabaseAdmin.from("notifications").delete().eq("user_id", user.id),
    supabaseAdmin.from("bans").delete().eq("user_id", user.id),
    supabaseAdmin.from("reports").delete().eq("reporter_id", user.id),
    supabaseAdmin.from("support_conversations").delete().eq("user_id", user.id),
  ]);

  // Supprimer le profil
  await Promise.allSettled([
    supabaseAdmin.from("profiles_founder").delete().eq("user_id", user.id),
    supabaseAdmin.from("profiles_developer").delete().eq("user_id", user.id),
    supabaseAdmin.from("user_roles").delete().eq("user_id", user.id),
  ]);

  // Supprimer l'utilisateur Auth
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
