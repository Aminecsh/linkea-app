"use client";

// Transition d'entrée de page — unique dans toute l'app, volontairement discrète.
// Fade + léger slide vertical, ~220ms easeOut. Respecte prefers-reduced-motion :
// dans ce cas on garde juste l'apparition (opacity) sans mouvement.
//
// Volontairement local à la page (pas dans app/layout.tsx) : la sidebar (AppNav)
// est en `position: fixed` et rendue à l'intérieur de chaque page plutôt que dans
// un layout partagé. Un ancêtre animé avec un `transform` (le slide vertical)
// change le containing block des descendants `position: fixed` — ça casserait le
// positionnement de la sidebar si elle se trouvait dans l'arbre animé. Ce wrapper
// doit donc entourer uniquement le contenu de page, jamais <AppNav />.

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export default function PageTransition({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
