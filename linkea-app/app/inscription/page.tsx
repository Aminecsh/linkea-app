"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, AlertCircle, Rocket, Code2, Check } from "lucide-react";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#ECE7DD", canvas: "#FAF8F4", surface: "#FFFFFF" };

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 16px", borderRadius: 10,
  border: `1.5px solid ${C.hairline}`, background: C.surface,
  fontSize: 14, color: C.ink, outline: "none",
  fontFamily: "system-ui, -apple-system, sans-serif",
  boxSizing: "border-box",
};

const ROLES = [
  {
    value:  "founder" as const,
    label:  "Porteur de projet",
    icon:   Rocket,
    sub:    "Startup, PME, équipe interne ou projet perso",
    perks:  ["Déposez votre projet en 5 min", "Recevez des profils sous 48h", "Contrat généré automatiquement"],
  },
  {
    value:  "developer" as const,
    label:  "Développeur étudiant",
    icon:   Code2,
    sub:    "En école d'ingénieurs ou en formation dev",
    perks:  ["Trouvez un vrai projet à construire", "Montez votre portfolio concret", "Contrat de mission inclus"],
  },
] as const;

export default function Inscription() {
  const router = useRouter();
  const [role, setRole] = useState<"founder" | "developer" | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("role");
    if (p === "founder" || p === "developer") setRole(p);
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return setError("Choisis un profil pour continuer.");
    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !data.user) {
      setError(signUpError?.message || "Erreur lors de l'inscription.");
      setLoading(false);
      return;
    }

    const { error: roleError } = await supabase.from("user_roles").insert({ user_id: data.user.id, role });
    if (roleError) {
      setError("Erreur lors de l'enregistrement du rôle : " + roleError.message);
      setLoading(false);
      return;
    }

    router.push("/onboarding");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: "system-ui, -apple-system, sans-serif" }}>

        {/* ── Panneau gauche : navy plein ── */}
        <div className="hidden lg:flex" style={{ width: "45%", background: C.ink, flexDirection: "column", justifyContent: "space-between", padding: "48px 56px" }}>

          <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>
            <Image src="/logo.png" alt="Linkea" width={74} height={34}
              style={{ objectFit: "contain", height: 34, width: "auto", filter: "brightness(0) invert(1)" }} priority />
          </Link>

          <div>
            <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.15, margin: "0 0 52px" }}>
              Lancez votre projet<br />aujourd&apos;hui
            </p>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { n: "01", label: "Créez votre profil",      desc: "2 minutes" },
                { n: "02", label: "Décrivez votre projet",   desc: "Stack, deadline, contexte" },
                { n: "03", label: "Trouvez votre dev",       desc: "Sous 48h en moyenne" },
              ].map(({ n, label, desc }, i) => (
                <div key={n} style={{ display: "flex", gap: 20, paddingBottom: i < 2 ? 32 : 0, position: "relative" }}>
                  {i < 2 && <div style={{ position: "absolute", left: 14, top: 28, bottom: 0, width: 1, background: "rgba(255,255,255,0.12)" }} />}
                  <div style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>{n}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 3px" }}>{label}</p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>
            Déjà + de 87 développeurs actifs sur la plateforme
          </p>
        </div>

        {/* ── Panneau droit : formulaire ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px", background: C.canvas, overflowY: "auto", position: "relative" }}>

          {/* Retour accueil */}
          <Link href="/" style={{ position: "absolute", top: 24, left: 28, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.muted, textDecoration: "none" }}>
            ← Accueil
          </Link>

          {/* Logo mobile */}
          <div className="lg:hidden" style={{ marginBottom: 36 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <Image src="/logo.png" alt="Linkea" width={65} height={30} style={{ objectFit: "contain", height: 30, width: "auto" }} />
            </Link>
          </div>

          <div style={{ width: "100%", maxWidth: 380 }}>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 30, fontWeight: 600, color: C.ink, letterSpacing: "-0.03em", margin: "0 0 8px", lineHeight: 1.1 }}>
              Créer un compte
            </h1>
            <p style={{ fontSize: 14, color: C.muted, margin: "0 0 28px" }}>
              Rejoins la plateforme Linkea.
            </p>

            {/* Role selector — cards flat */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.ink, margin: "0 0 10px", letterSpacing: "0.01em" }}>Tu es :</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ROLES.map(({ value, label, icon: Icon, sub, perks }) => {
                  const active = role === value;
                  return (
                    <button key={value} type="button" onClick={() => setRole(value)}
                      style={{
                        width: "100%", textAlign: "left", cursor: "pointer",
                        padding: "16px 18px", borderRadius: 14,
                        background: C.surface,
                        border: active ? `2px solid ${C.rose}` : `1.5px solid ${C.hairline}`,
                        transition: "border-color 0.15s",
                        outline: "none",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: active ? 12 : 0 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: active ? "#FEF0F4" : "#F7F5F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                          <Icon size={16} strokeWidth={active ? 2 : 1.8} style={{ color: active ? C.rose : C.muted, transition: "color 0.15s" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>{label}</p>
                          <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0" }}>{sub}</p>
                        </div>
                        {/* Checkmark — scale rapide à la sélection */}
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%",
                          background: active ? C.rose : "transparent",
                          border: active ? "none" : `1.5px solid ${C.hairline}`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          transform: active ? "scale(1)" : "scale(0.85)",
                          transition: "transform 0.12s ease, background 0.12s",
                        }}>
                          {active && <Check size={11} strokeWidth={2.5} style={{ color: "#fff" }} />}
                        </div>
                      </div>

                      {/* Perks — visibles uniquement si actif */}
                      {active && (
                        <div style={{ paddingLeft: 46, display: "flex", flexDirection: "column", gap: 5 }}>
                          {perks.map((perk) => (
                            <p key={perk} style={{ fontSize: 12, color: C.muted, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                              <Check size={10} strokeWidth={2.5} style={{ color: C.rose, flexShrink: 0 }} />
                              {perk}
                            </p>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Champs */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="email" placeholder="Email" value={email}
                onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />

              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} placeholder="Mot de passe" value={password}
                  onChange={(e) => setPassword(e.target.value)} required
                  style={{ ...inputStyle, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, display: "flex" }}>
                  {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                </button>
              </div>

              {error && (
                <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FEF0F0", border: "1.5px solid #FCD0D0", color: "#C0392B", fontSize: 13 }}>
                  <AlertCircle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ padding: "14px", borderRadius: 10, background: C.ink, color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "opacity 0.2s", marginTop: 4 }}>
                {loading ? "Création en cours…" : "Créer mon compte →"}
              </button>
            </form>

            <p style={{ textAlign: "center", fontSize: 14, color: C.muted, margin: "24px 0 0" }}>
              Déjà un compte ?{" "}
              <Link href="/connexion" style={{ fontWeight: 700, color: C.rose, textDecoration: "none" }}>
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>
  );
}
