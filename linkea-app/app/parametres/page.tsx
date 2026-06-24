"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Shield, Download, Trash2, LogOut, ChevronLeft,
  CheckCircle, AlertTriangle, Smartphone, Eye, EyeOff,
} from "lucide-react";

type Factor = { id: string; status: string; friendly_name?: string };

export default function ParametresPage() {
  const router = useRouter();

  // Compte
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<string | null>(null);

  // 2FA
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [twoFaMsg, setTwoFaMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Suppression
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "deleting">("idle");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Mot de passe
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwShow, setPwShow] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }
      setEmail(user.email ?? "");
      setUserId(user.id);

      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole(roleData?.role ?? null);

      const { data: mfa } = await supabase.auth.mfa.listFactors();
      setFactors(mfa?.totp ?? []);
    }
    load();
  }, [router]);

  // ── 2FA ──────────────────────────────────────────────────────────────────
  async function startEnroll() {
    setTwoFaMsg(null);
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) { setTwoFaMsg({ type: "err", text: error?.message ?? "Erreur" }); setEnrolling(false); return; }
    setQrUri(data.totp.qr_code);
    setFactorId(data.id);
  }

  async function verifyTotp() {
    if (!factorId || !totpCode.trim()) return;
    setVerifying(true);
    setTwoFaMsg(null);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) { setTwoFaMsg({ type: "err", text: cErr?.message ?? "Erreur challenge" }); setVerifying(false); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: totpCode });
    if (error) { setTwoFaMsg({ type: "err", text: "Code invalide" }); setVerifying(false); return; }
    setTwoFaMsg({ type: "ok", text: "2FA activé avec succès !" });
    const { data: mfa } = await supabase.auth.mfa.listFactors();
    setFactors(mfa?.totp ?? []);
    setQrUri(null);
    setFactorId(null);
    setTotpCode("");
    setEnrolling(false);
    setVerifying(false);
  }

  async function unenroll(fId: string) {
    setTwoFaMsg(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fId });
    if (error) { setTwoFaMsg({ type: "err", text: error.message }); return; }
    setTwoFaMsg({ type: "ok", text: "2FA désactivé" });
    const { data: mfa } = await supabase.auth.mfa.listFactors();
    setFactors(mfa?.totp ?? []);
  }

  // ── Export données ────────────────────────────────────────────────────────
  async function exportData() {
    setExporting(true);
    const payload: Record<string, unknown> = { user_id: userId, exported_at: new Date().toISOString() };

    const [fP, dP] = await Promise.all([
      supabase.from("profiles_founder").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles_developer").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    payload.profil_founder = fP.data;
    payload.profil_developer = dP.data;

    if (role === "founder" && fP.data?.id) {
      const { data: projects } = await supabase.from("projects").select("*").eq("founder_id", fP.data.id);
      payload.projets = projects ?? [];
    }
    if (role === "developer" && dP.data?.id) {
      const { data: cands } = await supabase.from("candidatures").select("*").eq("developer_id", dP.data.id);
      payload.candidatures = cands ?? [];
    }

    const { data: notifs } = await supabase.from("notifications").select("*").eq("user_id", userId);
    payload.notifications = notifs ?? [];

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkea-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  // ── Changement de mot de passe ────────────────────────────────────────────
  async function changePassword() {
    if (!pwNew.trim() || pwNew.length < 8) { setPwMsg({ type: "err", text: "Minimum 8 caractères" }); return; }
    setPwLoading(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    if (error) { setPwMsg({ type: "err", text: error.message }); setPwLoading(false); return; }
    setPwMsg({ type: "ok", text: "Mot de passe mis à jour !" });
    setPwCurrent("");
    setPwNew("");
    setPwLoading(false);
  }

  // ── Suppression compte ────────────────────────────────────────────────────
  async function deleteAccount() {
    if (deleteConfirm !== "SUPPRIMER") return;
    setDeleteStep("deleting");
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setDeleteError(json.error ?? "Erreur serveur"); setDeleteStep("confirm"); return; }
      await supabase.auth.signOut();
      router.push("/");
    } catch {
      setDeleteError("Erreur réseau");
      setDeleteStep("confirm");
    }
  }

  const verifiedFactor = factors.find(f => f.status === "verified");

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-bold text-slate-900 text-base">Paramètres & Sécurité</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">

        {/* Compte */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-sm">Mon compte</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Email</p>
              <p className="text-sm font-medium text-slate-800">{email || "—"}</p>
            </div>
          </div>
        </section>

        {/* Mot de passe */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-sm">Changer de mot de passe</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="relative">
              <input
                type={pwShow ? "text" : "password"}
                placeholder="Nouveau mot de passe (min. 8 caractères)"
                value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 pr-10"
              />
              <button onClick={() => setPwShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {pwShow ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pwMsg && (
              <div className={`flex items-center gap-2 text-xs font-medium ${pwMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>
                {pwMsg.type === "ok" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                {pwMsg.text}
              </div>
            )}
            <button
              onClick={changePassword}
              disabled={!pwNew.trim() || pwLoading}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              {pwLoading ? "Mise à jour…" : "Mettre à jour"}
            </button>
          </div>
        </section>

        {/* 2FA */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Shield size={16} className="text-indigo-500" />
            <h2 className="font-bold text-slate-900 text-sm">Double authentification (2FA)</h2>
            {verifiedFactor && (
              <span className="ml-auto text-xs font-semibold bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full">Activé</span>
            )}
          </div>
          <div className="px-5 py-4 flex flex-col gap-4">
            {!verifiedFactor && !enrolling && (
              <>
                <p className="text-xs text-slate-500">Protège ton compte avec une application comme Google Authenticator ou Authy.</p>
                <button onClick={startEnroll} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                  <Smartphone size={15} /> Activer le 2FA
                </button>
              </>
            )}

            {enrolling && !verifiedFactor && (
              <div className="flex flex-col gap-4">
                {qrUri ? (
                  <>
                    <p className="text-xs text-slate-500">Scanne ce QR code avec Google Authenticator ou Authy, puis entre le code à 6 chiffres.</p>
                    <div className="flex justify-center">
                      <img src={qrUri} alt="QR Code 2FA" className="w-44 h-44 rounded-xl border border-slate-200" />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Code à 6 chiffres"
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-center tracking-widest font-mono focus:outline-none focus:border-indigo-400"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setEnrolling(false); setQrUri(null); setFactorId(null); setTotpCode(""); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                        Annuler
                      </button>
                      <button onClick={verifyTotp} disabled={totpCode.length !== 6 || verifying} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                        {verifying ? "Vérification…" : "Confirmer"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 text-center">Génération du QR code…</p>
                )}
              </div>
            )}

            {verifiedFactor && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle size={16} className="text-green-500" />
                  2FA actif — ton compte est protégé
                </div>
                <button onClick={() => unenroll(verifiedFactor.id)} className="w-full py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors">
                  Désactiver le 2FA
                </button>
              </div>
            )}

            {twoFaMsg && (
              <div className={`flex items-center gap-2 text-xs font-medium ${twoFaMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>
                {twoFaMsg.type === "ok" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                {twoFaMsg.text}
              </div>
            )}
          </div>
        </section>

        {/* Données RGPD */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-sm">Mes données (RGPD)</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="text-xs text-slate-500">Tu peux télécharger toutes tes données ou supprimer définitivement ton compte.</p>
            <button
              onClick={exportData}
              disabled={exporting}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <Download size={15} />
              {exporting ? "Préparation…" : "Télécharger mes données"}
            </button>
          </div>
        </section>

        {/* Zone danger */}
        <section className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            <h2 className="font-bold text-red-600 text-sm">Zone dangereuse</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            {deleteStep === "idle" && (
              <>
                <p className="text-xs text-slate-500">La suppression est <strong>irréversible</strong>. Toutes tes données seront effacées définitivement.</p>
                <button onClick={() => setDeleteStep("confirm")} className="w-full py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                  <Trash2 size={15} /> Supprimer mon compte
                </button>
              </>
            )}

            {deleteStep === "confirm" && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-red-600 font-medium">Tape <strong>SUPPRIMER</strong> pour confirmer :</p>
                <input
                  type="text"
                  placeholder="SUPPRIMER"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  className="w-full border border-red-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-mono"
                />
                {deleteError && (
                  <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> {deleteError}</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setDeleteStep("idle"); setDeleteConfirm(""); setDeleteError(null); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Annuler
                  </button>
                  <button onClick={deleteAccount} disabled={deleteConfirm !== "SUPPRIMER"} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                    <Trash2 size={14} /> Confirmer
                  </button>
                </div>
              </div>
            )}

            {deleteStep === "deleting" && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                Suppression en cours…
              </div>
            )}
          </div>
        </section>

        {/* Déconnexion */}
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
          className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Se déconnecter
        </button>

      </div>
    </div>
  );
}
