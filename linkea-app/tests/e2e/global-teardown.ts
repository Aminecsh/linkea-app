import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { E2E_PROJECT_TITLE_PREFIX, E2E_EMAIL_DOMAIN } from "./helpers/test-data";

// Charge .env.local — globalTeardown tourne dans un process Node à part, sans passer
// par playwright.config.ts (qui, lui, ne s'exécute que pour construire la config).
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * Nettoie TOUTES les données créées par les tests E2E — celles de cette exécution
 * et celles, orphelines, d'une exécution précédente interrompue avant son propre
 * nettoyage. Ne touche jamais rien d'autre : chaque suppression est filtrée soit sur
 * le préfixe de titre `[E2E ...]`, soit sur le domaine email `@e2e.linkea.test`,
 * qui ne peuvent apparaître que dans des données générées par ces tests.
 */
export default async function globalTeardown() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[e2e teardown] Variables Supabase manquantes — nettoyage ignoré.");
    return;
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as never },
  });
  const errors: string[] = [];
  const safe = async (label: string, fn: () => PromiseLike<unknown>) => {
    try { await fn(); } catch (e) { errors.push(`${label}: ${(e as Error).message}`); }
  };

  // 1. Projets de test (et tout ce qui en dépend)
  const { data: testProjects } = await admin
    .from("projects")
    .select("id")
    .like("titre", `${E2E_PROJECT_TITLE_PREFIX}%`);
  const projectIds = (testProjects ?? []).map((p) => p.id);

  if (projectIds.length > 0) {
    const { data: convs } = await admin.from("conversations").select("id").in("project_id", projectIds);
    const convIds = (convs ?? []).map((c) => c.id);
    if (convIds.length > 0) {
      await safe("messages (conversations)", () => admin.from("messages").delete().in("conversation_id", convIds));
    }
    await safe("candidatures (projets)", () => admin.from("candidatures").delete().in("project_id", projectIds));
    await safe("conversations (projets)", () => admin.from("conversations").delete().in("project_id", projectIds));
    await safe("projects", () => admin.from("projects").delete().in("id", projectIds));
  }

  // 2. Comptes de test (auth.users + profils + rôle), repérés par le domaine email réservé
  let page = 1;
  const testUserIds: string[] = [];
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data || data.users.length === 0) break;
    for (const u of data.users) {
      if (u.email?.endsWith(E2E_EMAIL_DOMAIN)) testUserIds.push(u.id);
    }
    if (data.users.length < 200) break;
    page++;
  }

  for (const userId of testUserIds) {
    const { data: fp } = await admin.from("profiles_founder").select("id").eq("user_id", userId).maybeSingle();
    const { data: dp } = await admin.from("profiles_developer").select("id").eq("user_id", userId).maybeSingle();

    if (dp) await safe(`candidatures(dev ${userId})`, () => admin.from("candidatures").delete().eq("developer_id", dp.id));

    if (fp || dp) {
      const orFilter = [fp ? `founder_id.eq.${fp.id}` : null, dp ? `developer_id.eq.${dp.id}` : null].filter(Boolean).join(",");
      const { data: convs } = await admin.from("conversations").select("id").or(orFilter);
      const convIds = (convs ?? []).map((c) => c.id);
      if (convIds.length > 0) {
        await safe(`messages(user ${userId})`, () => admin.from("messages").delete().in("conversation_id", convIds));
        await safe(`conversations(user ${userId})`, () => admin.from("conversations").delete().in("id", convIds));
      }
    }

    await safe(`profiles_founder(${userId})`, () => admin.from("profiles_founder").delete().eq("user_id", userId));
    await safe(`profiles_developer(${userId})`, () => admin.from("profiles_developer").delete().eq("user_id", userId));
    await safe(`user_roles(${userId})`, () => admin.from("user_roles").delete().eq("user_id", userId));
    await safe(`auth.users(${userId})`, () => admin.auth.admin.deleteUser(userId));
  }

  console.log(`[e2e teardown] ${projectIds.length} projet(s) et ${testUserIds.length} compte(s) de test supprimés.`);
  if (errors.length > 0) {
    console.warn("[e2e teardown] Erreurs non bloquantes :\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }
}
