"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError("Une erreur est survenue. Vérifie l'adresse email.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/connexion" className="text-sm text-[#8A8579] hover:text-[#1A2138] transition-colors mb-6 inline-block">
            ← Retour
          </Link>
          <span className="label-tag bg-amber-50 text-amber-600 mb-4 inline-flex">
            Mot de passe oublié
          </span>
          <h1 className="text-3xl font-black text-[#1A2138] tracking-tight">
            Réinitialiser le mot de passe
          </h1>
          <p className="text-[#8A8579] mt-2">
            Saisis ton email et on t&apos;envoie un lien de réinitialisation.
          </p>
        </div>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <p className="text-2xl mb-3">📬</p>
            <p className="font-bold text-green-700 mb-1">Email envoyé !</p>
            <p className="text-sm text-green-600">
              Vérifie ta boîte mail et clique sur le lien pour choisir un nouveau mot de passe.
            </p>
            <Link href="/connexion" className="mt-4 inline-block text-sm text-[#8A8579] hover:text-[#1A2138] underline">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field"
            />

            {error && (
              <p className="text-sm text-[#D4537E] bg-white border border-[#D4537E] px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-pink w-full mt-2">
              {loading ? "Envoi en cours..." : "Envoyer le lien"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
