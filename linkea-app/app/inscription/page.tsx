"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function Inscription() {
  const router = useRouter();
  const [role, setRole] = useState<"founder" | "developer" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

    await supabase.from("user_roles").insert({ user_id: data.user.id, role });

    router.push("/onboarding");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-6 inline-block">
            ← Retour
          </Link>
          <span className="label-tag bg-pink-50 text-pink-600 mb-4 inline-flex">
            Inscription
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Créer un compte
          </h1>
          <p className="text-slate-500 mt-2">Rejoins la plateforme Linkea.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Tu es :</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRole("founder")}
                className="flex-1 py-3 px-4 rounded-2xl border text-sm font-semibold transition-all duration-200"
                style={role === "founder" ? {
                  background: "linear-gradient(145deg, #be185d, #ec4899, #f472b6)",
                  color: "white",
                  border: "1px solid transparent",
                  boxShadow: "0 4px 16px rgba(236,72,153,0.3)"
                } : {
                  background: "white",
                  color: "#64748b",
                  border: "1px solid rgba(15,23,42,0.14)"
                }}
              >
                🚀 Founder
              </button>
              <button
                type="button"
                onClick={() => setRole("developer")}
                className="flex-1 py-3 px-4 rounded-2xl border text-sm font-semibold transition-all duration-200"
                style={role === "developer" ? {
                  background: "linear-gradient(145deg, #be185d, #ec4899, #f472b6)",
                  color: "white",
                  border: "1px solid transparent",
                  boxShadow: "0 4px 16px rgba(236,72,153,0.3)"
                } : {
                  background: "white",
                  color: "#64748b",
                  border: "1px solid rgba(15,23,42,0.14)"
                }}
              >
                💻 Développeur
              </button>
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
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input-field"
          />

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-pink w-full mt-2">
            {loading ? "Chargement..." : "Créer mon compte"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Déjà un compte ?{" "}
          <Link href="/connexion" className="text-pink-500 font-semibold hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
