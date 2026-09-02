import { NextRequest, NextResponse } from "next/server";

// Rate limiter en mémoire (Map), pensé pour une instance unique.
// À remplacer par un store partagé (Redis/Upstash) si l'app tourne un jour sur
// plusieurs instances serverless en parallèle — chaque instance aurait sinon son
// propre compteur, ce qui rendrait la limite réelle plus permissive que prévu.

export type RateLimitTier = "auth" | "create" | "read";

const TIERS: Record<RateLimitTier, { max: number; windowMs: number }> = {
  auth:   { max: 5,  windowMs: 60_000 }, // connexion/inscription/mot de passe oublié — par IP
  create: { max: 20, windowMs: 60_000 }, // créer projet, candidater, envoyer message — par utilisateur
  read:   { max: 60, windowMs: 60_000 }, // liste projets, profils — par utilisateur
};

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Purge périodique des entrées expirées pour ne pas laisser la Map grossir indéfiniment.
let cleanupStarted = false;
function ensureCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60_000);
  interval.unref?.();
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export type RateLimitResult = { ok: true } | { ok: false; response: NextResponse };

/**
 * Vérifie et incrémente le compteur de requêtes pour ce (tier, identité).
 *
 * - "auth" : toujours limité par IP (aucun utilisateur connu avant authentification).
 * - "create" / "read" : limité par `userId` s'il est fourni (résolu après vérification
 *   du token dans la route appelante), sinon replié sur l'IP.
 *
 * À appeler en tout début de route handler, avant tout traitement coûteux :
 * ```ts
 * const limited = rateLimit(req, "create", user.id);
 * if (!limited.ok) return limited.response;
 * ```
 */
export function rateLimit(req: NextRequest, tier: RateLimitTier, userId?: string | null): RateLimitResult {
  ensureCleanup();

  const rule = TIERS[tier];
  const identity = tier === "auth" ? getIp(req) : (userId ?? getIp(req));
  const key = `${tier}:${identity}`;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + rule.windowMs };
    store.set(key, entry);
  }
  entry.count++;

  if (entry.count > rule.max) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Trop de requêtes. Réessaie dans quelques instants." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(rule.max),
            "X-RateLimit-Remaining": "0",
          },
        }
      ),
    };
  }

  return { ok: true };
}
