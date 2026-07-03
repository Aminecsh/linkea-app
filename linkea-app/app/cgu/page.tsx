import Link from "next/link";

export default function CguPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-[#8A8579] hover:text-[#1A2138] mb-8 inline-block">← Retour</Link>

        <h1 className="text-3xl font-black text-[#1A2138] mb-2">Conditions Générales d'Utilisation</h1>
        <p className="text-sm text-[#8A8579] mb-10">Dernière mise à jour : juin 2026</p>

        <div className="space-y-8 text-sm text-[#1A2138] leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">1. Objet</h2>
            <p>Les présentes CGU régissent l'utilisation de la plateforme Linkea, service de mise en relation entre fondateurs de startups et développeurs freelances.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">2. Accès au service</h2>
            <p>L'accès à Linkea est réservé aux personnes majeures. L'inscription crée un compte personnel non transférable. L'utilisateur est responsable de la confidentialité de ses identifiants.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">3. Rôles utilisateurs</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Founder</strong> : peut créer des projets, rechercher des développeurs et initier des mises en relation</li>
              <li><strong>Developer</strong> : peut postuler à des projets et être contacté par des founders</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">4. Comportement attendu</h2>
            <p>L'utilisateur s'engage à :</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Fournir des informations exactes sur son profil</li>
              <li>Ne pas usurper l'identité d'un tiers</li>
              <li>Respecter les autres utilisateurs dans les échanges</li>
              <li>Ne pas utiliser la plateforme à des fins frauduleuses ou illégales</li>
              <li>Ne pas tenter de contourner les systèmes de sécurité</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">5. Contenu utilisateur</h2>
            <p>L'utilisateur conserve la propriété de son contenu (profil, messages, projets). Il accorde à Linkea une licence non exclusive pour afficher ce contenu sur la plateforme. Linkea se réserve le droit de supprimer tout contenu contraire aux présentes CGU.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">6. Sanctions</h2>
            <p>En cas de manquement aux présentes CGU, Linkea peut :</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Avertir l'utilisateur par messagerie</li>
              <li>Suspendre temporairement le compte</li>
              <li>Bannir définitivement le compte</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">7. Responsabilité</h2>
            <p>Linkea est un intermédiaire technique. La plateforme ne garantit pas la qualité des livrables ou le bon déroulement des collaborations. Linkea ne saurait être tenue responsable des litiges entre founders et développeurs.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">8. Modification des CGU</h2>
            <p>Linkea se réserve le droit de modifier les présentes CGU. Les utilisateurs seront informés par email de toute modification substantielle. La poursuite de l'utilisation vaut acceptation des nouvelles conditions.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">9. Droit applicable</h2>
            <p>Les présentes CGU sont soumises au droit français. Tout litige relève de la compétence des tribunaux de Paris.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A2138] mb-3">10. Contact</h2>
            <p>Pour toute question : <a href="mailto:contact@linkea.fr" className="text-[#1A2138] underline">contact@linkea.fr</a></p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-[#ECE7DD] flex gap-4 text-xs text-[#8A8579]">
          <Link href="/confidentialite" className="hover:text-[#1A2138]">Politique de confidentialité</Link>
          <Link href="/parametres" className="hover:text-[#1A2138]">Mes paramètres</Link>
        </div>
      </div>
    </div>
  );
}
