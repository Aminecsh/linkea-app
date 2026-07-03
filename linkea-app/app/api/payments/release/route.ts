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

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId manquant" }, { status: 400 });

  // Vérifier que l'user est founder du projet
  const { data: project } = await supabase
    .from("projects")
    .select("id, titre, profiles_founder(user_id)")
    .eq("id", projectId).maybeSingle();

  if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  const fp = Array.isArray(project.profiles_founder) ? project.profiles_founder[0] : project.profiles_founder;
  if ((fp as { user_id: string } | null)?.user_id !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Récupérer le paiement en attente
  const { data: payment } = await supabase
    .from("payments")
    .select("id, dev_user_id, dev_amount, status")
    .eq("project_id", projectId)
    .eq("status", "held")
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Aucun paiement en attente" }, { status: 404 });
  if (!payment.dev_user_id) return NextResponse.json({ error: "Dev introuvable" }, { status: 400 });

  // TODO: Replace with Stripe Connect transfer
  // await stripe.transfers.create({ amount: payment.dev_amount * 100, currency: "eur", destination: devStripeAccountId });

  // Mettre à jour le statut du paiement
  await supabase.from("payments").update({
    status: "released",
    released_at: new Date().toISOString(),
  }).eq("id", payment.id);

  // Créditer le wallet du dev (upsert)
  const { data: wallet } = await supabase
    .from("dev_wallets")
    .select("id, balance, total_earned")
    .eq("user_id", payment.dev_user_id)
    .maybeSingle();

  let walletId: string;
  if (wallet) {
    await supabase.from("dev_wallets").update({
      balance: (wallet.balance ?? 0) + payment.dev_amount,
      total_earned: (wallet.total_earned ?? 0) + payment.dev_amount,
      updated_at: new Date().toISOString(),
    }).eq("id", wallet.id);
    walletId = wallet.id;
  } else {
    const { data: created } = await supabase.from("dev_wallets").insert({
      user_id: payment.dev_user_id,
      balance: payment.dev_amount,
      total_earned: payment.dev_amount,
    }).select().maybeSingle();
    walletId = (created as { id: string }).id;
  }

  // Enregistrer la transaction
  await supabase.from("wallet_transactions").insert({
    wallet_id: walletId,
    payment_id: payment.id,
    type: "credit",
    amount: payment.dev_amount,
    description: `Paiement débloqué — ${(project as { titre: string }).titre}`,
  });

  // Notifier le dev
  await supabase.from("notifications").insert({
    user_id: payment.dev_user_id,
    type: "paiement",
    title: "💸 Paiement débloqué !",
    body: `${payment.dev_amount.toFixed(2)}€ disponibles dans ton portefeuille`,
    link: "/wallet",
  });

  return NextResponse.json({ ok: true, dev_amount: payment.dev_amount });
}
