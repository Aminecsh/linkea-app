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

  const titre = (project as { titre: string }).titre;

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

  // Récupérer les admins
  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = (admins ?? []).map((a: { user_id: string }) => a.user_id);

  // Créer une conversation de groupe litige
  const { data: conv } = await supabase.from("conversations").insert({
    project_id: projectId,
    is_group: true,
    group_name: `⚠️ Litige — ${titre}`,
  }).select().maybeSingle();

  if (conv) {
    // Ajouter les participants : founder + dev + admins
    const participants = [
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: devUserId },
      ...adminIds.map((aid: string) => ({ conversation_id: conv.id, user_id: aid })),
    ];
    await supabase.from("conversation_participants").insert(participants);

    // Message initial automatique
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      sender_id: user.id,
      content: `⚠️ Un litige a été ouvert sur le projet "${titre}".\n\nMotif : ${reason}\n\nL'équipe Linkea va examiner la situation et vous recontacter ici.`,
    });
  }

  // Notifier le dev
  await supabase.from("notifications").insert({
    user_id: devUserId,
    type: "litige",
    title: "⚠️ Litige ouvert",
    body: `Un litige a été ouvert sur "${titre}". L'équipe Linkea va traiter le dossier.`,
    link: conv ? `/messages/${conv.id}` : "/wallet",
  });

  // Notifier les admins
  if (adminIds.length > 0) {
    await supabase.from("notifications").insert(
      adminIds.map((aid: string) => ({
        user_id: aid,
        type: "litige",
        title: "⚠️ Nouveau litige",
        body: `Litige sur "${titre}" — à traiter`,
        link: conv ? `/messages/${conv.id}` : "/admin",
      }))
    );
  }

  return NextResponse.json({ ok: true, dispute, conversationId: conv?.id });
}
