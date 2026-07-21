"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Lock, CreditCard, Check, Shield } from "lucide-react";

const COMMISSION = 0.10;

type Project = {
  id: string;
  titre: string;
  budget: number | null;
  statut: string;
  profiles_founder: { nom: string; user_id: string };
};

type Dev = {
  nom: string;
  user_id: string;
};

function formatCard(v: string) {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export default function PaiementPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [project,   setProject]   = useState<Project | null>(null);
  const [dev,       setDev]       = useState<Dev | null>(null);
  const [existing,  setExisting]  = useState<{ id: string; status: string } | null>(null);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [paying,    setPaying]    = useState(false);
  const [paid,      setPaid]      = useState(false);
  const [amount,    setAmount]    = useState("");
  const [cardNum,   setCardNum]   = useState("");
  const [expiry,    setExpiry]    = useState("");
  const [cvv,       setCvv]       = useState("");
  const [cardName,  setCardName]  = useState("");
  const [error,     setError]     = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "founder") { router.push("/"); return; }

      const { data: proj } = await supabase
        .from("projects")
        .select("id, titre, budget, statut, profiles_founder(nom, user_id)")
        .eq("id", id).maybeSingle();

      if (!proj) { router.push("/profil"); return; }
      const p = proj as unknown as Project;
      setProject(p);
      if (p.budget) setAmount(p.budget.toString());

      // Vérifier que le founder est propriétaire
      const fp = Array.isArray(p.profiles_founder) ? p.profiles_founder[0] : p.profiles_founder;
      if (fp?.user_id !== user.id) { router.push("/profil"); return; }

      // Récupérer le dev via la conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("profiles_developer(nom, user_id)")
        .eq("project_id", id).maybeSingle();
      if (conv) {
        const devData = Array.isArray((conv as any).profiles_developer) ? (conv as any).profiles_developer[0] : (conv as any).profiles_developer;
        setDev(devData ?? null);
      }

      // Paiement existant ?
      const { data: pay } = await supabase.from("payments").select("id, status").eq("project_id", id).maybeSingle();
      if (pay) setExisting(pay as { id: string; status: string });

      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handlePay() {
    if (!project || !userId || paying) return;
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError("Montant invalide."); return; }
    if (cardNum.replace(/\s/g, "").length < 16) { setError("Numéro de carte invalide."); return; }
    if (!expiry.includes("/") || expiry.length < 5) { setError("Date d'expiration invalide."); return; }
    if (cvv.length < 3) { setError("CVV invalide."); return; }
    if (!cardName.trim()) { setError("Nom du titulaire requis."); return; }

    setPaying(true);
    setError("");

    const devUserId = dev?.user_id ?? null;

    // TODO: Replace with Stripe paymentIntents.create()
    const { error: dbErr } = await supabase.from("payments").insert({
      project_id: id,
      founder_user_id: userId,
      dev_user_id: devUserId,
      amount: num,
      commission_rate: COMMISSION,
      status: "held",
      description: `Paiement — ${project.titre}`,
      paid_at: new Date().toISOString(),
    });

    if (dbErr) { setError("Erreur lors du paiement."); setPaying(false); return; }

    // Notifier le dev
    if (devUserId) {
      await supabase.from("notifications").insert({
        user_id: devUserId,
        type: "paiement",
        title: "💰 Paiement reçu",
        body: `${(num * (1 - COMMISSION)).toFixed(2)}€ en attente de déblocage pour "${project.titre}"`,
        link: `/wallet`,
      });
    }

    setPaid(true);
    setPaying(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="spinner" />
    </div>
  );

  if (!project) return null;

  const num = parseFloat(amount) || 0;
  const commission = +(num * COMMISSION).toFixed(2);
  const devReceives = +(num * (1 - COMMISSION)).toFixed(2);
  const alreadyPaid = existing?.status === "held" || existing?.status === "released";

  if (paid || alreadyPaid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-sm card p-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(16,185,129,0.12)" }}>
            <Check size={28} style={{ color: "#10b981" }} />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">
            {alreadyPaid && !paid ? "Paiement déjà effectué" : "Paiement sécurisé !"}
          </h2>
          <p className="text-sm text-slate-500 mb-1">
            <span className="font-bold text-slate-900">{num > 0 ? num : parseFloat(amount || "0")}€</span> sont bloqués chez Linkea.
          </p>
          <p className="text-xs text-slate-400 mb-6">
            Le dev recevra <strong>{devReceives > 0 ? devReceives : "—"}€</strong> à la livraison.
          </p>
          <button onClick={() => router.push(`/projets/${id}/gestion`)} className="btn-primary w-full">
            Voir la gestion du projet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="page-header px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-icon" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="label mb-0.5">Paiement sécurisé</p>
            <h1 className="text-lg font-black" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>{project.titre}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 flex flex-col gap-4">

        {/* Récapitulatif */}
        <div className="card p-5">
          <p className="label mb-3">Récapitulatif</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--muted)" }}>Montant total</span>
              <span className="font-bold" style={{ color: "var(--text)" }}>{num > 0 ? `${num}€` : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--muted)" }}>Commission Linkea (10%)</span>
              <span className="font-semibold" style={{ color: "var(--rose)" }}>−{num > 0 ? `${commission}€` : "—"}</span>
            </div>
            <div className="h-px my-1" style={{ background: "var(--border)" }} />
            <div className="flex justify-between text-sm">
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {dev ? `${dev.nom} recevra` : "Dev recevra"}
              </span>
              <span className="font-black text-base" style={{ color: "#10b981" }}>{num > 0 ? `${devReceives}€` : "—"}</span>
            </div>
          </div>
        </div>

        {/* Montant (si pas fixé) */}
        {!project.budget && (
          <div className="card p-5">
            <label className="label mb-1.5 block">Montant à payer (€)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "var(--muted)" }}>€</span>
              <input
                type="number" min="1" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field" style={{ paddingLeft: 28 }}
                placeholder="500"
              />
            </div>
          </div>
        )}

        {/* Formulaire carte */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={16} style={{ color: "var(--muted)" }} />
            <p className="label">Informations de paiement</p>
            <div className="ml-auto flex items-center gap-1">
              <Lock size={11} style={{ color: "#10b981" }} />
              <span className="text-xs font-semibold" style={{ color: "#10b981" }}>Sécurisé</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="label mb-1 block">Nom du titulaire</label>
              <input value={cardName} onChange={(e) => setCardName(e.target.value.toUpperCase())}
                placeholder="JEAN DUPONT" className="input-field" autoComplete="cc-name" />
            </div>

            <div>
              <label className="label mb-1 block">Numéro de carte</label>
              <div className="relative">
                <input
                  value={cardNum}
                  onChange={(e) => setCardNum(formatCard(e.target.value))}
                  placeholder="1234 5678 9012 3456"
                  className="input-field" inputMode="numeric" autoComplete="cc-number"
                  style={{ paddingRight: 48, letterSpacing: "0.05em" }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  <div className="w-6 h-4 rounded" style={{ background: "#1a1f71" }} />
                  <div className="w-6 h-4 rounded" style={{ background: "#eb001b", opacity: 0.85 }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label mb-1 block">Expiration</label>
                <input value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/AA" className="input-field" inputMode="numeric" autoComplete="cc-exp" maxLength={5} />
              </div>
              <div>
                <label className="label mb-1 block">CVV</label>
                <input value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="123" className="input-field" inputMode="numeric" autoComplete="cc-csc" maxLength={4}
                  type="password" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs font-semibold text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        {/* Sécurité */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
          <Shield size={14} style={{ color: "#10b981", flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs" style={{ color: "#065f46" }}>
            L'argent est <strong>bloqué chez Linkea</strong> et débloqué au dev uniquement à la livraison validée.
          </p>
        </div>

        <button
          onClick={handlePay}
          disabled={paying || num <= 0}
          className="btn-primary w-full disabled:opacity-50"
          style={{ padding: "14px 0", fontSize: 15 }}
        >
          {paying
            ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            : <><Lock size={15} /> Payer {num > 0 ? `${num}€` : ""} en sécurité</>}
        </button>
      </div>
    </div>
  );
}
