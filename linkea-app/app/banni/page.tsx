"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Ban = {
  type: "temp" | "permanent";
  raison: string;
  expires_at: string | null;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function BanniPage() {
  const router = useRouter();
  const [ban, setBan] = useState<Ban | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/connexion"); return; }

      const now = new Date().toISOString();
      const { data } = await supabase
        .from("bans")
        .select("type, raison, expires_at, created_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        // Pas de ban actif → retour à l'accueil
        router.push("/");
        return;
      }
      setBan(data as Ban);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/connexion");
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
    </div>
  );

  if (!ban) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">

        {/* Card principale */}
        <div className="bg-white rounded-3xl border-2 border-red-100 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 py-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4 text-4xl">
              {ban.type === "permanent" ? "🚫" : "⏸"}
            </div>
            <h1 className="text-2xl font-black text-white">
              {ban.type === "permanent" ? "Compte banni" : "Compte suspendu"}
            </h1>
            <p className="text-red-100 text-sm mt-1">
              {ban.type === "permanent" ? "Ton accès à Linkea a été révoqué." : "Ton accès est temporairement bloqué."}
            </p>
          </div>

          <div className="px-6 py-6 flex flex-col gap-4">
            <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
              <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">Raison</p>
              <p className="text-sm font-semibold text-red-800">{ban.raison}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs text-slate-400 mb-1">Décision le</p>
                <p className="text-xs font-semibold text-slate-700">{fmtDate(ban.created_at)}</p>
              </div>
              <div className={`rounded-xl p-3 border ${ban.type === "permanent" ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                <p className={`text-xs mb-1 ${ban.type === "permanent" ? "text-red-400" : "text-amber-500"}`}>Levée le</p>
                <p className={`text-xs font-semibold ${ban.type === "permanent" ? "text-red-700" : "text-amber-700"}`}>
                  {ban.type === "permanent" ? "Jamais" : ban.expires_at ? fmtDate(ban.expires_at) : "—"}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-sm text-slate-500 leading-relaxed">
              Si tu penses que cette décision est une erreur, contacte-nous à{" "}
              <a href="mailto:support@linkea.fr" className="text-pink-500 font-semibold hover:underline">
                support@linkea.fr
              </a>
            </div>

            <button onClick={handleLogout} className="btn-ghost w-full py-3 text-sm">
              Se déconnecter
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">Linkea · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
