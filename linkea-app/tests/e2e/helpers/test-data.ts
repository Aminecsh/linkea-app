// Génère des identités de test clairement marquées, pour ne jamais pouvoir être
// confondues avec de vraies données et pour être facilement nettoyables ensuite.
//
// - Domaine email `@e2e.linkea.test` : réservé RFC 2606 (.test), ne délivre jamais
//   de vrai courrier, ne peut jamais collisionner avec un vrai compte utilisateur.
// - Préfixe `[E2E ${RUN_ID}]` sur les titres de projet : identifiable sans ambiguïté
//   par le nettoyage (global-teardown.ts), scopé à cette exécution de tests.

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function testRunId() {
  return RUN_ID;
}

export function testEmail(role: "founder" | "developer", label = "") {
  const suffix = label ? `-${label}` : `-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return `pw-e2e-${RUN_ID}-${role}${suffix}@e2e.linkea.test`;
}

export const TEST_PASSWORD = "PlaywrightE2E!2026";

export function testProjectTitle(label: string) {
  return `[E2E ${RUN_ID}] ${label}`;
}

// Préfixe reconnu par le teardown pour repérer (et supprimer) tout projet de test,
// même issu d'une exécution précédente qui aurait planté avant son propre nettoyage.
export const E2E_PROJECT_TITLE_PREFIX = "[E2E ";
export const E2E_EMAIL_DOMAIN = "@e2e.linkea.test";
