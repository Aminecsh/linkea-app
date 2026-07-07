"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateMatchPdf } from "@/lib/generateMatchPdf";
import { ArrowLeft, Download, PenLine, CheckCircle2, Clock, AlertCircle, CreditCard, ShieldAlert } from "lucide-react";

type ContractData = {
  projet: { id: string; titre: string; description?: string; stack_souhaitee?: string; deadline?: string };
  founder: { nom: string; ecole?: string };
  dev: { nom: string; ecole?: string; competences?: string[]; dispo_heures_semaine?: number; github?: string };
  matchDate: string;
};

type Contract = {
  id: string; project_id: string; founder_id: string; developer_id: string;
  data: ContractData;
  founder_signed_at: string | null; founder_signed_name: string | null;
  dev_signed_at: string | null;    dev_signed_name: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  status: string;
  amount: number;
  dev_amount: number;
  dev_user_id: string | null;
};

type Dispute = {
  id: string;
  status: string;
  reason: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function fmtFull(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ContratPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [role, setRole]         = useState<string | null>(null);
  const [userId, setUserId]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [signing, setSigning]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [payment, setPayment]         = useState<Payment | null>(null);
  const [dispute, setDispute]         = useState<Dispute | null>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason]       = useState("");
  const [openingDispute, setOpeningDispute]      = useState(false);
  const [disputeError, setDisputeError]          = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);
      const { data: c } = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
      if (!c) { router.push("/profil"); return; }
      setContract(c as Contract);

      // Charger le paiement associé au projet
      const { data: pay } = await supabase
        .from("payments")
        .select("id, status, amount, dev_amount, dev_user_id")
        .eq("project_id", (c as Contract).project_id)
        .maybeSingle();
      if (pay) {
        setPayment(pay as Payment);
        // Charger un éventuel litige
        const { data: disp } = await supabase
          .from("disputes")
          .select("id, status, reason")
          .eq("payment_id", pay.id)
          .maybeSingle();
        if (disp) setDispute(disp as Dispute);
      }

      setLoading(false);
    }
    load();
  }, [id, router]);

  async function openDispute() {
    if (!payment || !contract || !disputeReason.trim() || openingDispute) return;
    setOpeningDispute(true);
    setDisputeError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setOpeningDispute(false); return; }
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        projectId: contract.project_id,
        paymentId: payment.id,
        devUserId: payment.dev_user_id,
        reason: disputeReason.trim(),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setDispute(data.dispute ?? { id: "", status: "open", reason: disputeReason.trim() });
      setPayment((prev) => prev ? { ...prev, status: "disputed" } : prev);
      setShowDisputeModal(false);
      setDisputeReason("");
      router.push("/messages");
    } else {
      const data = await res.json().catch(() => null);
      setDisputeError(data?.details?.[0] ?? data?.error ?? "Impossible d'ouvrir le litige.");
    }
    setOpeningDispute(false);
  }

  async function handleSign() {
    if (!contract || !userId || signing) return;
    setSigning(true);
    const now = new Date().toISOString();
    const isFounder = role === "founder";
    const signedName = isFounder ? contract.data.founder.nom : contract.data.dev.nom;
    const update = isFounder
      ? { founder_signed_at: now, founder_signed_name: signedName }
      : { dev_signed_at: now, dev_signed_name: signedName };
    const { data: updated } = await supabase.from("contracts").update(update).eq("id", id).select().maybeSingle();
    if (updated) setContract(updated as Contract);
    const other = isFounder
      ? await supabase.from("profiles_developer").select("user_id").eq("id", contract.developer_id).maybeSingle()
      : await supabase.from("profiles_founder").select("user_id").eq("id", contract.founder_id).maybeSingle();
    if (other.data?.user_id) {
      await supabase.from("notifications").insert({
        user_id: other.data.user_id, type: "contrat_signe",
        title: `${signedName} a signé le contrat`,
        body: `Le contrat pour "${contract.data.projet.titre}" attend ta signature.`,
        link: `/contrat/${id}`,
      });
    }
    setSigning(false);
    setShowConfirm(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
    </div>
  );
  if (!contract) return null;

  const d = contract.data;
  const isFounder    = role === "founder";
  const alreadySigned = isFounder ? !!contract.founder_signed_at : !!contract.dev_signed_at;
  const bothSigned   = !!contract.founder_signed_at && !!contract.dev_signed_at;
  const stacks       = d.projet.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  return (
    <div className="min-h-screen pb-28" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="sticky top-0 z-20 px-4 py-3"
        style={{
          background: "rgba(240,240,245,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
        }}>
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <button onClick={() => router.back()} className="btn-icon shrink-0" style={{ width: 34, height: 34 }}>
            <ArrowLeft size={15} strokeWidth={2} />
          </button>
          <p className="text-sm font-bold flex-1 truncate" style={{ color: "var(--text)", letterSpacing: "-0.015em" }}>
            Lettre de mission
          </p>
          <button
            onClick={() => generateMatchPdf({ projet: d.projet, founder: d.founder, dev: d.dev, matchDate: d.matchDate })}
            className="btn-ghost flex items-center gap-1.5 text-xs"
            style={{ padding: "6px 12px" }}
          >
            <Download size={12} strokeWidth={2} /> PDF
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Document */}
        <div className="rounded-3xl overflow-hidden"
          style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

          <div className="px-6 pt-8 pb-6 flex flex-col gap-8">

            {/* Titre document */}
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold" style={{ color: "var(--subtle)", letterSpacing: "0.06em" }}>
                LINKEA · {fmtDate(d.matchDate).toUpperCase()}
              </p>
              <h1 className="text-2xl font-black" style={{ color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                Lettre de mission
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                Accord de collaboration entre les parties ci-dessous.
              </p>
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

            {/* Parties */}
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                <div className="w-8 shrink-0 pt-0.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
                    style={{ background: "#1A2138" }}>
                    {d.founder.nom[0]}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>FONDATEUR</p>
                  <p className="font-bold text-base" style={{ color: "var(--text)", letterSpacing: "-0.015em" }}>{d.founder.nom}</p>
                  {d.founder.ecole && <p className="text-sm" style={{ color: "var(--muted)" }}>{d.founder.ecole}</p>}
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 shrink-0 pt-0.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
                    style={{ background: "#1A2138" }}>
                    {d.dev.nom[0]}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>DÉVELOPPEUR</p>
                  <p className="font-bold text-base" style={{ color: "var(--text)", letterSpacing: "-0.015em" }}>{d.dev.nom}</p>
                  {d.dev.ecole && <p className="text-sm" style={{ color: "var(--muted)" }}>{d.dev.ecole}</p>}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

            {/* Projet */}
            <div>
              <p className="text-xs font-semibold mb-3" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>OBJET DE LA MISSION</p>
              <p className="text-xl font-black mb-3" style={{ color: "var(--text)", letterSpacing: "-0.025em", lineHeight: 1.2 }}>
                {d.projet.titre}
              </p>
              {d.projet.description && (
                <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--muted)" }}>{d.projet.description}</p>
              )}
              <div className="flex flex-col gap-2 text-sm" style={{ color: "var(--text-2)" }}>
                {d.projet.deadline && (
                  <div className="flex gap-3">
                    <span style={{ color: "var(--subtle)", minWidth: 100 }}>Deadline</span>
                    <span className="font-semibold">{d.projet.deadline}</span>
                  </div>
                )}
                {d.dev.dispo_heures_semaine && (
                  <div className="flex gap-3">
                    <span style={{ color: "var(--subtle)", minWidth: 100 }}>Disponibilité</span>
                    <span className="font-semibold">{d.dev.dispo_heures_semaine}h / semaine</span>
                  </div>
                )}
                {stacks.length > 0 && (
                  <div className="flex gap-3">
                    <span style={{ color: "var(--subtle)", minWidth: 100 }}>Stack</span>
                    <span className="font-semibold">{stacks.join(", ")}</span>
                  </div>
                )}
                {d.dev.competences && d.dev.competences.length > 0 && (
                  <div className="flex gap-3">
                    <span style={{ color: "var(--subtle)", minWidth: 100 }}>Compétences</span>
                    <span className="font-semibold">{d.dev.competences.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

            {/* Engagements */}
            <div>
              <p className="text-xs font-semibold mb-4" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>ENGAGEMENTS MUTUELS</p>
              <div className="flex flex-col gap-3.5">
                {[
                  `${d.founder.nom} s'engage à fournir un cahier des charges clair, des retours réguliers et à respecter le temps du développeur.`,
                  `${d.dev.nom} s'engage à livrer un MVP fonctionnel dans les délais convenus, à communiquer activement sur l'avancement et à respecter les objectifs du projet.`,
                  "Les deux parties s'engagent à communiquer de bonne foi via Linkea et à résoudre tout différend à l'amiable.",
                  "Ce document ne constitue pas un contrat de travail. Il matérialise un accord de collaboration entre deux étudiants dans le cadre de la plateforme Linkea (Bêta).",
                ].map((eng, i) => (
                  <div key={i} className="flex gap-3.5 items-start">
                    <span className="text-xs font-black mt-0.5 shrink-0 w-4 text-right"
                      style={{ color: "var(--rose)", fontVariantNumeric: "tabular-nums" }}>
                      {i + 1}.
                    </span>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{eng}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

            {/* Signatures */}
            <div>
              <p className="text-xs font-semibold mb-4" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>SIGNATURES</p>
              <div className="grid grid-cols-2 gap-6">

                {/* Founder */}
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>FONDATEUR</p>
                  {contract.founder_signed_at ? (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <CheckCircle2 size={14} style={{ color: "#1A2138" }} strokeWidth={2.5} />
                        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{contract.founder_signed_name}</p>
                      </div>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{fmtFull(contract.founder_signed_at)}</p>
                      {/* Ligne de signature stylisée */}
                      <div className="mt-3 pt-3" style={{ borderTop: "2px solid #1A2138" }}>
                        <p className="text-base font-black italic" style={{ color: "var(--text)", fontFamily: "Georgia, serif" }}>
                          {contract.founder_signed_name}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Clock size={13} style={{ color: "var(--subtle)" }} />
                        <p className="text-xs" style={{ color: "var(--subtle)" }}>En attente</p>
                      </div>
                      <div className="mt-3 pt-3" style={{ borderTop: "1.5px dashed rgba(0,0,0,0.15)" }}>
                        <p className="text-xs" style={{ color: "var(--subtle)" }}>{d.founder.nom}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Dev */}
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: "var(--subtle)", letterSpacing: "0.04em" }}>DÉVELOPPEUR</p>
                  {contract.dev_signed_at ? (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <CheckCircle2 size={14} style={{ color: "#1A2138" }} strokeWidth={2.5} />
                        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{contract.dev_signed_name}</p>
                      </div>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{fmtFull(contract.dev_signed_at)}</p>
                      <div className="mt-3 pt-3" style={{ borderTop: "2px solid #1A2138" }}>
                        <p className="text-base font-black italic" style={{ color: "var(--text)", fontFamily: "Georgia, serif" }}>
                          {contract.dev_signed_name}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Clock size={13} style={{ color: "var(--subtle)" }} />
                        <p className="text-xs" style={{ color: "var(--subtle)" }}>En attente</p>
                      </div>
                      <div className="mt-3 pt-3" style={{ borderTop: "1.5px dashed rgba(0,0,0,0.15)" }}>
                        <p className="text-xs" style={{ color: "var(--subtle)" }}>{d.dev.nom}</p>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Footer document */}
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 16 }}>
              <p className="text-xs text-center" style={{ color: "var(--subtle)" }}>
                Généré via Linkea · Document non juridiquement contraignant
              </p>
            </div>

          </div>
        </div>

        {/* CTA */}
        <div className="mt-4 flex flex-col gap-3">
          {!alreadySigned && (
            <button
              onClick={() => setShowConfirm(true)}
              className="btn-primary w-full py-4 flex items-center justify-center gap-2.5"
              style={{ borderRadius: 16, fontSize: 15, fontWeight: 700 }}
            >
              <PenLine size={17} strokeWidth={2} />
              Signer ce contrat
            </button>
          )}

          {alreadySigned && !bothSigned && (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
              style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.14)" }}>
              <Clock size={16} style={{ color: "#1A2138" }} strokeWidth={1.8} />
              <div>
                <p className="text-sm font-bold" style={{ color: "#1A2138" }}>Tu as signé</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>En attente de la signature de l&apos;autre partie.</p>
              </div>
            </div>
          )}

          {bothSigned && (
            <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
              style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <CheckCircle2 size={16} style={{ color: "#1A2138" }} strokeWidth={2} />
              <div>
                <p className="text-sm font-bold" style={{ color: "#1A2138" }}>Contrat signé par les deux parties</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>La collaboration est officiellement lancée.</p>
              </div>
            </div>
          )}

          {/* ── Bloc paiement (visible après les deux signatures) ── */}
          {bothSigned && (
            <>
              {/* Pas encore payé — CTA founder */}
              {!payment && isFounder && (
                <div className="rounded-2xl px-5 py-4 flex flex-col gap-3"
                  style={{ background: "#fff", border: "1px solid #ECE7DD" }}>
                  <div className="flex items-center gap-3">
                    <CreditCard size={18} strokeWidth={1.8} style={{ color: "#1A2138" }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: "#1A2138" }}>Rémunérer le développeur</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Le paiement est sécurisé jusqu'à la livraison.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/projets/${contract?.project_id}/paiement`)}
                    className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
                    style={{ fontSize: 14 }}
                  >
                    <CreditCard size={15} strokeWidth={2} /> Effectuer le paiement
                  </button>
                </div>
              )}

              {/* Paiement existant */}
              {payment && (
                <div className="rounded-2xl px-5 py-4 flex flex-col gap-2"
                  style={{
                    background: payment.status === "disputed" ? "rgba(244,63,94,0.04)" : "rgba(16,185,129,0.04)",
                    border: `1px solid ${payment.status === "disputed" ? "rgba(244,63,94,0.2)" : "rgba(16,185,129,0.18)"}`,
                  }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard size={15} strokeWidth={1.8} style={{ color: payment.status === "disputed" ? "var(--rose)" : "#059669" }} />
                      <p className="text-sm font-bold" style={{ color: payment.status === "disputed" ? "var(--rose)" : "#059669" }}>
                        {payment.status === "held"     ? "Paiement sécurisé"
                          : payment.status === "released" ? "Paiement versé"
                          : payment.status === "disputed" ? "Litige en cours"
                          : "Paiement"}
                      </p>
                    </div>
                    <p className="text-sm font-black" style={{ color: "#1A2138", fontVariantNumeric: "tabular-nums" }}>
                      {payment.dev_amount} €
                    </p>
                  </div>
                  {payment.status === "held" && (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>Fonds bloqués — seront versés à la livraison.</p>
                  )}
                  {payment.status === "released" && (
                    <p className="text-xs" style={{ color: "#059669" }}>Les fonds ont été versés au développeur.</p>
                  )}
                  {payment.status === "disputed" && dispute && (
                    <p className="text-xs" style={{ color: "var(--rose)" }}>Motif : {dispute.reason}</p>
                  )}
                </div>
              )}

              {/* Bouton ouvrir litige */}
              {isFounder && payment?.status === "held" && !dispute && (
                <button
                  onClick={() => setShowDisputeModal(true)}
                  className="btn-ghost w-full py-3 flex items-center justify-center gap-2 text-sm"
                  style={{ color: "var(--rose)", borderColor: "rgba(244,63,94,0.25)" }}
                >
                  <ShieldAlert size={15} strokeWidth={2} /> Ouvrir un litige
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal litige */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}>
          <div className="card w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-black mb-1.5" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
                Ouvrir un litige
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Décris le motif du litige. Notre équipe examinera la situation.
              </p>
            </div>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Ex : Le dev n'a pas livré ce qui était convenu..."
              rows={4}
              maxLength={1000}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #ECE7DD", background: "#FAF8F4", fontSize: 13, fontWeight: 500, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            />
            {disputeError && (
              <p style={{ fontSize: 12, color: "#D4537E", margin: 0 }}>{disputeError}</p>
            )}
            <button
              onClick={openDispute}
              disabled={openingDispute || !disputeReason.trim()}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
              style={{ fontSize: 15 }}
            >
              <ShieldAlert size={15} strokeWidth={2} />
              {openingDispute ? "Envoi en cours..." : "Soumettre le litige"}
            </button>
            <button onClick={() => { setShowDisputeModal(false); setDisputeReason(""); }} className="btn-ghost w-full py-3">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmation */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}>
          <div className="card w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-black mb-1.5" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
                Confirmer la signature
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                En signant, tu confirmes avoir lu et accepté les termes de cette lettre de mission pour{" "}
                <strong style={{ color: "var(--text)" }}>{d.projet.titre}</strong>.
              </p>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
              style={{ background: "#FAF8F4", border: "1px solid #ECE7DD" }}>
              <AlertCircle size={14} style={{ color: "#8A8579", marginTop: 1 }} strokeWidth={2} />
              <p className="text-xs leading-relaxed" style={{ color: "#8A8579" }}>
                Cette action est définitive et ne peut pas être annulée.
              </p>
            </div>
            <button onClick={handleSign} disabled={signing} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
              style={{ fontSize: 15 }}>
              <PenLine size={15} strokeWidth={2} />
              {signing ? "Signature en cours..." : "Je signe"}
            </button>
            <button onClick={() => setShowConfirm(false)} className="btn-ghost w-full py-3">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
