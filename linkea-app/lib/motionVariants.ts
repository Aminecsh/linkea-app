// Variants Framer Motion partagés pour l'apparition en cascade des listes de
// cards (feed projets, tâches, journal d'activité, documents…).
//
// Règle de discipline : le stagger doit rester rapide (40-60ms/item) et ne
// jamais cascader sur une liste entière — au-delà de STAGGER_LIMIT items, le
// reste apparaît sans délai additionnel pour ne pas ralentir l'usage.

import type { Variants } from "framer-motion";

export const STAGGER_LIMIT = 10;
const STAGGER_STEP = 0.05; // 50ms entre chaque item, dans la fourchette 40-60ms demandée

export const listContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: STAGGER_STEP },
  },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
};

// Pour les items au-delà de STAGGER_LIMIT : apparition immédiate, sans délai
// en cascade — évite l'effet "j'attends que la liste finisse de s'animer".
export const listItemVariantsNoStagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15, ease: "easeOut" } },
};
