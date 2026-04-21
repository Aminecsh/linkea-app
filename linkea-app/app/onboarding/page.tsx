"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Onboarding() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    nom: "",
    ecole: "",
    description_idee: "",
    besoin_tech: "",
    budget: "",
    linkedin: "",
    competences: "",
    dispo_heures_semaine: "",
    github: "",
  });

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data?.role) {
        setError("Rôle introuvable. Réessaie de t'inscrire.");
        setLoading(false);
        return;
      }

      setRole(data.role);
      setLoading(false);
    }
    loadRole();
  }, [router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (role === "founder") {
      const { error: dbError } = await supabase.from("profiles_founder").insert({
        user_id: user.id,
        email: user.email,
        nom: form.nom,
        ecole: form.ecole,
        description_idee: form.description_idee,
        besoin_tech: form.besoin_tech,
        budget: form.budget,
        linkedin: form.linkedin,
      });
      if (dbError) { setError(dbError.message); setSaving(false); return; }
      router.push("/projets");
    } else if (role === "developer") {
      const competencesArray = form.competences.split(",").map((c) => c.trim()).filter(Boolean);
      const { error: dbError } = await supabase.from("profiles_developer").insert({
        user_id: user.id,
        email: user.email,
        nom: form.nom,
        ecole: form.ecole,
        competences: competencesArray,
        dispo_heures_semaine: parseInt(form.dispo_heures_semaine) || null,
        github: form.github,
        linkedin: form.linkedin,
      });
      if (dbError) { setError(dbError.message); setSaving(false); return; }
      router.push("/projets");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <span className="label-tag bg-pink-50 text-pink-600 mb-4 inline-flex">
            {role === "founder" ? "Founder" : "Développeur"}
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Complète ton profil
          </h1>
          <p className="text-slate-500 mt-2">
            Ces infos nous aident à trouver le meilleur match pour toi.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Nom complet</label>
            <input name="nom" value={form.nom} onChange={handleChange} placeholder="Jean Dupont" required className="input-field" />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">École</label>
            <input name="ecole" value={form.ecole} onChange={handleChange} placeholder="HEC, Epitech, 42..." className="input-field" />
          </div>

          {role === "founder" && (
            <>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Décris ton idée</label>
                <textarea
                  name="description_idee"
                  value={form.description_idee}
                  onChange={handleChange}
                  placeholder="Une plateforme qui permet de..."
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Besoin technique</label>
                <input name="besoin_tech" value={form.besoin_tech} onChange={handleChange} placeholder="App mobile, web app, API..." className="input-field" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Budget</label>
                <select name="budget" value={form.budget} onChange={handleChange} className="input-field">
                  <option value="">Sélectionne un budget</option>
                  <option value="0-500€">0 – 500€</option>
                  <option value="500-1500€">500 – 1500€</option>
                  <option value="1500-3000€">1500 – 3000€</option>
                  <option value="3000€+">3000€ +</option>
                </select>
              </div>
            </>
          )}

          {role === "developer" && (
            <>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Compétences <span className="text-slate-400 font-normal">(séparées par des virgules)</span></label>
                <input name="competences" value={form.competences} onChange={handleChange} placeholder="React, Node.js, Flutter..." className="input-field" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Disponibilité (heures/semaine)</label>
                <input name="dispo_heures_semaine" type="number" value={form.dispo_heures_semaine} onChange={handleChange} placeholder="10" min={1} max={40} className="input-field" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">GitHub</label>
                <input name="github" value={form.github} onChange={handleChange} placeholder="https://github.com/..." className="input-field" />
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1.5 block">LinkedIn</label>
            <input name="linkedin" value={form.linkedin} onChange={handleChange} placeholder="https://linkedin.com/in/..." className="input-field" />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
          )}

          <button type="submit" disabled={saving} className="btn-pink w-full mt-2">
            {saving ? "Enregistrement..." : "Accéder à mon espace →"}
          </button>
        </form>
      </div>
    </div>
  );
}
