import { test, expect } from "@playwright/test";
import { supabaseAdmin } from "./helpers/supabase-admin";
import { testEmail, testProjectTitle, TEST_PASSWORD } from "./helpers/test-data";
import { loginViaUi } from "./helpers/login";

const devEmail = testEmail("developer", "apply");
const founderEmail = testEmail("founder", "apply-seed");
const projectTitle = testProjectTitle("Projet à candidater");

// Setup direct en base (pas la partie testée) : un founder, un projet public "pending",
// et un dev — seule la candidature elle-même est pilotée par l'UI.
test.beforeAll(async () => {
  const { data: dev, error: devErr } = await supabaseAdmin.auth.admin.createUser({
    email: devEmail, password: TEST_PASSWORD, email_confirm: true,
  });
  if (devErr || !dev.user) throw new Error(`Setup dev échoué: ${devErr?.message}`);
  await supabaseAdmin.from("user_roles").insert({ user_id: dev.user.id, role: "developer" });
  await supabaseAdmin.from("profiles_developer").upsert(
    { user_id: dev.user.id, email: devEmail, nom: "Dev Candidature E2E" },
    { onConflict: "user_id" }
  );

  const { data: founder, error: founderErr } = await supabaseAdmin.auth.admin.createUser({
    email: founderEmail, password: TEST_PASSWORD, email_confirm: true,
  });
  if (founderErr || !founder.user) throw new Error(`Setup founder échoué: ${founderErr?.message}`);
  const { data: founderProfile, error: fpErr } = await supabaseAdmin
    .from("profiles_founder")
    .upsert({ user_id: founder.user.id, email: founderEmail, nom: "Founder Seed E2E" }, { onConflict: "user_id" })
    .select("id")
    .single();
  if (fpErr || !founderProfile) throw new Error(`Setup profil founder échoué: ${fpErr?.message}`);

  const { error: projErr } = await supabaseAdmin.from("projects").insert({
    founder_id: founderProfile.id,
    titre: projectTitle,
    description: "Projet semé directement en base pour tester le parcours de candidature E2E.",
    stack_souhaitee: "React, Node.js",
    deadline: "Avant le 31 décembre 2026",
    statut: "pending",
    budget: 500,
  });
  if (projErr) throw new Error(`Setup projet échoué: ${projErr.message}`);
});

test("un développeur peut candidater à un projet du feed, puis le retrouver dans son suivi", async ({ page }) => {
  // Le feed public est caché 2 min côté serveur — on contourne le cache pour ce test
  // afin de voir immédiatement le projet semé dans beforeAll (comportement normal des
  // vrais utilisateurs : ils voient le feed avec jusqu'à 2 min de délai, pas un bug).
  const bypassSecret = process.env.E2E_BYPASS_SECRET;
  if (bypassSecret) {
    await page.route("**/api/projets/public", async (route) => {
      await route.continue({ headers: { ...route.request().headers(), "x-e2e-bypass-cache": bypassSecret } });
    });
  }

  await loginViaUi(page, devEmail, TEST_PASSWORD);

  await page.goto("/projets");
  await page.locator(".card", { hasText: projectTitle }).first().click();
  await page.getByRole("button", { name: /candidater à ce projet/i }).click();

  await expect(page.getByText(/candidature envoyée/i)).toBeVisible({ timeout: 10_000 });

  // Suivi des candidatures = page profil du dev
  await page.goto("/profil");
  await expect(page.getByText(projectTitle)).toBeVisible({ timeout: 10_000 });
});
