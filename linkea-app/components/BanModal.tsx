"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetNom: string;
  adminId: string;
  onBanned?: () => void;
};

const DUREES = [
  { label: "1 jour",   days: 1 },
  { label: "3 jours",  days: 3 },
  { label: "7 jours",  days: 7 },
  { label: "30 jours", days: 30 },
  { label: "Personnalisé", days: 0 },
];

const RAISONS = [
  "Spam ou contenu répétitif",
  "Faux profil / usurpation d'identité",
  "Arnaque ou comportement frauduleux",
  "Contenu inapproprié",
  "Violation répétée des règles",
  "Autre",
];

export default function BanModal({ isOpen, onClose, targetUserId, targetNom, adminId, onBanned }: Props) {
  const [type, setType]               = useState<"temp" | "permanent">("temp");
  const [dureePreset, setDureePreset] = useState(7);
  const [dureeCustom, setDureeCustom] = useState("");
  const [raison, setRaison]           = useState("");
  const [message, setMessage]         = useState("");
  const [saving, setSaving]           = useState(false);
  const [done, setDone]               = useState(false);

  if (!isOpen) return null;

  const dureeJours = dureePreset === 0 ? Number(dureeCustom) || 0 : dureePreset;

  async function submit() {
    if (!raison) return;
    if (type === "temp" && dureeJours <= 0) return;
    setSaving(true);

    const expiresAt = type === "temp"
      ? new Date(Date.now() + dureeJours * 86400000).toISOString()
      : null;

    // Désactive les bans actifs précédents
    await supabase.from("bans").update({ is_active: false }).eq("user_id", targetUserId).eq("is_active", true);

    logAudit(adminId, "ban_applied", { target_user_id: targetUserId, type, raison });

    // Crée le nouveau ban
    await supabase.from("bans").insert({
      user_id: targetUserId,
      admin_id: adminId,
      type,
      raison,
      expires_at: expiresAt,
      is_active: true,
    });

    // Créer ou récupérer la conversation support
    const { data: existingConv } = await supabase
      .from("support_conversations").select("id").eq("user_id", targetUserId).maybeSingle();

    let convId = existingConv?.id;
    if (!convId) {
      const { data: newConv } = await supabase
        .from("support_conversations").insert({ user_id: targetUserId }).select("id").single();
      convId = newConv?.id;
    }

    // Premier message d'explication
    if (convId) {
      const msgContent = message.trim()
        || (type === "permanent"
          ? `Bonjour, ton compte Linkea a été banni définitivement pour la raison suivante : "${raison}". Si tu penses qu'il s'agit d'une erreur, réponds à ce message.`
          : `Bonjour, ton compte Linkea a été suspendu pour ${dureeJours} jour${dureeJours > 1 ? "s" : ""} pour la raison suivante : "${raison}". Si tu penses qu'il s'agit d'une erreur, réponds à ce message.`);
      await supabase.from("support_messages").insert({
        conversation_id: convId,
        sender_id: adminId,
        content: msgContent,
      });
    }

    // Notification
    await supabase.from("notifications").insert({
      user_id: targetUserId,
      type: "admin_ban",
      title: type === "permanent" ? "🚫 Compte banni" : "⏸ Compte suspendu",
      body: "Tu as reçu un message de l'équipe Linkea concernant ton compte.",
      link: "/messages",
    });

    setSaving(false);
    setDone(true);
    onBanned?.();
  }

  function close() {
    setType("temp"); setDureePreset(7); setDureeCustom("");
    setRaison(""); setMessage(""); setDone(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">Sanctionner</h2>
            <p className="text-xs text-slate-400 mt-0.5">{targetNom}</p>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">✕</button>
        </div>

        {done ? (
          <div className="px-5 py-10 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-2xl">🚫</div>
            <p className="font-bold text-slate-900">Sanction appliquée</p>
            <p className="text-sm text-slate-400">{targetNom} a été notifié(e).</p>
            <button onClick={close} className="btn-pink mt-2 px-8 py-2.5">Fermer</button>
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">

            {/* Type */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Type de sanction</p>
              <div className="grid grid-cols-2 gap-2">
                {([["temp", "⏸ Suspension", "Durée limitée"], ["permanent", "🚫 Ban définitif", "Accès permanent bloqué"]] as const).map(([val, label, desc]) => (
                  <label key={val} className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${type === val ? val === "permanent" ? "border-red-500 bg-red-50" : "border-amber-400 bg-amber-50" : "border-slate-100 hover:border-slate-200"}`}>
                    <input type="radio" name="type" value={val} checked={type === val} onChange={() => setType(val)} className="hidden" />
                    <p className={`text-sm font-bold ${type === val ? val === "permanent" ? "text-red-600" : "text-amber-600" : "text-slate-700"}`}>{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </label>
                ))}
              </div>
            </div>

            {/* Durée (temp seulement) */}
            {type === "temp" && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Durée</p>
                <div className="flex flex-wrap gap-2">
                  {DUREES.map((d) => (
                    <button key={d.days} onClick={() => setDureePreset(d.days)}
                      className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition-all ${dureePreset === d.days ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
                {dureePreset === 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <input type="number" value={dureeCustom} onChange={(e) => setDureeCustom(e.target.value)} min={1} placeholder="Nombre de jours" className="input-field flex-1 text-sm py-2" />
                    <span className="text-sm text-slate-400 shrink-0">jours</span>
                  </div>
                )}
              </div>
            )}

            {/* Raison */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Raison</p>
              <div className="flex flex-col gap-1.5">
                {RAISONS.map((r) => (
                  <label key={r} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${raison === r ? "border-red-400 bg-red-50" : "border-slate-100 hover:border-slate-200"}`}>
                    <input type="radio" name="raison" value={r} checked={raison === r} onChange={() => setRaison(r)} className="accent-red-500 shrink-0" />
                    <span className="text-sm text-slate-800">{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Message personnalisé */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Message à l'utilisateur <span className="font-normal normal-case text-slate-300">(optionnel)</span></p>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300}
                placeholder="Laisse vide pour un message automatique..."
                className="input-field resize-none text-sm" />
            </div>

            <button onClick={submit} disabled={!raison || saving || (type === "temp" && dureeJours <= 0)}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 bg-red-500 hover:bg-red-600 text-white">
              {saving ? "Application..." : type === "permanent" ? "🚫 Bannir définitivement" : `⏸ Suspendre ${dureeJours > 0 ? dureeJours + " jour" + (dureeJours > 1 ? "s" : "") : ""}`}
            </button>
            <button onClick={close} className="btn-ghost w-full py-2.5 text-sm -mt-2">Annuler</button>
          </div>
        )}
      </div>
    </div>
  );
}
