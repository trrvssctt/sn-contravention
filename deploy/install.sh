#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Installation initiale de SEN Contraventions sur le VPS (idempotent).
#
#   git clone https://github.com/trrvssctt/sn-contravention.git /opt/sen-contraventions
#   cd /opt/sen-contraventions && sudo bash deploy/install.sh [--seed]
#
#   --seed : charge les données de démonstration (comptes de démo, mot de passe Passer123!)
#
# Ne modifie AUCUNE app existante : ports vérifiés libres, pm2 préfixé « sen- »,
# base PostgreSQL dans son propre conteneur, bloc Nginx séparé sur un port dédié.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
source "$(dirname "$0")/lib.sh"

SEED=0
[ "${1:-}" = "--seed" ] && SEED=1

info "Vérification des prérequis"
for c in git node npm pm2 docker nginx curl ss openssl; do require "$c"; done
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20 ou plus requis (version actuelle : $(node -v))"
docker compose version >/dev/null 2>&1 || die "Le plugin « docker compose » est requis"
ok "Node $(node -v), pm2 $(pm2 -v), $(docker --version | cut -d, -f1)"

info "Vérification des ports (aucune application existante ne doit être touchée)"
check_port "$API_PORT" "API" "$PM2_API"
check_port "$WEB_PORT" "Admin Web" "$PM2_WEB"
check_port "$DB_PORT" "PostgreSQL" "docker:sen-contraventions-db"
if port_in_use "$PUBLIC_PORT" && [ ! -f /etc/nginx/sites-enabled/sen-contraventions ]; then
  ss -ltnpH "( sport = :$PUBLIC_PORT )" | sed 's/^/    /'
  die "Port public $PUBLIC_PORT déjà occupé. Changez PUBLIC_PORT dans deploy/deploy.conf."
fi
ok "Port public $PUBLIC_PORT disponible pour Nginx"

# ── Secrets (générés une seule fois) ─────────────────────────────────────────
SECRETS="$DEPLOY_DIR/.secrets"
if [ ! -f "$SECRETS" ]; then
  info "Génération des secrets"
  umask 077
  cat > "$SECRETS" <<EOF
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
JWT_REFRESH_SECRET=$(openssl rand -hex 48)
WAVE_WEBHOOK_SECRET=$(openssl rand -hex 32)
ORANGE_WEBHOOK_SECRET=$(openssl rand -hex 32)
EOF
  ok "Secrets écrits dans deploy/.secrets (chmod 600, non versionné)"
fi
# shellcheck source=/dev/null
source "$SECRETS"

# ── Base de données ──────────────────────────────────────────────────────────
info "Démarrage de PostgreSQL (conteneur sen-contraventions-db)"
DB_PASSWORD="$DB_PASSWORD" DB_PORT="$DB_PORT" docker compose -p sen-contraventions -f "$DEPLOY_DIR/docker-compose.yml" up -d
for i in $(seq 1 30); do
  docker exec sen-contraventions-db pg_isready -U sen >/dev/null 2>&1 && break
  sleep 2
done
docker exec sen-contraventions-db pg_isready -U sen >/dev/null || die "PostgreSQL ne répond pas"
ok "PostgreSQL prêt sur 127.0.0.1:$DB_PORT"

# ── Fichiers d'environnement ─────────────────────────────────────────────────
PUBLIC_URL="http://$PUBLIC_HOST:$PUBLIC_PORT"
info "Écriture de apps/api/.env"
umask 077
cat > "$ROOT_DIR/apps/api/.env" <<EOF
DATABASE_URL="postgresql://sen:$DB_PASSWORD@127.0.0.1:$DB_PORT/sen_contraventions?schema=public"
PORT=$API_PORT
JWT_SECRET="$JWT_SECRET"
JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET"
CORS_ORIGINS="$PUBLIC_URL"
PUBLIC_URL="$PUBLIC_URL"
ADMIN_WEB_URL="$PUBLIC_URL"
WAVE_WEBHOOK_SECRET="$WAVE_WEBHOOK_SECRET"
ORANGE_WEBHOOK_SECRET="$ORANGE_WEBHOOK_SECRET"
SMS_PROVIDER="console"
PAYMENT_SIMULATOR=$PAYMENT_SIMULATOR
EOF
umask 022
# Admin Web et API derrière le même Nginx : appels relatifs (même origine).
echo "NEXT_PUBLIC_API_URL=" > "$ROOT_DIR/apps/admin-web/.env.production.local"
mkdir -p "$ROOT_DIR/apps/api/uploads"

# ── Dépendances, schéma, build ───────────────────────────────────────────────
info "Installation des dépendances npm"
(cd "$ROOT_DIR" && npm ci --no-audit --no-fund)
# Le schéma est dans apps/api : npm ci ne génère pas le client Prisma tout seul.
info "Génération du client Prisma"
(cd "$ROOT_DIR/apps/api" && npx prisma generate)
info "Migrations de la base"
(cd "$ROOT_DIR/apps/api" && npx prisma migrate deploy)
if [ "$SEED" = 1 ]; then
  warn "Chargement des données de démonstration (≈ 2 min)"
  (cd "$ROOT_DIR/apps/api" && npm run seed)
  warn "Comptes de démo actifs (mot de passe Passer123!) : changez-les avant une utilisation réelle."
fi
build_api
SLOT=$(inactive_slot)
build_web "$SLOT"

# ── pm2 ──────────────────────────────────────────────────────────────────────
start_or_reload "$SLOT"
health_check || die "L'application ne répond pas : voir « pm2 logs $PM2_API » et « pm2 logs $PM2_WEB »"

# ── Nginx (bloc séparé, port dédié) ──────────────────────────────────────────
info "Configuration Nginx (port $PUBLIC_PORT)"
NGINX_SITE=/etc/nginx/sites-available/sen-contraventions
sed -e "s/__PUBLIC_PORT__/$PUBLIC_PORT/g" -e "s/__API_PORT__/$API_PORT/g" -e "s/__WEB_PORT__/$WEB_PORT/g" \
  -e "s/__PUBLIC_HOST__/$PUBLIC_HOST/g" "$DEPLOY_DIR/nginx.conf.template" > "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/sen-contraventions
if nginx -t 2>&1; then
  systemctl reload nginx
  ok "Nginx rechargé"
else
  rm -f /etc/nginx/sites-enabled/sen-contraventions
  die "Configuration Nginx invalide : bloc retiré, les autres sites ne sont pas affectés"
fi

# Pare-feu : ouverture du port public si ufw est actif
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "$PUBLIC_PORT/tcp" >/dev/null && ok "Port $PUBLIC_PORT ouvert dans ufw"
fi

# Redémarrage automatique de pm2 au boot (sans toucher à la liste existante)
pm2 save >/dev/null

echo
ok "SEN Contraventions est en ligne"
echo "   Admin Web : $PUBLIC_URL"
echo "   API       : $PUBLIC_URL/v1   ·   Swagger : $PUBLIC_URL/docs"
echo "   Mise à jour : sudo bash $ROOT_DIR/deploy/update.sh"
