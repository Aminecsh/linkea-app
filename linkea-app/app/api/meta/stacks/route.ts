import { NextResponse } from "next/server";
import { STACKS } from "@/lib/constants/catalog";

// Données statiques (en dur, pas de DB derrière) — cache navigateur/CDN 1h,
// avec 1h supplémentaire de tolérance pendant la revalidation en arrière-plan.
export async function GET() {
  return NextResponse.json(
    { stacks: STACKS },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=3600" } }
  );
}
