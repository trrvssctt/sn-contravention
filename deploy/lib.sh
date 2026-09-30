#!/usr/bin/env bash
# Fonctions communes aux scripts de déploiement.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$DEPLOY_DIR/deploy.conf.example"
[ -f "$DEPLOY_DIR/deploy.conf" ] && source "$DEPLOY_DIR/deploy.conf"

C_OK='\033[1;32m'; C_WARN='\033[1;33m'; C_ERR='\033[1;31m'; C_INFO='\033[1;36m'; C_END='\033[0m'
info() { echo -e "${C_INFO}▶ $*${C_END}"; }
ok()   { echo -e "${C_OK}✔ $*${C_END}"; }
warn() { echo -e "${C_WARN}⚠ $*${C_END}"; }
die()  { echo -e "${C_ERR}✖ $*${C_END}" >&2; exit 1; }

require() { command -v "$1" >/dev/null 2>&1 || die "Commande requise introuvable : $1"; }

# Vrai si un processus écoute déjà sur ce port TCP.
port_in_use() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }

# PID(s) qui écoutent sur un port.
port_pids() { ss -ltnpH "( sport = :$1 )" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u; }

# Le port doit être libre, sauf s'il est tenu par notre propre service (PID pm2 ou conteneur Docker).
# $3 = nom pm2 attendu, ou « docker:<conteneur> ».
check_port() {
  local port=$1 label=$2 owner=$3 pid ours=0
  if ! port_in_use "$port"; then ok "Port $port ($label) libre"; return; fi
  if [[ "$owner" == docker:* ]]; then
    docker ps --format '{{.Names}} {{.Ports}}' | grep -q "^${owner#docker:} .*:$port->" && ours=1
  else
    local mine; mine=$(pm2 pid "$owner" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$mine" ] && [ "$mine" != "0" ]; then
      for pid in $(port_pids "$port"); do
        # le serveur Next peut tourner dans un processus enfant du processus pm2
        [ "$pid" = "$mine" ] || [ "$(ps -o ppid= -p "$pid" | tr -d ' ')" = "$mine" ] && ours=1
      done
    fi
  fi
  if [ "$ours" = 1 ]; then
    ok "Port $port ($label) déjà utilisé par SEN Contraventions"
  else
    ss -ltnpH "( sport = :$port )" 2>/dev/null | sed 's/^/    /'
    die "Port $port ($label) déjà occupé par une autre application. Changez-le dans deploy/deploy.conf."
  fi
}

# Build Next.js en alternance dans deux dossiers (.next-a / .next-b) :
# l'app en ligne continue de servir l'ancien build pendant la compilation, puis bascule.
WEB_SLOT_FILE="$DEPLOY_DIR/.web-slot"
active_slot() { cat "$WEB_SLOT_FILE" 2>/dev/null || echo ".next-a"; }
inactive_slot() { [ "$(active_slot)" = ".next-a" ] && echo ".next-b" || echo ".next-a"; }

build_api() {
  info "Build de l'API"
  (cd "$ROOT_DIR/apps/api" && npx prisma generate >/dev/null && npm run build)
}

build_web() {
  local slot=$1
  info "Build de l'Admin Web dans $slot"
  (cd "$ROOT_DIR/apps/admin-web" && rm -rf "$slot" && NEXT_DIST_DIR="$slot" NODE_OPTIONS=--max-old-space-size=2048 npx next build)
}

start_or_reload() {
  local slot=$1
  info "Démarrage / rechargement pm2 (web sur $slot)"
  WEB_DIST_DIR="$slot" pm2 startOrReload "$DEPLOY_DIR/ecosystem.config.cjs" --update-env
  echo "$slot" > "$WEB_SLOT_FILE"
  pm2 save >/dev/null
}

health_check() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$API_PORT/docs" && curl -fsS -o /dev/null "http://127.0.0.1:$WEB_PORT/login"; then
      ok "API et Admin Web répondent"
      return 0
    fi
    sleep 2
  done
  return 1
}
