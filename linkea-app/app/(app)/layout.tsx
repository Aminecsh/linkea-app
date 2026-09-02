import AppNav from "@/components/AppNav";

// Layout partagé par toutes les pages produit (projets, devs, messages,
// wallet, paramètres, contrat, profil…). La sidebar/bottom-nav vit ici, une
// seule fois pour toute la section — elle ne se démonte plus entre deux
// pages : plus de rechargement de son propre state (rôle, projets actifs,
// badge de messages non lus) à chaque navigation, et sa position `fixed`
// reste stable puisqu'elle n'est plus imbriquée dans le contenu de chaque
// page (voir components/PageTransition.tsx pour le pourquoi de cette
// séparation — un ancêtre animé avec un transform casserait sa position).
//
// Les pages qui ne veulent volontairement pas de sidebar (paiement, review,
// admin, onboarding…) restent en dehors de ce groupe de routes — un groupe
// de routes (parenthèses) n'apparaît pas dans l'URL, donc /projets reste
// /projets même si son fichier est maintenant dans app/(app)/projets/.
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
