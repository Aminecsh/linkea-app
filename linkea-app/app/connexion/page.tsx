"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .single();

    const role = roleData?.role;

    if (role === "admin") router.push("/admin");
    else if (role === "founder" || role === "developer") router.push("/projets");
    else router.push("/onboarding");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors mb-6 inline-block">
            ← Retour
          </Link>
          <span className="label-tag bg-blue-50 text-blue-600 mb-4 inline-flex">
            Connexion
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Content de te revoir
          </h1>
          <p className="text-slate-500 mt-2">Connecte-toi à ton espace Linkea.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              className="input-field pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-pink w-full mt-2">
            {loading ? "Chargement..." : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="text-pink-500 font-semibold hover:underline">
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}
