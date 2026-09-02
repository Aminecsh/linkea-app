import { test, expect } from "@playwright/test";
import { testEmail, TEST_PASSWORD } from "./helpers/test-data";
import { dismissCookieBanner } from "./helpers/login";

test("un développeur peut s'inscrire et arrive sur son espace", async ({ page }) => {
  const email = testEmail("developer");

  await dismissCookieBanner(page);
  await page.goto("/inscription");

  await page.getByText("Développeur étudiant", { exact: true }).click();
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /créer mon compte/i }).click();

  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  await page.getByPlaceholder("Jean Dupont").fill("Dev E2E Test");
  await page.getByRole("button", { name: /accéder à mon espace/i }).click();

  // Dashboard dev = feed des projets
  await expect(page).toHaveURL(/\/projets/, { timeout: 15_000 });
});
