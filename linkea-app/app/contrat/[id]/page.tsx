"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateMatchPdf } from "@/lib/generateMatchPdf";

type ContractData = {
  projet: {
    id: string;
    titre: string;
    description?: string;
    stack_souhaitee?: string;
    deadline?: string;
  };
  founder: { nom: string; ecole?: string };
  dev: {
    nom: string;
    ecole?: string;
    competences?: string[];
    dispo_heures_semaine?: number;
    github?: string;
  };
  matchDate: string;
};

type Contract = {
  id: string;
  project_id: string;
  founder_id: string;
  developer_id: string;
  data: ContractData;
  founder_signed_at: string | null;
  founder_signed_name: string | null;
  dev_signed_at: string | null;
  dev_signed_name: string | null;
  created_at: string;
};

export default function ContratPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [payment, setPayment] = useState<{ id: string; status: string; amount: number; dev_amount: number } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);

      const { data: c } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!c) { router.push("/profil"); return; }
      setContract(c as Contract);

      // Vérifier si un paiement existe pour ce projet
      const { data: pay } = await supabase
        .from("payments")
        .select("id, status, amount, dev_amount")
        .eq("project_id", (c as Contract).project_id)
        .maybeSingle();
      if (pay) setPayment(pay as { id: string; status: string; amount: number; dev_amount: number });

      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSign() {
    if (!contract || !userId || signing) return;
    setSigning(true);

    const now = new Date().toISOString();
    const isFounder = role === "founder";
    const signedName = isFounder ? contract.data.founder.nom : contract.data.dev.nom;

    const update = isFounder
      ? { founder_signed_at: now, founder_signed_name: signedName }
      : { dev_signed_at: now, dev_signed_name: signedName };

    const { data: updated } = await supabase
      .from("contracts")
      .update(update)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (updated) setContract(updated as Contract);

    // Notifier l'autre partie que le contrat a été signé
    const otherProfile = isFounder
      ? await supabase.from("profiles_developer").select("user_id").eq("id", contract.developer_id).maybeSingle()
      : await supabase.from("profiles_founder").select("user_id").eq("id", contract.founder_id).maybeSingle();

    if (otherProfile.data?.user_id) {
      await supabase.from("notifications").insert({
        user_id: otherProfile.data.user_id,
        type: "contrat_signe",
        title: `${signedName} a signé le contrat ✍️`,
        body: `Le contrat pour "${contract.data.projet.titre}" attend ta signature.`,
        link: `/contrat/${id}`,
      });
    }

    setSigning(false);
    setShowConfirm(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!contract) return null;

  const d = contract.data;
  const bothSigned = !!contract.founder_signed_at && !!contract.dev_signed_at;

  function handleDownloadPdf() {
    generateMatchPdf({
      projet: d.projet,
      founder: d.founder,
      dev: d.dev,
      matchDate: d.matchDate,
    });
  }
  const isFounder = role === "founder";
  const alreadySigned = isFounder ? !!contract.founder_signed_at : !!contract.dev_signed_at;
  const stacks = d.projet.stack_souhaitee?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm font-medium">
            ← Retour
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="text-xs font-semibold text-slate-500 hover:text-pink-500 border border-slate-200 hover:border-pink-300 px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5"
            >
              <span>⬇️</span> PDF
            </button>
            {bothSigned ? (
              <span className="text-xs font-bold bg-green-50 text-green-600 border border-green-200 px-3 py-1 rounded-full">
                ✓ Contrat signé
              </span>
            ) : (
              <span className="text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1 rounded-full">
                En attente de signatures
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">

        {/* Bannière signé */}
        {bothSigned && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-bold text-green-700">Contrat signé par les deux parties</p>
              <p className="text-sm text-green-600">La collaboration est officiellement lancée.</p>
            </div>
          </div>
        )}

        {/* CTA Paiement */}
        {bothSigned && isFounder && !payment && (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(99,102,241,0.25)", background: "rgba(99,102,241,0.04)" }}>
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">💰</span>
                <p className="font-bold text-slate-900">Sécuriser le paiement</p>
              </div>
              <p className="text-sm text-slate-500">
                Le contrat est signé. Dépose le budget du projet — il sera bloqué chez Linkea et débloqué au dev à la livraison.
              </p>
            </div>
            <div className="px-5 pb-4">
              <button
                onClick={() => router.push(`/projets/${contract.project_id}/paiement`)}
                className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
              >
                💳 Procéder au paiement
              </button>
            </div>
          </div>
        )}

        {bothSigned && payment && (
          <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
            style={{
              background: payment.status === "released" ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)",
              border: `1px solid ${payment.status === "released" ? "rgba(16,185,129,0.20)" : "rgba(245,158,11,0.20)"}`,
            }}>
            <span className="text-xl">{payment.status === "released" ? "✅" : "🔒"}</span>
            <div>
              <p className="font-bold text-sm" style={{ color: payment.status === "released" ? "#065f46" : "#92400e" }}>
                {payment.status === "released" ? `${payment.dev_amount.toFixed(2)}€ débloqués au dev` : `${payment.amount.toFixed(2)}€ sécurisés chez Linkea`}
              </p>
              <p className="text-xs" style={{ color: payment.status === "released" ? "#6ee7b7" : "#fcd34d", opacity: 0.9 }}>
                {payment.status === "released" ? "Paiement libéré à la livraison" : "En attente de livraison"}
              </p>
            </div>
          </div>
        )}

        {/* En-tête contrat */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-100 mb-1">Linkea · Bêta V1</p>
            <h1 className="text-2xl font-black text-white">Lettre de mission</h1>
            <p className="text-pink-100 text-sm mt-1">Collaboration · {d.matchDate}</p>
          </div>

          <div className="p-6 flex flex-col gap-6">

            {/* Parties */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Parties</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-purple-500 mb-1">FOUNDER</p>
                  <p className="font-bold text-slate-900">{d.founder.nom}</p>
                  {d.founder.ecole && <p className="text-xs text-slate-500 mt-0.5">{d.founder.ecole}</p>}
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-500 mb-1">DÉVELOPPEUR</p>
                  <p className="font-bold text-slate-900">{d.dev.nom}</p>
                  {d.dev.ecole && <p className="text-xs text-slate-500 mt-0.5">{d.dev.ecole}</p>}
                </div>
              </div>
            </div>

            {/* Projet */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Projet</p>
              <div className="bg-slate-50 rounded-xl p-4 flex flex-col gap-3">
                <p className="font-bold text-slate-900 text-lg">{d.projet.titre}</p>

                <div className="flex flex-wrap gap-2">
                  {d.projet.deadline && (
                    <span className="text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1 rounded-full">
                      📅 {d.projet.deadline}
                    </span>
                  )}
                  {d.dev.dispo_heures_semaine && (
                    <span className="text-xs font-semibold bg-green-50 text-green-600 border border-green-200 px-3 py-1 rounded-full">
                      ⏱ {d.dev.dispo_heures_semaine}h/sem
                    </span>
                  )}
                </div>

                {stacks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {stacks.map((s) => (
                      <span key={s} className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {d.dev.competences && d.dev.competences.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {d.dev.competences.map((c) => (
                      <span key={c} className="text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {d.projet.description && (
                  <p className="text-sm text-slate-600 leading-relaxed">{d.projet.description}</p>
                )}
              </div>
            </div>

            {/* Engagements */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Engagements mutuels</p>
              <div className="flex flex-col gap-2">
                {[
                  `${d.founder.nom} s'engage à fournir un cahier des charges clair, des retours réguliers et à respecter le temps du développeur.`,
                  `${d.dev.nom} s'engage à livrer un MVP fonctionnel dans les délais convenus, à communiquer activement sur l'avancement et à respecter les objectifs du projet.`,
                  "Les deux parties s'engagent à communiquer de bonne foi via Linkea et à résoudre tout différend à l'amiable.",
                  "Ce document ne constitue pas un contrat de travail. Il matérialise un accord de collaboration entre deux étudiants dans le cadre de la plateforme Linkea (Bêta V1).",
                ].map((eng, i) => (
                  <div key={i} className="flex gap-3 text-sm text-slate-600 leading-relaxed">
                    <span className="text-pink-400 font-bold shrink-0 mt-0.5">•</span>
                    <p>{eng}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Signatures */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Signatures</p>
              <div className="grid grid-cols-2 gap-3">

                {/* Founder */}
                <div className={`rounded-xl border-2 p-4 ${contract.founder_signed_at ? "border-green-200 bg-green-50" : "border-dashed border-slate-200 bg-white"}`}>
                  <p className="text-xs font-bold text-slate-400 mb-2">FOUNDER</p>
                  {contract.founder_signed_at ? (
                    <>
                      <p className="font-bold text-green-700 text-sm">✓ {contract.founder_signed_name}</p>
                      <p className="text-xs text-green-500 mt-1">{fmtDate(contract.founder_signed_at)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 italic">En attente de signature</p>
                  )}
                </div>

                {/* Dev */}
                <div className={`rounded-xl border-2 p-4 ${contract.dev_signed_at ? "border-green-200 bg-green-50" : "border-dashed border-slate-200 bg-white"}`}>
                  <p className="text-xs font-bold text-slate-400 mb-2">DÉVELOPPEUR</p>
                  {contract.dev_signed_at ? (
                    <>
                      <p className="font-bold text-green-700 text-sm">✓ {contract.dev_signed_name}</p>
                      <p className="text-xs text-green-500 mt-1">{fmtDate(contract.dev_signed_at)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 italic">En attente de signature</p>
                  )}
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* Bouton signer */}
        {!alreadySigned && (
          <button
            onClick={() => setShowConfirm(true)}
            className="btn-pink w-full py-4 text-base"
          >
            ✍️ Signer ce contrat
          </button>
        )}

        {alreadySigned && !bothSigned && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 text-center">
            <p className="text-sm font-semibold text-blue-700">
              Tu as signé. En attente de la signature de l&apos;autre partie.
            </p>
          </div>
        )}

      </div>

      {/* Modal confirmation signature */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="text-center">
              <p className="text-3xl mb-3">✍️</p>
              <h2 className="text-lg font-black text-slate-900">Confirmer la signature</h2>
              <p className="text-sm text-slate-500 mt-2">
                En signant, tu confirmes avoir lu et accepté les termes de cette lettre de mission pour le projet <strong>{d.projet.titre}</strong>.
              </p>
            </div>
            <button
              onClick={handleSign}
              disabled={signing}
              className="btn-pink w-full py-3"
            >
              {signing ? "Signature en cours..." : "Je signe"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="btn-ghost w-full py-3"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
