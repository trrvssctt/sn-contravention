# SEN Contraventions

Digitalisation de la chaîne des amendes routières au Sénégal : **constat → émission → notification → paiement → recouvrement → pilotage**.

| Interface | Techno | Dossier |
|---|---|---|
| **Admin Web** (pilotage national) | Next.js 15 · Tailwind v4 · TanStack Query · Motion · Recharts · d3 | `apps/admin-web` |
| **API** (backend unique, REST + temps réel) | NestJS 11 · Prisma 6 · PostgreSQL · Socket.IO · Swagger | `apps/api` |
| **App Officier / Espace Usager** | Flutter (dépôt séparé) | voir [`docs/FLUTTER.md`](docs/FLUTTER.md) |

Déploiement sur le VPS et mise à jour depuis GitHub : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md).

```
 App Officier (Flutter) ─┐
 Espace Usager (Flutter) ├─ REST /v1 + JWT ──► API NestJS ──► PostgreSQL
 Admin Web (Next.js) ────┘   Socket.IO /ws ◄──┘   │  ▲
                                                   │  └── webhooks Wave / Orange Money
                                                   └──► passerelle SMS
```

## Démarrage (développement)

Prérequis : Node 20+, Docker.

```bash
npm install                # installe les deux apps (workspaces npm)
npm run db:up              # PostgreSQL 16 dans Docker (port 5433)
cp apps/api/.env.example apps/api/.env
npm run db:migrate         # crée le schéma
npm run db:seed            # 12 mois de données réalistes (~1 min 30)
npm run dev:api            # http://localhost:4000/v1 · Swagger : http://localhost:4000/docs
npm run dev:web            # http://localhost:3000
```

### Comptes de démo (mot de passe `Passer123!`)

| Profil | Identifiant | Particularité |
|---|---|---|
| Super Admin | `a.diagne@interieur.gouv.sn` | toutes les pages |
| Commandant | `m.thiaw@police.sn` | zone Plateau uniquement |
| Trésorier | `nf.kebe@tresor.gouv.sn` | Tableau de bord, Contraventions, Trésor, Usagers |
| Superviseur | `o.sall@police.sn` | zone Pikine, lecture seule |
| Officier (mobile) | matricule `PN-4471` | `PN-4602` est suspendu → HTTP 423 |
| Usager (mobile) | `+221 76 332 10 45` | sans 2FA |
| Usager (mobile) | `+221 77 123 45 67` | 2FA : le code OTP s'affiche dans la console de l'API |

En développement, les SMS et les emails d'invitation sont écrits dans la console de l'API.

## Ce qui est implémenté

**Admin Web** : les 9 pages des maquettes (tableau de bord, registre, trésor, officiers, usagers, véhicules, barème, zones avec carte 3D, admins & paramètres), les 4 fiches latérales, les 5 modales, les toasts, la recherche globale ⌘K, les notifications, les exports Excel/PDF, la mise à jour en temps réel, le filtrage par rôle et par zone, la sidebar repliable sous 1024 px et la page de connexion.

**API** : 68 routes documentées. Elle couvre :
- l'authentification des 3 profils (JWT de 15 min + refresh, OTP SMS pour les usagers) ;
- le RBAC côté serveur avec restriction par zone ;
- la numérotation `CNT-AAAA-NNNNN` et `RCU-AAAA-NNNNN` ;
- les paiements partiels et multi-amendes ;
- les webhooks Wave et Orange Money signés en HMAC ;
- l'idempotence hors-ligne via `clientUuid` ;
- l'ETag sur le barème ;
- le verrouillage des officiers suspendus (HTTP 423 + déconnexion WebSocket) ;
- le journal d'audit.

## Choix et limites actuelles

- **Paiement mobile money** : un simulateur (`/v1/dev/checkout/:id`) remplace les API marchandes Wave et Orange Money tant que les comptes ne sont pas ouverts. Le contrat du webhook est déjà en place.
- **Stockage des photos** : disque local (`apps/api/uploads`). Le passage à S3/MinIO se fait sans changer le contrat `POST /v1/uploads`.
- **Relances SMS en masse** : envoyées en tâche de fond dans le processus de l'API. À basculer vers BullMQ/Redis quand le volume l'exigera.
- **Coordonnées** : colonnes `lat`/`lng` simples. PostGIS n'est pas nécessaire tant qu'il n'y a pas de requêtes spatiales.
- **Jetons de l'Admin Web** : stockés dans `localStorage`. En production, préférer des cookies httpOnly derrière le même domaine.
- **Chemin du projet contenant des accents** : le plugin Swagger de Nest génère alors des chemins invalides. Le script `apps/api/scripts/fix-swagger-paths.js` les corrige après chaque build.
