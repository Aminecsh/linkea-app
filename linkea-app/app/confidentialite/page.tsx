import Link from "next/link";

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-[#8A8579] hover:text-[#1A2138] mb-8 inline-block">← Retour</Link>

        <h1 className="text-3xl font-black text-[#1A2138] mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-[#8A8579] mb-10">Dernière mise à jour : juin 2026</p>

        <div className="prose prose max-w-none space-y-8 text-sm text-[#1A2138] leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">1. Qui sommes-nous ?</h2>
            <p>Linkea est une plateforme de mise en relation entre fondateurs de startups et développeurs freelances. Responsable du traitement : Linkea SAS (France).</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">2. Données collectées</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Informations de compte : email, mot de passe chiffré</li>
              <li>Informations de profil : nom, photo, bio, compétences, expériences</li>
              <li>Données de projet : titre, description, stack, deadline</li>
              <li>Messagerie : contenu des échanges entre utilisateurs</li>
              <li>Logs techniques : connexions, actions de sécurité (audit logs)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">3. Finalités du traitement</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fourniture du service de mise en relation</li>
              <li>Sécurité et prévention des abus</li>
              <li>Amélioration de la plateforme</li>
              <li>Respect des obligations légales</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">4. Base légale</h2>
            <p>Le traitement de tes données est fondé sur l'exécution du contrat (CGU) et, le cas échéant, ton consentement explicite.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">5. Conservation des données</h2>
            <p>Tes données sont conservées pendant la durée de ton compte actif, puis supprimées dans un délai de 30 jours après la clôture du compte, sauf obligation légale contraire.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">6. Partage des données</h2>
            <p>Tes données ne sont jamais vendues. Elles peuvent être partagées avec :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Supabase (hébergement base de données — UE)</li>
              <li>Vercel (hébergement application — UE)</li>
              <li>Resend (envoi d'emails transactionnels)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">7. Tes droits (RGPD)</h2>
            <p>Tu disposes des droits suivants, exerçables depuis les <Link href="/parametres" className="text-[#1A2138] underline">paramètres de ton compte</Link> :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Accès</strong> : télécharger toutes tes données (format JSON)</li>
              <li><strong>Rectification</strong> : modifier ton profil à tout moment</li>
              <li><strong>Suppression</strong> : supprimer définitivement ton compte</li>
              <li><strong>Portabilité</strong> : export JSON disponible dans les paramètres</li>
            </ul>
            <p className="mt-3">Pour toute demande : <a href="mailto:privacy@linkea.fr" className="text-[#1A2138] underline">privacy@linkea.fr</a></p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">8. Cookies</h2>
            <p>Linkea utilise uniquement des cookies essentiels au fonctionnement de la plateforme (authentification, préférences). Aucun cookie publicitaire ou de tracking tiers n'est utilisé.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">9. Sécurité</h2>
            <p>Tes données sont protégées par chiffrement en transit (HTTPS) et au repos. L'authentification double facteur (2FA) est disponible dans les paramètres.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">10. Contact & réclamation</h2>
            <p>Pour toute question : <a href="mailto:privacy@linkea.fr" className="text-[#1A2138] underline">privacy@linkea.fr</a></p>
            <p className="mt-2">Tu peux également introduire une réclamation auprès de la <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-[#1A2138] underline">CNIL</a>.</p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-[#ECE7DD] flex gap-4 text-xs text-[#8A8579]">
          <Link href="/cgu" className="hover:text-[#1A2138]">Conditions générales</Link>
          <Link href="/parametres" className="hover:text-[#1A2138]">Mes paramètres</Link>
        </div>
      </div>
    </div>
  );
}
