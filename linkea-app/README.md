# Linkea — De l'idée au MVP en 4–8 semaines

Linkea est une plateforme qui met en relation des **founders** (porteurs de projet) avec des **développeurs** pour construire des MVPs rapidement. Elle couvre l'intégralité du workflow : recrutement, gestion de projet, messagerie, contrats, paiements et résolution de litiges.

---

## Fonctionnalités

### Pour les founders

| Fonctionnalité | Description |
|---|---|
| **Créer un projet** | Décrire son idée, le stack souhaité, le budget et la durée estimée |
| **Trouver un dev** | Parcourir les profils développeurs filtrés par stack, tarif, disponibilité |
| **Gérer les candidatures** | Accepter ou refuser les candidats depuis un tableau de bord dédié |
| **Gestion de projet** | Sprints, tâches, statuts — board Kanban intégré |
| **Agent IA** | Scoper le MVP, faire des check-ins de sprint, obtenir un score de santé du projet |
| **Messagerie** | Conversations directes et de groupe avec les devs |
| **Contrat** | Génération automatique du contrat à la validation du devis |
| **Paiement** | Rechargement du wallet et paiement de jalons via Stripe |
| **Review** | Laisser une évaluation au dev en fin de mission |
| **Litiges** | Ouvrir un litige si le projet se déroule mal — modéré par l'équipe Linkea |

### Pour les développeurs

| Fonctionnalité | Description |
|---|---|
| **Profil public** | Présenter son stack, ses réalisations, son tarif journalier |
| **Découverte de projets** | Parcourir les projets publiés et candidater en un clic |
| **Notifications** | Alertes temps réel : nouveau projet correspondant, candidature acceptée, tâche assignée |
| **Board de gestion** | Voir et mettre à jour les tâches du sprint en cours |
| **Messagerie** | Communiquer avec le founder et l'équipe |
| **Wallet** | Suivre les paiements reçus et l'historique des transactions |
| **Review** | Recevoir une évaluation visible sur son profil public |

---

## Workflow complet

```
Founder crée un projet
        │
        ▼
Devs découvrent le projet et candidatent
        │
        ▼
Founder consulte les profils → accepte un dev
        │
        ▼
Contrat généré automatiquement — les deux parties signent
        │
        ▼
Founder alimente son wallet (Stripe)
        │
        ▼
Sprints créés → tâches assignées → dev travaille
        │
        ▼
Founder valide les jalons → paiement libéré vers le wallet du dev
        │
        ▼
Fin de mission → Reviews mutuelles
        │
        ▼
(Si problème) → Litige ouvert → résolution par l'équipe Linkea
```

---

## Agent IA

L'agent IA est intégré directement dans la page de gestion du projet. Il a accès au contexte complet du projet (sprints, tâches, deadlines) et peut :

- **Scoper le MVP** — poser les 5 questions clés pour affiner le périmètre du produit
- **Check-in de sprint** — analyser l'avancement du sprint en cours et suggérer des ajustements
- **Score de santé** — calculer un score 0–100 basé sur le taux de complétion des tâches, les tâches en retard, la proximité de la deadline et l'activité récente
- **Recommandations personnalisées** — adapter ses conseils au contexte réel du projet

---

## Stack technique

| Couche | Technologie |
|---|---|
| **Framework** | Next.js 15 (App Router) |
| **Langage** | TypeScript |
| **Base de données** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth |
| **Realtime** | Supabase Realtime (WebSockets) |
| **Styles** | Tailwind CSS + CSS custom properties |
| **Paiement** | Stripe |
| **IA** | Anthropic Claude API |
| **Typo** | Plus Jakarta Sans + Fraunces |
| **Déploiement** | Vercel |

---

## Structure du projet

```
app/
├── page.tsx                    # Landing page
├── connexion/                  # Authentification
├── inscription/
├── onboarding/                 # Sélection du rôle (founder / developer)
├── projets/
│   ├── page.tsx                # Liste des projets (founders)
│   ├── nouveau/                # Créer un projet
│   └── [id]/
│       ├── page.tsx            # Détail public du projet
│       ├── candidats/          # Gestion des candidatures
│       ├── gestion/            # Board + sprints + agent IA
│       ├── modifier/           # Éditer le projet
│       ├── paiement/           # Payer un jalon
│       └── review/             # Laisser une évaluation
├── devs/                       # Annuaire des développeurs
├── messages/
│   ├── page.tsx                # Liste des conversations
│   └── [id]/                   # Conversation
├── contrat/[id]/               # Contrat de mission
├── wallet/                     # Wallet et transactions
├── profil/
│   ├── page.tsx                # Mon profil
│   └── [userId]/               # Profil public d'un utilisateur
├── support/[id]/               # Conversation support
├── admin/                      # Dashboard admin (modération, litiges, bans)
└── parametres/                 # Paramètres du compte

components/
├── AIPanel.tsx                 # Agent IA (panneau latéral)
├── BottomNav.tsx               # Navigation mobile
├── NotificationBell.tsx        # Cloche de notifications
├── NotifToast.tsx              # Toasts temps réel
└── ...

lib/
├── supabase.ts                 # Client Supabase
├── auth.ts                     # Helpers auth (getAuthUser, getAuthSession)
└── ...
```

---

## Installation locale

### Prérequis

- Node.js 18+
- Un projet Supabase
- Un compte Stripe (pour les paiements)
- Une clé API Anthropic (pour l'agent IA)

### Variables d'environnement

Créer un fichier `.env.local` à la racine :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx

STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

ANTHROPIC_API_KEY=sk-ant-...

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Lancer le projet

```bash
npm install
npm run dev
```

L'app est accessible sur [http://localhost:3000](http://localhost:3000).

---

## Rôles utilisateurs

Après l'inscription, l'utilisateur choisit son rôle lors de l'onboarding :

- **Founder** — accès à la création de projets, gestion de candidatures, wallet débiteur
- **Developer** — accès à l'annuaire de projets, candidatures, wallet créditeur
- **Admin** — accès au dashboard de modération (invitation uniquement)

Un utilisateur ne peut pas changer de rôle après l'onboarding.
