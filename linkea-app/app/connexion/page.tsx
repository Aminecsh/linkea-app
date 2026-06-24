"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { Eye, EyeOff, ArrowLeft, AlertCircle, ArrowRight } from "lucide-react";

export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--bg)" }}
    >
      {/* Ambient blob */}
      <div
        className="fixed top-0 right-0 w-80 h-80 rounded-full pointer-events-none opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-8 transition-opacity hover:opacity-60"
          style={{ color: "var(--muted)" }}
        >
          <ArrowLeft size={14} strokeWidth={2} /> Accueil
        </Link>

        {/* Card */}
        <div className="card p-8">
          <div className="mb-7">
            <span className="tag tag-blue mb-4 inline-flex">Connexion</span>
            <h1 className="text-3xl font-black tracking-tight leading-tight mb-2" style={{ color: "var(--text)" }}>
              Content de te revoir
            </h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>Connecte-toi à ton espace Linkea.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60"
                style={{ color: "var(--subtle)" }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
              </button>
            </div>

            {error && (
              <div
                className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-sm"
                style={{
                  background: "var(--red-soft)",
                  border: "1px solid var(--red-border)",
                  color: "var(--red)",
                }}
              >
                <AlertCircle size={15} strokeWidth={2} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="text-right -mt-1">
              <Link
                href="/mot-de-passe-oublie"
                className="text-xs font-medium transition-opacity hover:opacity-60"
                style={{ color: "var(--muted)" }}
              >
                Mot de passe oublié ?
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
              {loading ? (
                <span className="spinner" style={{ width: 17, height: 17, borderWidth: 2 }} />
              ) : (
                <>Se connecter <ArrowRight size={15} strokeWidth={2.2} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "var(--muted)" }}>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-bold transition-opacity hover:opacity-70" style={{ color: "var(--rose)" }}>
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}
