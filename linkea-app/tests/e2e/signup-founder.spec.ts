import { test, expect } from "@playwright/test";
import { testEmail, TEST_PASSWORD } from "./helpers/test-data";
import { dismissCookieBanner } from "./helpers/login";

test("un porteur de projet peut s'inscrire et arrive sur son espace", async ({ page }) => {
  const email = testEmail("founder");

  await dismissCookieBanner(page);
  await page.goto("/inscription");

  await page.getByText("Porteur de projet", { exact: true }).click();
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /créer mon compte/i }).click();

  // Inscription → complétion du profil (onboarding), avant d'arriver sur le dashboard
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  await page.getByPlaceholder("Jean Dupont").fill("Founder E2E Test");
  await page.getByRole("button", { name: /accéder à mon espace/i }).click();

  // Dashboard founder = page profil
  await expect(page).toHaveURL(/\/profil/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Founder E2E Test" })).toBeVisible();
});
