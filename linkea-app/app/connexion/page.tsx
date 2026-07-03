"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Eye, EyeOff, AlertCircle } from "lucide-react";

const C = { ink: "#1A2138", rose: "#D4537E", muted: "#8A8579", hairline: "#ECE7DD", canvas: "#FAF8F4", surface: "#FFFFFF" };

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 16px", borderRadius: 10,
  border: `1.5px solid ${C.hairline}`, background: C.surface,
  fontSize: 14, color: C.ink, outline: "none",
  fontFamily: "system-ui, -apple-system, sans-serif",
  boxSizing: "border-box",
};

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirige silencieusement si session déjà active
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", session.user.id).single();
      const role = roleData?.role;
      if (role === "admin") router.push("/admin");
      else router.push("/projets");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !data.user) {
      setError(signInError?.message || "Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    logAudit(data.user.id, "login", { email });

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id).single();

    const role = roleData?.role;
    if (role === "admin") router.push("/admin");
    else if (role === "founder" || role === "developer") router.push("/projets");
    else router.push("/onboarding");
  }

  return (
    <>
      <div style={{ minHeight: "100vh", display: "flex", fontFamily: "system-ui, -apple-system, sans-serif" }}>

        {/* ── Panneau gauche : navy plein ── */}
        <div className="hidden lg:flex" style={{ width: "45%", background: C.ink, flexDirection: "column", justifyContent: "space-between", padding: "48px 56px" }}>

          <Link href="/" style={{ textDecoration: "none", display: "inline-block" }}>
            <Image src="/logo.png" alt="Linkea" width={74} height={34}
              style={{ objectFit: "contain", height: 34, width: "auto", filter: "brightness(0) invert(1)" }} priority />
          </Link>

          {/* Timeline Dépose → Match → Build — une seule chose */}
          <div>
            <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.15, margin: "0 0 52px" }}>
              Des projets qui<br />prennent vie
            </p>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { n: "01", label: "Dépose",  desc: "Décris ton projet en 5 min" },
                { n: "02", label: "Match",   desc: "Reçois des profils sous 48h" },
                { n: "03", label: "Build",   desc: "Construis avec ton dev" },
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

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>© 2026 Linkea</p>
        </div>

        {/* ── Panneau droit : formulaire ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px", background: C.canvas, position: "relative" }}>

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

          <div style={{ width: "100%", maxWidth: 360 }}>
            <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, fontWeight: 600, color: C.ink, letterSpacing: "-0.03em", margin: "0 0 8px", lineHeight: 1.1 }}>
              Content de te revoir
            </h1>
            <p style={{ fontSize: 14, color: C.muted, margin: "0 0 32px" }}>
              Connecte-toi à ton espace Linkea.
            </p>

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

              <div style={{ textAlign: "right", marginTop: -4 }}>
                <Link href="/mot-de-passe-oublie" style={{ fontSize: 12, color: C.muted, textDecoration: "none" }}>
                  Mot de passe oublié ?
                </Link>
              </div>

              <button type="submit" disabled={loading}
                style={{ padding: "14px", borderRadius: 10, background: C.ink, color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "opacity 0.2s" }}>
                {loading ? "Connexion…" : "Se connecter →"}
              </button>
            </form>

            <p style={{ textAlign: "center", fontSize: 14, color: C.muted, margin: "24px 0 0" }}>
              Pas encore de compte ?{" "}
              <Link href="/inscription" style={{ fontWeight: 700, color: C.rose, textDecoration: "none" }}>
                S&apos;inscrire
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
