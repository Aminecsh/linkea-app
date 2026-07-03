import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
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

  const { projectId, paymentId, devUserId, reason } = await req.json();
  if (!projectId || !paymentId || !reason) return NextResponse.json({ error: "Données manquantes" }, { status: 400 });

  // Vérifier que c'est bien le founder
  const { data: project } = await supabase
    .from("projects")
    .select("id, titre, profiles_founder(user_id)")
    .eq("id", projectId).maybeSingle();

  const fp = Array.isArray(project?.profiles_founder) ? project.profiles_founder[0] : project?.profiles_founder;
  if ((fp as { user_id: string } | null)?.user_id !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Passer le paiement en "disputed"
  await supabase.from("payments").update({ status: "disputed" }).eq("id", paymentId);

  // Créer le litige
  const { data: dispute } = await supabase.from("disputes").insert({
    project_id: projectId,
    payment_id: paymentId,
    founder_user_id: user.id,
    dev_user_id: devUserId,
    reason,
  }).select().maybeSingle();

  // Notifier le dev
  await supabase.from("notifications").insert({
    user_id: devUserId,
    type: "litige",
    title: "⚠️ Litige ouvert",
    body: `Un litige a été ouvert sur "${(project as { titre: string }).titre}". L'équipe Linkea va traiter le dossier.`,
    link: "/wallet",
  });

  // Notifier les admins
  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  if (admins && admins.length > 0) {
    await supabase.from("notifications").insert(
      admins.map((a: { user_id: string }) => ({
        user_id: a.user_id,
        type: "litige",
        title: "⚠️ Nouveau litige",
        body: `Litige sur "${(project as { titre: string }).titre}" — à traiter`,
        link: "/admin",
      }))
    );
  }

  return NextResponse.json({ ok: true, dispute });
}
