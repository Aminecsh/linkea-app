"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NouveauProjet() {
  const router = useRouter();
  const [founderId, setFounderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    titre: "",
    description: "",
    stack_souhaitee: "",
    deadline: "",
  });

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData?.role !== "founder") {
        router.push("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles_founder")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        router.push("/onboarding");
        return;
      }

      setFounderId(profile.id);
      setLoading(false);
    }
    checkAccess();
  }, [router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!founderId) return;
    setSaving(true);
    setError("");

    const { error: dbError } = await supabase.from("projects").insert({
      founder_id: founderId,
      titre: form.titre,
      description: form.description,
      stack_souhaitee: form.stack_souhaitee,
      deadline: form.deadline,
      statut: "pending",
    });

    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }

    router.push("/profil");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <span className="label-tag bg-blue-50 text-blue-600 mb-4 inline-flex">
            Nouveau projet
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Dépose ton projet
          </h1>
          <p className="text-slate-500 mt-2">
            On trouve le dev qui correspond exactement à ton besoin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
              Titre du projet
            </label>
            <input
              name="titre"
              value={form.titre}
              onChange={handleChange}
              placeholder="Ex : App de mise en relation étudiants"
              required
              className="input-field"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Décris ton projet, le problème qu'il résout, les fonctionnalités clés..."
              rows={4}
              required
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
              Stack souhaitée
            </label>
            <input
              name="stack_souhaitee"
              value={form.stack_souhaitee}
              onChange={handleChange}
              placeholder="Ex : React, Node.js, Flutter, peu importe..."
              className="input-field"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
              Deadline souhaitée
            </label>
            <select
              name="deadline"
              value={form.deadline}
              onChange={handleChange}
              required
              className="input-field"
            >
              <option value="">Sélectionne une deadline</option>
              <option value="2 semaines">2 semaines</option>
              <option value="1 mois">1 mois</option>
              <option value="2 mois">2 mois</option>
              <option value="3 mois">3 mois</option>
              <option value="Flexible">Flexible</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <button type="submit" disabled={saving} className="btn-pink w-full mt-2">
            {saving ? "Envoi en cours..." : "Soumettre mon projet →"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/founder")}
            className="btn-ghost w-full"
          >
            Annuler
          </button>
        </form>
      </div>
    </div>
  );
}
