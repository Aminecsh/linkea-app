import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function fetchPublicProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*, budget, profiles_founder(nom, ecole, email, user_id, avatar_url)")
    .eq("statut", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Feed public des projets ouverts aux candidatures : identique pour tous les devs qui
// parcourent /projets → cache 2 min (pas de revalidation à la demande, la fraîcheur
// à 2 min près est acceptable pour ce listing).
const getCachedPublicProjects = unstable_cache(
  fetchPublicProjects,
  ["projets-public"],
  { revalidate: 120, tags: ["projets-public"] }
);

export async function GET(req: NextRequest) {
  // Contournement du cache réservé aux tests E2E (headers non standards, jamais
  // envoyés par l'app réelle) — n'a d'effet que si E2E_BYPASS_SECRET est défini
  // localement ; absent en production, donc désactivé par défaut.
  const bypassSecret = process.env.E2E_BYPASS_SECRET;
  const bypassHeader = req.headers.get("x-e2e-bypass-cache");
  const bypass = !!bypassSecret && bypassHeader === bypassSecret;

  const projects = bypass ? await fetchPublicProjects() : await getCachedPublicProjects();

  return NextResponse.json(
    { projects },
    { headers: bypass ? {} : { "Cache-Control": "public, max-age=120, stale-while-revalidate=60" } }
  );
}
