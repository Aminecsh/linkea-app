import { Page, expect } from "@playwright/test";

// Le bandeau cookies (fixed, en bas de l'écran) intercepte les clics tant qu'aucun
// choix n'a été enregistré — on le pré-accepte pour ne pas polluer chaque test.
export async function dismissCookieBanner(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("cookie_consent", "accepted");
  });
}

export async function loginViaUi(page: Page, email: string, password: string) {
  await dismissCookieBanner(page);
  await page.goto("/connexion");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  // La page redirige selon le rôle (/profil, /projets…) — on attend juste de quitter /connexion.
  await expect(page).not.toHaveURL(/\/connexion/, { timeout: 15_000 });
}
