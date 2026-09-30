# Déploiement sur le VPS (185.215.165.43)

L'installation cohabite avec les applications déjà présentes (gestockpro, myrh, portefolia, portfolio, realtech, n8n, ollama…) sans les modifier :

| Élément | Valeur | Isolation |
|---|---|---|
| Dossier | `/opt/sen-contraventions` | dossier dédié |
| Processus pm2 | `sen-api`, `sen-web` | préfixe `sen-`, les 5 apps existantes ne sont pas touchées |
| Base de données | conteneur Docker `sen-contraventions-db` | écoute sur `127.0.0.1:5440` uniquement |
| API | `127.0.0.1:4100` | non exposée directement |
| Admin Web | `127.0.0.1:3100` | non exposée directement |
| Accès public | Nginx, **port 8090** : `http://185.215.165.43:8090` | bloc `sites-available/sen-contraventions` séparé ; les sites sur 80/443 sont inchangés |

Avant toute modification, le script d'installation vérifie que chaque port est libre. Si l'un est déjà pris, il s'arrête sans rien toucher : il suffit alors de changer la valeur dans `deploy/deploy.conf`.

## 1. Vérifier les ports sur le VPS (lecture seule)

```bash
ss -ltnp | grep -E ':(8090|4100|3100|5440) ' || echo "ports libres"
docker compose version && node -v && pm2 -v && nginx -v
```

Si un port est occupé, copiez `deploy/deploy.conf.example` vers `deploy/deploy.conf` et changez la valeur (étape 2).

## 2. Première installation

```bash
cd /opt
git clone https://github.com/trrvssctt/sn-contravention.git sen-contraventions
cd sen-contraventions
# (optionnel) cp deploy/deploy.conf.example deploy/deploy.conf && nano deploy/deploy.conf
sudo bash deploy/install.sh --seed      # --seed = données et comptes de démonstration
```

Le script :
1. vérifie les prérequis et les ports ;
2. génère les secrets (JWT, base, webhooks) dans `deploy/.secrets` (droits 600, non versionné) ;
3. démarre PostgreSQL ;
4. écrit `apps/api/.env` ;
5. installe les dépendances, applique les migrations et compile l'API et l'Admin Web ;
6. démarre `sen-api` et `sen-web` avec pm2 ;
7. ajoute le bloc Nginx après un test `nginx -t` (en cas d'erreur, le bloc est retiré et les autres sites ne sont pas affectés) ;
8. ouvre le port dans ufw si le pare-feu est actif.

Durée : 5 à 8 minutes, 2 de plus avec `--seed`.

> Si le VPS a un pare-feu chez l'hébergeur (panneau Contabo, etc.), ouvrez-y aussi le port **8090/TCP**.

## 3. Mettre à jour après un `git push`

```bash
sudo bash /opt/sen-contraventions/deploy/update.sh
```

- Il ne fait rien s'il n'y a pas de nouveau commit (`--force` pour reconstruire quand même).
- Il réinstalle les dépendances seulement si un `package.json` ou le lockfile a changé.
- Il applique les migrations seulement si le schéma Prisma a changé.
- Il compile la nouvelle version **pendant que l'ancienne reste en ligne** (builds alternés `.next-a` / `.next-b`), puis bascule.
- Il vérifie ensuite que l'API et l'Admin Web répondent. **En cas d'échec, il revient automatiquement à la version précédente.**
- Chaque exécution est journalisée dans `deploy/logs/`.

Limite : une migration de base de données déjà appliquée n'est pas annulée par ce retour arrière. Écrivez des migrations compatibles avec la version précédente (ajout de colonnes plutôt que suppression).

Pour automatiser, par exemple toutes les 10 minutes :

```bash
( crontab -l 2>/dev/null; echo "*/10 * * * * bash /opt/sen-contraventions/deploy/update.sh >/dev/null 2>&1" ) | crontab -
```

## 4. Exploitation

```bash
pm2 status sen-api sen-web          # état
pm2 logs sen-api --lines 100        # journaux API (SMS et OTP visibles ici tant que SMS_PROVIDER=console)
pm2 restart sen-api sen-web         # redémarrage
docker exec -t sen-contraventions-db pg_dump -U sen sen_contraventions | gzip > /root/sen-$(date +%F).sql.gz   # sauvegarde
```

## 5. À faire avant une mise en service réelle

- **Changer les mots de passe des comptes de démo** (ou installer sans `--seed` et créer les comptes réels).
- Mettre un **nom de domaine + HTTPS** (Let's Encrypt). Il suffit ensuite de changer `PUBLIC_HOST` / `PUBLIC_PORT` et de relancer `install.sh`.
- Brancher le fournisseur SMS réel et les comptes marchands Wave / Orange Money, puis passer `PAYMENT_SIMULATOR=false`.
- Pour l'app Flutter : l'API est accessible sur `http://185.215.165.43:8090/v1` et la documentation sur `http://185.215.165.43:8090/docs`.
