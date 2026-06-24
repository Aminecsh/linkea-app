"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  targetType: "profile" | "project";
  targetId: string;
  targetNom?: string;
  reporterId: string;
};

const RAISONS = [
  { value: "spam",               label: "Spam",                  desc: "Contenu répétitif ou indésirable" },
  { value: "faux_profil",        label: "Faux profil",           desc: "Usurpation d'identité" },
  { value: "contenu_inapproprie",label: "Contenu inapproprié",   desc: "Propos offensants ou hors-sujet" },
  { value: "arnaque",            label: "Arnaque",               desc: "Tentative de fraude ou escroquerie" },
  { value: "autre",              label: "Autre",                 desc: "Autre problème" },
];

export default function ReportModal({ isOpen, onClose, targetType, targetId, targetNom, reporterId }: Props) {
  const [raison, setRaison] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  async function submit() {
    if (!raison) return;
    setSending(true);
    await supabase.from("reports").insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      target_nom: targetNom ?? null,
      raison,
      description: description.trim() || null,
      statut: "pending",
    });
    logAudit(reporterId, "report_submitted", { target_type: targetType, target_id: targetId, raison });
    setSending(false);
    setDone(true);
  }

  function close() {
    setRaison(""); setDescription(""); setDone(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">Signaler</h2>
            {targetNom && <p className="text-xs text-slate-400 mt-0.5">{targetType === "profile" ? "Profil" : "Projet"} · {targetNom}</p>}
          </div>
          <button onClick={close} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">✕</button>
        </div>

        {done ? (
          <div className="px-5 py-10 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center text-2xl">✓</div>
            <p className="font-bold text-slate-900">Signalement envoyé</p>
            <p className="text-sm text-slate-400">Notre équipe va examiner ce contenu.</p>
            <button onClick={close} className="btn-pink mt-2 px-8 py-2.5">Fermer</button>
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Raison du signalement</p>
              <div className="flex flex-col gap-2">
                {RAISONS.map((r) => (
                  <label key={r.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${raison === r.value ? "border-red-400 bg-red-50" : "border-slate-100 hover:border-slate-200"}`}>
                    <input type="radio" name="raison" value={r.value} checked={raison === r.value} onChange={() => setRaison(r.value)} className="mt-0.5 accent-red-500 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">{r.label}</p>
                      <p className="text-xs text-slate-400">{r.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Précisions (optionnel)</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Décris le problème..."
                className="input-field resize-none text-sm"
              />
            </div>

            <button
              onClick={submit}
              disabled={!raison || sending}
              className="btn-pink w-full py-3 disabled:opacity-50"
            >
              {sending ? "Envoi..." : "Envoyer le signalement"}
            </button>
            <button onClick={close} className="btn-ghost w-full py-2.5 text-sm">Annuler</button>
          </div>
        )}
      </div>
    </div>
  );
}
