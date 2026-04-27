"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";

type Dev = {
  id: string;
  nom: string;
  ecole?: string;
  competences?: string[];
  dispo_heures_semaine?: number;
  github?: string;
  linkedin?: string;
  user_id: string;
  score?: number;
  reviewCount?: number;
};

type Project = {
  id: string;
  titre: string;
  statut: string;
};

export default function DevsPage() {
  const router = useRouter();
  const [devs, setDevs] = useState<Dev[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pins, setPins] = useState<Set<string>>(new Set()); // developer_id des devs déjà pinnés pour le projet sélectionné
  const [pinCount, setPinCount] = useState(0);
  const [founderId, setFounderId] = useState<string | null>(null);
  const [pinning, setPinning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "founder") { router.push("/projets"); return; }

      const { data: profile } = await supabase
        .from("profiles_founder").select("id").eq("user_id", user.id).maybeSingle();
      if (!profile) { router.push("/onboarding"); return; }
      setFounderId(profile.id);

      // Projets du founder (pending ou matched — pas livré)
      const { data: projs } = await supabase
        .from("projects")
        .select("id, titre, statut")
        .eq("founder_id", profile.id)
        .in("statut", ["pending", "matched", "en_cours"])
        .order("created_at", { ascending: false });
      const projList = (projs as Project[]) ?? [];
      setProjects(projList);
      if (projList.length > 0) setSelectedProjectId(projList[0].id);

      // Tous les devs
      const { data: devsData } = await supabase
        .from("profiles_developer")
        .select("id, nom, ecole, competences, dispo_heures_semaine, github, linkedin, user_id")
        .order("created_at", { ascending: false });

      // Score moyen par dev
      const devsWithScore = await Promise.all((devsData ?? []).map(async (d) => {
        const { data: reviews } = await supabase
          .from("reviews").select("rating").eq("reviewed_id", d.user_id);
        const score = reviews && reviews.length > 0
          ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10
          : undefined;
        return { ...d, score, reviewCount: reviews?.length ?? 0 };
      }));

      setDevs(devsWithScore);
      setLoading(false);
    }
    load();
  }, [router]);

  // Charge les pins du projet sélectionné
  useEffect(() => {
    async function loadPins() {
      if (!selectedProjectId) return;
      const { data } = await supabase
        .from("pins")
        .select("developer_id")
        .eq("project_id", selectedProjectId);
      const pinSet = new Set((data ?? []).map((p) => p.developer_id));
      setPins(pinSet);
      setPinCount(pinSet.size);
    }
    loadPins();
  }, [selectedProjectId]);

  async function handlePin(dev: Dev) {
    if (!selectedProjectId || !founderId || pinning) return;
    setPinning(dev.id);

    const { error } = await supabase.from("pins").insert({
      project_id: selectedProjectId,
      founder_id: founderId,
      developer_id: dev.id,
    });

    if (!error) {
      setPins((prev) => new Set([...prev, dev.id]));
      setPinCount((prev) => prev + 1);

      // Notif au dev
      const projet = projects.find((p) => p.id === selectedProjectId);
      await supabase.from("notifications").insert({
        user_id: dev.user_id,
        type: "pin",
        title: "Un founder s'intéresse à toi 📌",
        body: `Pour le projet "${projet?.titre}" — candidate si ça t'intéresse !`,
        link: `/projets/${selectedProjectId}`,
      });
    }

    setPinning(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pink-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  const pinsLeft = 3 - pinCount;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-500">Linkea</p>
            <NotificationBell />
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-3">Trouver un dev</h1>

          {projects.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
              Tu n'as aucun projet actif. Dépose un projet d'abord.
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {/* Sélecteur de projet */}
              {projects.length > 1 ? (
                <select
                  value={selectedProjectId ?? ""}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="input-field text-sm py-2 flex-1"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.titre}</option>
                  ))}
                </select>
              ) : (
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 truncate">
                  📋 {selectedProject?.titre}
                </div>
              )}

              {/* Pins restants */}
              <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold shrink-0 ${
                pinsLeft === 0 ? "bg-slate-100 border-slate-200 text-slate-400" : "bg-pink-50 border-pink-200 text-pink-600"
              }`}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`text-base ${i < pinsLeft ? "opacity-100" : "opacity-20"}`}>📌</span>
                ))}
                <span className="ml-1">{pinsLeft}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
        {devs.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-400 text-sm">Aucun développeur inscrit pour l'instant.</p>
          </div>
        )}

        {devs.map((dev) => {
          const isPinned = pins.has(dev.id);
          const canPin = !isPinned && pinsLeft > 0 && projects.length > 0;
          return (
            <div key={dev.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-black shrink-0">
                  {dev.nom?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900">{dev.nom}</h3>
                      {dev.ecole && <p className="text-xs text-slate-400">{dev.ecole}</p>}
                    </div>
                    {dev.score !== undefined && (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-amber-400 text-sm">★</span>
                        <span className="text-xs font-bold text-slate-700">{dev.score}</span>
                        <span className="text-xs text-slate-400">({dev.reviewCount})</span>
                      </div>
                    )}
                  </div>

                  {dev.competences && dev.competences.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 my-2">
                      {dev.competences.map((c) => (
                        <span key={c} className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-3 text-xs text-slate-400">
                      {dev.dispo_heures_semaine && <span>⏱ {dev.dispo_heures_semaine}h/sem</span>}
                      {dev.github && (
                        <a href={dev.github} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                          GitHub ↗
                        </a>
                      )}
                      {dev.linkedin && (
                        <a href={dev.linkedin} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                          LinkedIn ↗
                        </a>
                      )}
                    </div>

                    <button
                      onClick={() => canPin && handlePin(dev)}
                      disabled={!canPin || pinning === dev.id}
                      className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all shrink-0 ${
                        isPinned
                          ? "bg-pink-50 text-pink-500 border-pink-200 cursor-default"
                          : canPin
                          ? "bg-white text-slate-600 border-slate-200 hover:border-pink-300 hover:text-pink-500"
                          : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                      }`}
                    >
                      {pinning === dev.id ? "..." : isPinned ? "📌 Pinné" : "📌 Pinner"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}
