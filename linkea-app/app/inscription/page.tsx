"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ArrowLeft, AlertCircle, ArrowRight, Rocket, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Inscription() {
  const router = useRouter();
  const [role, setRole] = useState<"founder" | "developer" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return setError("Choisis un rôle pour continuer.");
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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--bg)" }}
    >
      {/* Ambient blob */}
      <div
        className="fixed -top-20 -left-20 w-96 h-96 rounded-full pointer-events-none opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(244,63,94,0.20) 0%, transparent 70%)",
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
            <span className="tag tag-rose mb-4 inline-flex">Inscription</span>
            <h1 className="text-3xl font-black tracking-tight leading-tight mb-2" style={{ color: "var(--text)" }}>
              Créer un compte
            </h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>Rejoins la plateforme Linkea.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* Role selector */}
            <div>
              <p className="text-xs font-bold mb-2.5" style={{ color: "var(--muted)" }}>Tu es :</p>
              <div className="flex gap-2.5">
                {([
                  { value: "founder", label: "Founder", icon: Rocket, color: "rose" },
                  { value: "developer", label: "Dev", icon: Code2, color: "blue" },
                ] as const).map(({ value, label, icon: Icon, color }) => {
                  const active = role === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={cn("flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-sm font-semibold transition-all duration-200")}
                      style={active ? {
                        background: `linear-gradient(135deg, ${color === "rose" ? "#f43f5e, #fb7185" : "#3b82f6, #60a5fa"})`,
                        color: "white",
                        border: "1px solid transparent",
                        boxShadow: color === "rose" ? "var(--shadow-rose)" : "var(--shadow-blue)",
                      } : {
                        background: "rgba(255,255,255,0.70)",
                        color: "var(--muted)",
                        border: "1px solid var(--border-2)",
                      }}
                    >
                      <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

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

            <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
              {loading ? (
                <span className="spinner" style={{ width: 17, height: 17, borderWidth: 2 }} />
              ) : (
                <>Créer mon compte <ArrowRight size={15} strokeWidth={2.2} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "var(--muted)" }}>
          Déjà un compte ?{" "}
          <Link href="/connexion" className="font-bold transition-opacity hover:opacity-70" style={{ color: "var(--rose)" }}>
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
