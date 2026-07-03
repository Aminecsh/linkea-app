"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft, Wallet, ArrowDownToLine, TrendingUp, Clock, CheckCircle, X, Lock } from "lucide-react";

type WalletData = {
  id: string;
  balance: number;
  total_earned: number;
  total_withdrawn: number;
};

type Transaction = {
  id: string;
  type: "credit" | "withdrawal";
  amount: number;
  description: string | null;
  created_at: string;
};

type Withdrawal = {
  id: string;
  amount: number;
  iban: string;
  account_name: string;
  status: string;
  created_at: string;
};

type PendingPayment = {
  id: string;
  dev_amount: number;
  created_at: string;
  projects: { titre: string } | null;
};

function maskIban(iban: string) {
  if (iban.length < 8) return iban;
  return iban.slice(0, 4) + " •••• •••• " + iban.slice(-4);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function WalletPage() {
  const router = useRouter();
  const [wallet,          setWallet]          = useState<WalletData | null>(null);
  const [transactions,    setTransactions]    = useState<Transaction[]>([]);
  const [withdrawals,     setWithdrawals]     = useState<Withdrawal[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmt,  setWithdrawAmt]  = useState("");
  const [iban,         setIban]         = useState("");
  const [accountName,  setAccountName]  = useState("");
  const [withdrawing,  setWithdrawing]  = useState(false);
  const [withdrawDone, setWithdrawDone] = useState(false);
  const [error,        setError]        = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "developer") { router.push("/profil"); return; }

      // Wallet (créer si inexistant)
      let { data: w } = await supabase.from("dev_wallets").select("*").eq("user_id", user.id).maybeSingle();
      if (!w) {
        const { data: created } = await supabase.from("dev_wallets").insert({ user_id: user.id }).select().maybeSingle();
        w = created;
      }
      setWallet(w as WalletData | null);

      if (w) {
        const [{ data: txs }, { data: wds }, { data: pending }] = await Promise.all([
          supabase.from("wallet_transactions").select("*").eq("wallet_id", w.id).order("created_at", { ascending: false }),
          supabase.from("withdrawals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("payments").select("id, dev_amount, created_at, projects(titre)").eq("dev_user_id", user.id).eq("status", "held").order("created_at", { ascending: false }),
        ]);
        setTransactions((txs as Transaction[]) ?? []);
        setWithdrawals((wds as Withdrawal[]) ?? []);
        setPendingPayments((pending as unknown as PendingPayment[]) ?? []);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleWithdraw() {
    if (!wallet || withdrawing) return;
    const amt = parseFloat(withdrawAmt);
    if (!amt || amt <= 0) { setError("Montant invalide."); return; }
    if (amt > wallet.balance) { setError("Solde insuffisant."); return; }
    if (!iban.trim() || iban.replace(/\s/g, "").length < 15) { setError("IBAN invalide."); return; }
    if (!accountName.trim()) { setError("Nom du titulaire requis."); return; }

    setWithdrawing(true);
    setError("");

    // TODO: Replace with real bank transfer via Stripe Connect / Mangopay
    const { data: wd, error: wdErr } = await supabase.from("withdrawals").insert({
      user_id: (await supabase.auth.getUser()).data.user?.id,
      wallet_id: wallet.id,
      amount: amt,
      iban: iban.replace(/\s/g, "").toUpperCase(),
      account_name: accountName.trim(),
      status: "pending",
    }).select().maybeSingle();

    if (wdErr) { setError("Erreur lors de la demande."); setWithdrawing(false); return; }

    // Déduire du solde
    await supabase.from("dev_wallets").update({
      balance: wallet.balance - amt,
      total_withdrawn: wallet.total_withdrawn + amt,
      updated_at: new Date().toISOString(),
    }).eq("id", wallet.id);

    // Transaction
    await supabase.from("wallet_transactions").insert({
      wallet_id: wallet.id,
      type: "withdrawal",
      amount: amt,
      description: `Virement vers ${maskIban(iban)}`,
    });

    setWallet((prev) => prev ? { ...prev, balance: prev.balance - amt, total_withdrawn: prev.total_withdrawn + amt } : prev);
    if (wd) setWithdrawals((prev) => [wd as Withdrawal, ...prev]);
    setWithdrawDone(true);
    setWithdrawing(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div className="min-h-screen pb-nav" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="page-header px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button onClick={() => router.push("/profil")} className="btn-icon" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="label mb-0.5">Linkea</p>
            <h1 className="text-xl font-black" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>Mon portefeuille</h1>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 flex flex-col gap-4">

        {/* Solde principal */}
        <div className="rounded-3xl p-6 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a78bfa 100%)" }}>
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="absolute -right-2 bottom-4 w-24 h-24 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={16} style={{ opacity: 0.8 }} />
              <span className="text-sm font-semibold" style={{ opacity: 0.8 }}>Solde disponible</span>
            </div>
            <p className="text-4xl font-black mb-1">{(wallet?.balance ?? 0).toFixed(2)}€</p>
            <p className="text-sm" style={{ opacity: 0.7 }}>Prêt à virer sur votre IBAN</p>

            <div className="flex gap-4 mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
              <div>
                <p className="text-xs font-semibold" style={{ opacity: 0.7 }}>Total gagné</p>
                <p className="text-base font-black">{(wallet?.total_earned ?? 0).toFixed(2)}€</p>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.15)" }} />
              <div>
                <p className="text-xs font-semibold" style={{ opacity: 0.7 }}>Retiré</p>
                <p className="text-base font-black">{(wallet?.total_withdrawn ?? 0).toFixed(2)}€</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bouton retirer */}
        <button
          onClick={() => { setShowWithdraw(true); setWithdrawDone(false); setError(""); }}
          disabled={(wallet?.balance ?? 0) <= 0}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-opacity"
          style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
        >
          <ArrowDownToLine size={16} /> Retirer vers mon IBAN
        </button>

        {/* Paiements en attente */}
        {pendingPayments.length > 0 && (
          <div>
            <p className="label mb-2 mt-2">Paiements en attente</p>
            <div className="flex flex-col gap-2">
              {pendingPayments.map((p) => (
                <div key={p.id} className="card px-4 py-3.5 flex items-center gap-3"
                  style={{ border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.04)" }}>
                  <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(245,158,11,0.12)" }}>
                    <Lock size={15} style={{ color: "#f59e0b" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                      {p.projects?.titre ?? "Projet"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      En attente · sera débloqué à la livraison
                    </p>
                  </div>
                  <p className="text-sm font-black shrink-0" style={{ color: "#f59e0b" }}>
                    +{p.dev_amount.toFixed(2)}€
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <div>
            <p className="label mb-2 mt-2">Historique</p>
            <div className="flex flex-col gap-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="card px-4 py-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: tx.type === "credit" ? "rgba(16,185,129,0.10)" : "rgba(99,102,241,0.10)" }}>
                    {tx.type === "credit"
                      ? <TrendingUp size={16} style={{ color: "#10b981" }} />
                      : <ArrowDownToLine size={16} style={{ color: "#6366f1" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                      {tx.description ?? (tx.type === "credit" ? "Paiement reçu" : "Virement")}
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{formatDate(tx.created_at)}</p>
                  </div>
                  <p className="text-sm font-black shrink-0"
                    style={{ color: tx.type === "credit" ? "#10b981" : "#6366f1" }}>
                    {tx.type === "credit" ? "+" : "−"}{tx.amount.toFixed(2)}€
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Virements en cours */}
        {withdrawals.some((w) => w.status === "pending") && (
          <div>
            <p className="label mb-2">Virements en cours</p>
            <div className="flex flex-col gap-2">
              {withdrawals.filter((w) => w.status === "pending").map((wd) => (
                <div key={wd.id} className="card px-4 py-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(245,158,11,0.10)" }}>
                    <Clock size={15} style={{ color: "#f59e0b" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Virement {wd.amount.toFixed(2)}€</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{maskIban(wd.iban)} · {formatDate(wd.created_at)}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: "rgba(245,158,11,0.10)", color: "#f59e0b" }}>
                    En cours
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {transactions.length === 0 && withdrawals.length === 0 && pendingPayments.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "rgba(99,102,241,0.08)" }}>
              <Wallet size={24} style={{ color: "#6366f1" }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Aucune transaction</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Ton solde s'alimentera à la livraison de chaque projet.
            </p>
          </div>
        )}
      </div>

      <BottomNav />

      {/* Modal retrait */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6"
          onClick={() => setShowWithdraw(false)}>
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}>

            {withdrawDone ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                  style={{ background: "rgba(99,102,241,0.10)" }}>
                  <CheckCircle size={28} style={{ color: "#6366f1" }} />
                </div>
                <p className="font-bold text-slate-900 mb-1">Demande envoyée !</p>
                <p className="text-sm text-slate-500 mb-4">
                  Ton virement de <strong>{withdrawAmt}€</strong> sera traité sous 1-3 jours ouvrés.
                </p>
                <button onClick={() => setShowWithdraw(false)} className="btn-primary w-full">Fermer</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900">Retirer des fonds</p>
                  <button onClick={() => setShowWithdraw(false)}
                    className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                    <X size={15} style={{ color: "#64748b" }} />
                  </button>
                </div>

                <div className="px-3 py-2.5 rounded-xl text-xs font-semibold text-center"
                  style={{ background: "rgba(99,102,241,0.08)", color: "#6366f1" }}>
                  Solde disponible : <strong>{(wallet?.balance ?? 0).toFixed(2)}€</strong>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Montant (€)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">€</span>
                    <input type="number" min="1" max={wallet?.balance ?? 0}
                      value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors"
                      style={{ paddingLeft: 28, paddingRight: 12 }}
                      placeholder="100" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Nom du titulaire du compte</label>
                  <input value={accountName} onChange={(e) => setAccountName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors"
                    placeholder="Jean Dupont" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">IBAN</label>
                  <input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors font-mono"
                    placeholder="FR76 3000 6000 0112 3456 7890 189" />
                </div>

                {error && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
                )}

                <button onClick={handleWithdraw} disabled={withdrawing}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                  {withdrawing
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <><ArrowDownToLine size={15} /> Demander le virement</>}
                </button>

                <p className="text-xs text-center text-slate-400">
                  Traitement sous 1-3 jours ouvrés · Sans frais supplémentaires
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
