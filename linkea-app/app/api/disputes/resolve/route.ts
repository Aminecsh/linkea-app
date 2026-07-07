import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { disputeResolveSchema, validationError } from "@/lib/validation";

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

  const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (roleData?.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  // decision: "dev" = libérer au dev | "founder" = rembourser le founder
  const parsed = disputeResolveSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed.error);
  const { disputeId, decision, adminNote } = parsed.data;

  const { data: dispute } = await supabase
    .from("disputes")
    .select("id, project_id, payment_id, founder_user_id, dev_user_id")
    .eq("id", disputeId).maybeSingle();

  if (!dispute) return NextResponse.json({ error: "Litige introuvable" }, { status: 404 });

  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount, dev_amount, status")
    .eq("id", dispute.payment_id).maybeSingle();

  if (!payment) return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });

  const { data: project } = await supabase.from("projects").select("titre").eq("id", dispute.project_id).maybeSingle();
  const titre = (project as { titre: string } | null)?.titre ?? "Projet";

  if (decision === "dev") {
    // Libérer le paiement au dev
    await supabase.from("payments").update({ status: "released", released_at: new Date().toISOString() }).eq("id", payment.id);

    // Créditer le wallet dev
    const { data: wallet } = await supabase.from("dev_wallets").select("id, balance, total_earned").eq("user_id", dispute.dev_user_id).maybeSingle();
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
        user_id: dispute.dev_user_id,
        balance: payment.dev_amount,
        total_earned: payment.dev_amount,
      }).select().maybeSingle();
      walletId = (created as { id: string }).id;
    }
    await supabase.from("wallet_transactions").insert({
      wallet_id: walletId,
      payment_id: payment.id,
      type: "credit",
      amount: payment.dev_amount,
      description: `Litige résolu — paiement débloqué — ${titre}`,
    });
    await supabase.from("notifications").insert([
      { user_id: dispute.dev_user_id, type: "litige", title: "✅ Litige résolu en ta faveur", body: `${payment.dev_amount.toFixed(2)}€ disponibles dans ton portefeuille.`, link: "/wallet" },
      { user_id: dispute.founder_user_id, type: "litige", title: "Litige résolu", body: `Le litige sur "${titre}" a été résolu par Linkea. Le paiement a été libéré au développeur.`, link: `/contrat` },
    ]);
  } else {
    // Rembourser le founder
    await supabase.from("payments").update({ status: "refunded", released_at: new Date().toISOString() }).eq("id", payment.id);
    await supabase.from("notifications").insert([
      { user_id: dispute.founder_user_id, type: "litige", title: "✅ Litige résolu — remboursement", body: `Le litige sur "${titre}" a été résolu. Tu seras remboursé de ${payment.amount.toFixed(2)}€.`, link: "/profil" },
      { user_id: dispute.dev_user_id, type: "litige", title: "Litige résolu", body: `Le litige sur "${titre}" a été résolu par Linkea en faveur du founder.`, link: "/wallet" },
    ]);
  }

  // Clore le litige
  await supabase.from("disputes").update({
    status: decision === "dev" ? "resolved_dev" : "resolved_founder",
    admin_note: adminNote ?? null,
    resolved_at: new Date().toISOString(),
  }).eq("id", disputeId);

  return NextResponse.json({ ok: true });
}
