#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Mise à jour de SEN Contraventions depuis GitHub.
#
#   sudo bash /opt/sen-contraventions/deploy/update.sh           # si nouveaux commits
#   sudo bash /opt/sen-contraventions/deploy/update.sh --force   # reconstruit même sans commit
#
# Étapes : récupère les commits → dépendances si besoin → migrations → build
# (l'ancienne version reste en ligne pendant la compilation) → bascule pm2
# → contrôle de santé → retour automatique à la version précédente en cas d'échec.
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail
source "$(dirname "$0")/lib.sh"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1
LOG_DIR="$DEPLOY_DIR/logs"; mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/update-$(date +%Y%m%d-%H%M%S).log") 2>&1

cd "$ROOT_DIR"
[ -f "$DEPLOY_DIR/.secrets" ] || die "Installation initiale absente : lancez d'abord deploy/install.sh"

# Un seul déploiement à la fois
exec 9>"$DEPLOY_DIR/.update.lock"
flock -n 9 || die "Une mise à jour est déjà en cours"

info "Récupération des nouveautés ($BRANCH)"
git fetch --quiet origin "$BRANCH"
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse "origin/$BRANCH")

if [ "$OLD" = "$NEW" ] && [ "$FORCE" = 0 ]; then
  ok "Déjà à jour ($(git log -1 --format='%h · %s'))"
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "Modifications locales sur le VPS mises de côté (git stash)"
  git stash push --include-untracked -m "auto-stash avant update $(date -Iseconds)" >/dev/null
fi

echo "   $(git log -1 --format='%h %s' "$OLD")  →  $(git log -1 --format='%h %s' "$NEW")"
git log --oneline "$OLD..$NEW" | sed 's/^/     • /'
git merge --ff-only --quiet "origin/$BRANCH" || die "Historique divergent : mise à jour manuelle nécessaire"

CHANGED=$(git diff --name-only "$OLD" "$NEW")
OLD_SLOT=$(active_slot)
NEW_SLOT=$(inactive_slot)

rollback() {
  warn "Échec : retour à la version $(git rev-parse --short "$OLD")"
  git reset --hard --quiet "$OLD"
  (cd "$ROOT_DIR" && npm ci --no-audit --no-fund >/dev/null 2>&1) || true
  build_api || true
  # L'ancien build web ($OLD_SLOT) est intact : on rebascule dessus.
  start_or_reload "$OLD_SLOT"
  health_check && warn "Ancienne version rétablie" || die "Rétablissement impossible : voir pm2 logs"
  exit 1
}
trap rollback ERR

if [ "$FORCE" = 1 ] || echo "$CHANGED" | grep -qE '(^|/)package(-lock)?\.json$'; then
  info "Dépendances modifiées : npm ci"
  npm ci --no-audit --no-fund
  (cd apps/api && npx prisma generate)
fi

if [ "$FORCE" = 1 ] || echo "$CHANGED" | grep -q '^apps/api/prisma/'; then
  info "Migrations de la base"
  (cd apps/api && npx prisma migrate deploy)
fi

build_api
build_web "$NEW_SLOT"
start_or_reload "$NEW_SLOT"
health_check || false

trap - ERR
# Nettoyage de l'ancien build web (garde la place disque)
rm -rf "$ROOT_DIR/apps/admin-web/$OLD_SLOT"
find "$LOG_DIR" -name 'update-*.log' -mtime +30 -delete 2>/dev/null || true

ok "Mise à jour terminée : $(git log -1 --format='%h · %s')"
echo "   http://$PUBLIC_HOST:$PUBLIC_PORT"
