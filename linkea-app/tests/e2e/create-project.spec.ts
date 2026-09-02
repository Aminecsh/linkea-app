import { test, expect } from "@playwright/test";
import { supabaseAdmin } from "./helpers/supabase-admin";
import { testEmail, testProjectTitle, TEST_PASSWORD } from "./helpers/test-data";
import { loginViaUi } from "./helpers/login";

const email = testEmail("founder", "create-project");
const projectTitle = testProjectTitle("Dépôt de projet");

// Le compte founder est créé directement via l'API admin (setup, pas la partie testée) —
// seul le dépôt de projet lui-même est piloté par l'UI.
test.beforeAll(async () => {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Setup founder échoué: ${error?.message}`);

  await supabaseAdmin.from("user_roles").insert({ user_id: data.user.id, role: "founder" });
  await supabaseAdmin.from("profiles_founder").upsert(
    { user_id: data.user.id, email, nom: "Founder Dépôt E2E" },
    { onConflict: "user_id" }
  );
});

test("un founder connecté peut déposer un projet, qui apparaît sur son espace", async ({ page }) => {
  await loginViaUi(page, email, TEST_PASSWORD);

  await page.goto("/projets/nouveau");
  await page.getByRole("button", { name: /remplir moi-même/i }).click();

  await page.getByPlaceholder(/App de mise en relation/i).fill(projectTitle);
  await page.getByPlaceholder(/Décris ton projet/i).fill("Projet créé automatiquement par la suite de tests E2E Playwright.");
  await page.getByRole("button", { name: /^suivant/i }).click();

  const dateFin = new Date();
  dateFin.setDate(dateFin.getDate() + 30);
  const dateFinStr = dateFin.toISOString().slice(0, 10);
  await page.locator('input[type="date"]').last().fill(dateFinStr);

  await page.getByRole("button", { name: /soumettre mon projet/i }).click();

  // Redirection vers l'espace founder, avec le nouveau projet visible
  await expect(page).toHaveURL(/\/profil/, { timeout: 15_000 });
  await expect(page.getByText(projectTitle)).toBeVisible({ timeout: 10_000 });
});
