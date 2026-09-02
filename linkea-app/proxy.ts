import { NextRequest, NextResponse } from "next/server";

// In-memory rate limiter — fonctionne en single instance (dev + petite prod)
// Clé : "IP:route" → { count, resetAt }
const limits = new Map<string, { count: number; resetAt: number }>();

type RuleKey = "auth" | "api" | "support";

const RULES: Record<RuleKey, { max: number; windowMs: number }> = {
  auth:    { max: 8,  windowMs: 60_000  }, // 8 tentatives/min sur login/inscription
  api:     { max: 30, windowMs: 60_000  }, // 30 req/min sur les autres API
  support: { max: 20, windowMs: 60_000  }, // 20 req/min sur les routes support
};

function getRule(pathname: string): RuleKey | null {
  if (pathname.startsWith("/connexion") || pathname.startsWith("/inscription") || pathname.startsWith("/mot-de-passe")) return "auth";
  if (pathname.startsWith("/api/delete-account") || pathname.startsWith("/api/emails")) return "api";
  if (pathname.startsWith("/support")) return "support";
  return null;
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// La vitrine publique vit sur linkea.tech. Le sous-domaine app.linkea.tech
// ne doit servir que le produit (connexion, inscription, dashboard, etc.) —
// un visiteur qui atterrit sur la racine du sous-domaine app est redirigé
// vers la vitrine plutôt que de voir une ancienne landing dupliquée.
const MARKETING_SITE_URL = "https://linkea.tech";
const APP_HOSTS = new Set(["app.linkea.tech"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host")?.split(":")[0] ?? "";

  if (pathname === "/" && APP_HOSTS.has(host)) {
    return NextResponse.redirect(MARKETING_SITE_URL, 308);
  }

  const ruleKey = getRule(pathname);
  if (!ruleKey) return NextResponse.next();

  const rule = RULES[ruleKey];
  const ip = getIP(req);
  const key = `${ip}:${ruleKey}`;
  const now = Date.now();

  let entry = limits.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + rule.windowMs };
    limits.set(key, entry);
  }

  entry.count++;

  if (entry.count > rule.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Trop de requêtes, réessaie dans quelques secondes." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(rule.max),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(rule.max));
  res.headers.set("X-RateLimit-Remaining", String(rule.max - entry.count));
  return res;
}

export const config = {
  matcher: [
    "/",
    "/connexion",
    "/inscription",
    "/mot-de-passe-oublie",
    "/api/delete-account",
    "/api/emails",
    "/support/:path*",
  ],
};
