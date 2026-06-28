"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
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
    logAudit(userId, "2fa_enabled");
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
    logAudit(userId, "2fa_disabled");
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

    logAudit(userId, "data_exported");
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
    logAudit(userId, "password_change");
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

  const sCard:  React.CSSProperties = { background: "#fff", border: "1px solid #ECE7DD", borderRadius: 16, overflow: "hidden" };
  const sEye:   React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "#8A8579" };
  const sInput: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ECE7DD", background: "#fff", color: "#1A2138", fontSize: 13, fontWeight: 500, outline: "none", boxSizing: "border-box" };
  const sNavy:  React.CSSProperties = { width: "100%", padding: "11px 0", borderRadius: 10, background: "#1A2138", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };
  const sGhost: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 10, background: "#fff", color: "#1A2138", border: "1px solid #ECE7DD", fontSize: 13, fontWeight: 600, cursor: "pointer" };
  const sDanger:React.CSSProperties = { width: "100%", padding: "11px 0", borderRadius: 10, background: "#fff", color: "#D4537E", border: "1px solid rgba(212,83,126,0.3)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F4", paddingBottom: 40 }}>
      <style>{`
        .lk-p-input:focus { outline: 2px solid #D4537E; outline-offset: -1px; border-color: #D4537E !important; }
        .lk-p-navy:hover  { background: #2A3252 !important; }
        .lk-p-ghost:hover { border-color: #1A2138 !important; }
        .lk-p-danger:hover { border-color: #D4537E !important; background: rgba(212,83,126,0.04) !important; }
        @keyframes lk-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(20px)", borderBottom: "1px solid #ECE7DD", padding: "12px 20px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8579", display: "flex", alignItems: "center", padding: 0 }}>
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 16, fontWeight: 600, color: "#1A2138", margin: 0, letterSpacing: "-0.02em" }}>
            Paramètres & Sécurité
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Compte */}
        <section style={sCard}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #ECE7DD" }}>
            <p style={sEye}>Mon compte</p>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", color: "#8A8579", margin: "0 0 4px" }}>Email</p>
            <p style={{ fontSize: 14, fontWeight: 500, color: "#1A2138", margin: 0 }}>{email || "—"}</p>
          </div>
        </section>

        {/* Mot de passe */}
        <section style={sCard}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #ECE7DD" }}>
            <p style={sEye}>Changer de mot de passe</p>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <input
                type={pwShow ? "text" : "password"}
                placeholder="Nouveau mot de passe (min. 8 caractères)"
                value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                className="lk-p-input"
                style={{ ...sInput, paddingRight: 40 }}
              />
              <button onClick={() => setPwShow(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8A8579", display: "flex", alignItems: "center" }}>
                {pwShow ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {pwMsg && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: pwMsg.type === "ok" ? "#1A2138" : "#D4537E" }}>
                {pwMsg.type === "ok" ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                {pwMsg.text}
              </div>
            )}
            <button onClick={changePassword} disabled={!pwNew.trim() || pwLoading} className="lk-p-navy" style={{ ...sNavy, opacity: (!pwNew.trim() || pwLoading) ? 0.45 : 1 }}>
              {pwLoading ? "Mise à jour…" : "Mettre à jour"}
            </button>
          </div>
        </section>

        {/* 2FA */}
        <section style={sCard}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #ECE7DD", display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={14} strokeWidth={2} style={{ color: "#8A8579" }} />
            <p style={{ ...sEye, margin: 0 }}>Double authentification (2FA)</p>
            {verifiedFactor && (
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(26,33,56,0.2)", color: "#1A2138", background: "#fff" }}>Activé</span>
            )}
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {!verifiedFactor && !enrolling && (
              <>
                <p style={{ fontSize: 12, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Protège ton compte avec une application comme Google Authenticator ou Authy.</p>
                <button onClick={startEnroll} className="lk-p-navy" style={sNavy}>
                  <Smartphone size={14} /> Activer le 2FA
                </button>
              </>
            )}

            {enrolling && !verifiedFactor && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {qrUri ? (
                  <>
                    <p style={{ fontSize: 12, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Scanne ce QR code avec Google Authenticator ou Authy, puis entre le code à 6 chiffres.</p>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <img src={qrUri} alt="QR Code 2FA" style={{ width: 160, height: 160, borderRadius: 12, border: "1px solid #ECE7DD" }} />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Code à 6 chiffres"
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      className="lk-p-input"
                      style={{ ...sInput, textAlign: "center", letterSpacing: "0.3em", fontFamily: "monospace" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setEnrolling(false); setQrUri(null); setFactorId(null); setTotpCode(""); }} className="lk-p-ghost" style={sGhost}>
                        Annuler
                      </button>
                      <button onClick={verifyTotp} disabled={totpCode.length !== 6 || verifying} className="lk-p-navy" style={{ ...sNavy, flex: 1, width: "auto", opacity: (totpCode.length !== 6 || verifying) ? 0.45 : 1 }}>
                        {verifying ? "Vérification…" : "Confirmer"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: "#8A8579", textAlign: "center", margin: 0 }}>Génération du QR code…</p>
                )}
              </div>
            )}

            {verifiedFactor && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#1A2138", fontWeight: 500 }}>
                  <CheckCircle size={15} strokeWidth={2} style={{ color: "#1A2138", opacity: 0.6 }} />
                  2FA actif — ton compte est protégé
                </div>
                <button onClick={() => unenroll(verifiedFactor.id)} className="lk-p-danger" style={sDanger}>
                  Désactiver le 2FA
                </button>
              </div>
            )}

            {twoFaMsg && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: twoFaMsg.type === "ok" ? "#1A2138" : "#D4537E" }}>
                {twoFaMsg.type === "ok" ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                {twoFaMsg.text}
              </div>
            )}
          </div>
        </section>

        {/* Données RGPD */}
        <section style={sCard}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #ECE7DD" }}>
            <p style={sEye}>Mes données (RGPD)</p>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>Tu peux télécharger toutes tes données ou supprimer définitivement ton compte.</p>
            <button onClick={exportData} disabled={exporting} className="lk-p-navy" style={{ ...sNavy, opacity: exporting ? 0.5 : 1 }}>
              <Download size={14} />
              {exporting ? "Préparation…" : "Télécharger mes données"}
            </button>
          </div>
        </section>

        {/* Zone danger */}
        <section style={{ ...sCard, border: "1px solid rgba(212,83,126,0.25)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(212,83,126,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} strokeWidth={2} style={{ color: "#D4537E" }} />
            <p style={{ ...sEye, color: "#D4537E", margin: 0 }}>Zone dangereuse</p>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {deleteStep === "idle" && (
              <>
                <p style={{ fontSize: 12, color: "#8A8579", margin: 0, lineHeight: 1.6 }}>La suppression est <strong style={{ color: "#1A2138" }}>irréversible</strong>. Toutes tes données seront effacées définitivement.</p>
                <button onClick={() => setDeleteStep("confirm")} className="lk-p-danger" style={sDanger}>
                  <Trash2 size={14} /> Supprimer mon compte
                </button>
              </>
            )}

            {deleteStep === "confirm" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 12, color: "#D4537E", fontWeight: 600, margin: 0 }}>Tape <strong>SUPPRIMER</strong> pour confirmer :</p>
                <input
                  type="text"
                  placeholder="SUPPRIMER"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  className="lk-p-input"
                  style={{ ...sInput, fontFamily: "monospace", borderColor: "rgba(212,83,126,0.3)" }}
                />
                {deleteError && (
                  <p style={{ fontSize: 12, color: "#D4537E", display: "flex", alignItems: "center", gap: 5, margin: 0 }}>
                    <AlertTriangle size={12} /> {deleteError}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setDeleteStep("idle"); setDeleteConfirm(""); setDeleteError(null); }} className="lk-p-ghost" style={sGhost}>
                    Annuler
                  </button>
                  <button onClick={deleteAccount} disabled={deleteConfirm !== "SUPPRIMER"} className="lk-p-danger"
                    style={{ ...sDanger, flex: 1, width: "auto", opacity: deleteConfirm !== "SUPPRIMER" ? 0.4 : 1 }}>
                    <Trash2 size={13} /> Confirmer
                  </button>
                </div>
              </div>
            )}

            {deleteStep === "deleting" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 0", fontSize: 13, color: "#8A8579" }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #ECE7DD", borderTopColor: "#D4537E", animation: "lk-spin 0.8s linear infinite" }} />
                Suppression en cours…
              </div>
            )}
          </div>
        </section>

        {/* Déconnexion */}
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/connexion"); }}
          className="lk-p-ghost"
          style={{ ...sGhost, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", flex: "none" }}
        >
          <LogOut size={15} strokeWidth={2} /> Se déconnecter
        </button>

      </div>
    </div>
  );
}
