#!/bin/sh
# Release configuration check for a deployment env file. Exit 1 on any problem.
# Usage: ./check-config.sh <env-file> [other-env-file-to-compare-secrets-with]
# SANDBOX_DRILL=1 (shell environment only, never the env file) downgrades the checks that a
# local rehearsal cannot meet (local hostnames, non-standard ports, Caddy local_certs) to warnings.
set -u
DRILL="${SANDBOX_DRILL:-0}" # read before sourcing: the env file cannot switch it on
cd "$(dirname "$0")" || exit 1
ENV_FILE="${1:?usage: check-config.sh <env-file> [compare-env-file]}"
case "$ENV_FILE" in /*|./*|../*) ;; *) ENV_FILE="./$ENV_FILE" ;; esac # relative paths are relative to this directory
OTHER="${2:-}"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"
fail=0
bad() { echo "FAIL: $1"; fail=1; }
ok() { echo "ok:   $1"; }
warn() { echo "WARN: $1"; }
# In a sandbox drill, problems that only a real public host can satisfy become warnings.
drill_or_bad() { if [ "$DRILL" = 1 ]; then warn "(sandbox drill) $1"; else bad "$1"; fi; }

case "${DEPLOYMENT_ENVIRONMENT:-}" in production|staging) ok "DEPLOYMENT_ENVIRONMENT=$DEPLOYMENT_ENVIRONMENT" ;; *) bad "DEPLOYMENT_ENVIRONMENT must be production or staging" ;; esac
[ -n "${APP_VERSION:-}" ] && ok "APP_VERSION set" || bad "APP_VERSION is empty"

for v in POSTGRES_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET JWT_ADMIN_SECRET OTP_PEPPER SMS_CALLBACK_SECRET; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then bad "$v is empty"; continue; fi
  if [ "${#val}" -lt 32 ]; then bad "$v is shorter than 32 characters"; continue; fi
  if printf '%s' "$val" | grep -qiE 'change_?me|replace|example|^(test|e2e|dev)[-_]|password'; then bad "$v looks like a placeholder/test value"; continue; fi
  ok "$v strong"
done
for v in POSTGRES_PASSWORD REDIS_PASSWORD; do
  eval "val=\${$v:-}"
  case "$val" in *[!A-Za-z0-9._~-]*) bad "$v contains characters that break DATABASE_URL/REDIS_URL (use: openssl rand -hex 32)" ;; esac
done
dups="$(printf '%s\n%s\n%s\n%s\n' "${JWT_ACCESS_SECRET:-a}" "${JWT_ADMIN_SECRET:-b}" "${OTP_PEPPER:-c}" "${SMS_CALLBACK_SECRET:-d}" | sort | uniq -d)"
[ -z "$dups" ] && ok "secrets are distinct" || bad "two or more secrets are identical"

case "${API_PUBLIC_URL:-}" in https://*) ok "API_PUBLIC_URL is https" ;; *) bad "API_PUBLIC_URL must be an https:// origin" ;; esac
case "${CORS_ORIGINS:-}" in
  *'*'*) bad "CORS_ORIGINS must not contain a wildcard" ;;
  "") bad "CORS_ORIGINS is empty" ;;
  *) if printf '%s' "$CORS_ORIGINS" | tr ',' '\n' | grep -vqE '^https://'; then bad "every CORS origin must be https://"; else ok "CORS_ORIGINS https allow-list"; fi ;;
esac
[ "${SWAGGER_ENABLED:-false}" = "true" ] && bad "SWAGGER_ENABLED=true (API docs exposed)" || ok "Swagger disabled"
case "${HTTP_BIND:-127.0.0.1:8080}" in 127.0.0.1:*|localhost:*) ok "admin/nginx bound to loopback (${HTTP_BIND:-127.0.0.1:8080})" ;; *) bad "HTTP_BIND=${HTTP_BIND} exposes the internal port publicly" ;; esac
[ "${BACKUP_REQUIRE_ENCRYPTION:-true}" = "true" ] && ok "backup encryption required" || bad "BACKUP_REQUIRE_ENCRYPTION must be true"
pass="${BACKUP_PASSPHRASE_PATH:-./secrets/backup_passphrase}"
if [ -s "$pass" ] && [ "$(wc -c < "$pass")" -ge 20 ]; then
  perm="$(stat -c %a "$pass" 2>/dev/null || stat -f %Lp "$pass")"
  [ "$perm" = "600" ] || [ "$perm" = "400" ] && ok "backup passphrase present (mode $perm)" || bad "backup passphrase must be chmod 600 (is $perm)"
else
  bad "backup passphrase file $pass missing or shorter than 20 characters"
fi
[ "${SMS_PROVIDER:-eskiz}" = "log" ] && bad "SMS_PROVIDER=log is development-only"
if [ "${SMS_PROVIDER:-eskiz}" = "eskiz" ] && { [ -z "${ESKIZ_EMAIL:-}" ] || [ -z "${ESKIZ_PASSWORD:-}" ]; }; then
  echo "WARN: Eskiz credentials empty — sign-in will return 503 SMS_NOT_CONFIGURED until set"
fi
if [ -n "${API_DOMAIN:-}" ] && [ -z "${ADMIN_ALLOWED_IPS:-}" ]; then bad "ADMIN_ALLOWED_IPS is empty (admin would be unreachable or open)"; fi

# Alerting: monitor.sh is useless without a destination.
case "${ALERT_WEBHOOK_URL:-}" in
  https://*) ok "ALERT_WEBHOOK_URL set (https)" ;;
  "") bad "ALERT_WEBHOOK_URL is empty (monitor.sh could not alert anyone)" ;;
  *) drill_or_bad "ALERT_WEBHOOK_URL must be https://" ;;
esac

# Public HTTPS edge (Caddy, started by deploy.sh when API_DOMAIN is set).
if [ -n "${API_DOMAIN:-}" ]; then
  [ -n "${ADMIN_DOMAIN:-}" ] || bad "ADMIN_DOMAIN is empty"
  [ "$API_DOMAIN" != "${ADMIN_DOMAIN:-}" ] || bad "API_DOMAIN and ADMIN_DOMAIN must be different hostnames"
  for d in "$API_DOMAIN" "${ADMIN_DOMAIN:-}"; do
    case "$d" in
      ""|*" "*) ;;
      localhost|*.localhost|*.local|*.test|*.invalid|*.example|*example.com|*example.org) drill_or_bad "$d is not a public hostname" ;;
      *.*) ok "public hostname $d" ;;
      *) bad "$d is not a fully qualified hostname" ;;
    esac
  done
  [ "${API_PUBLIC_URL:-}" = "https://$API_DOMAIN" ] || drill_or_bad "API_PUBLIC_URL must be exactly https://$API_DOMAIN (is ${API_PUBLIC_URL:-empty})"
  case ",${CORS_ORIGINS:-}," in *",https://${ADMIN_DOMAIN:-none},"*) ok "CORS allows the admin origin" ;; *) drill_or_bad "CORS_ORIGINS must contain https://${ADMIN_DOMAIN:-<ADMIN_DOMAIN>}" ;; esac
  case "${ACME_EMAIL:-}" in
    *@example.*|*@*.example|*@localhost|"") bad "ACME_EMAIL must be a real mailbox (certificate expiry notices)" ;;
    *@*.*) ok "ACME_EMAIL set" ;;
    *) bad "ACME_EMAIL is not an e-mail address" ;;
  esac
  # Certificates must come from a public CA. Caddy's internal CA and the Let's Encrypt staging CA
  # produce certificates that phones reject.
  case "${CADDY_EXTRA_GLOBAL_OPTIONS:-}" in
    *local_certs*|*internal*|*acme-staging*|*acme_ca*) drill_or_bad "CADDY_EXTRA_GLOBAL_OPTIONS selects a non-public certificate authority ($CADDY_EXTRA_GLOBAL_OPTIONS)" ;;
    "") ok "certificates from the public ACME CA (Let's Encrypt / ZeroSSL)" ;;
    *) warn "CADDY_EXTRA_GLOBAL_OPTIONS is set: $CADDY_EXTRA_GLOBAL_OPTIONS" ;;
  esac
  if [ "${EDGE_HTTP_PORT:-80}" != 80 ] || [ "${EDGE_HTTPS_PORT:-443}" != 443 ]; then
    drill_or_bad "the edge must listen on 80/443 for ACME validation and the app (is ${EDGE_HTTP_PORT:-80}/${EDGE_HTTPS_PORT:-443})"
  fi
  # Admin allow-list: specific operator addresses only.
  for cidr in ${ADMIN_ALLOWED_IPS:-}; do
    ip="${cidr%/*}"; bits="${cidr#*/}"; [ "$bits" = "$cidr" ] && bits=32
    case "$ip" in
      0.0.0.0|::) bad "ADMIN_ALLOWED_IPS entry $cidr allows everyone" ; continue ;;
      192.0.2.*|198.51.100.*|203.0.113.*|2001:db8:*) drill_or_bad "ADMIN_ALLOWED_IPS entry $cidr is a documentation example address, not an operator IP" ; continue ;;
      172.1[6-9].*|172.2[0-9].*|172.3[01].*)
        # Docker's bridge networks live here. If traffic ever reaches Caddy through docker-proxy
        # (e.g. IPv6 without ip6tables), every client appears to come from this range.
        drill_or_bad "ADMIN_ALLOWED_IPS entry $cidr overlaps Docker's internal 172.16.0.0/12 range" ; continue ;;
      10.*|192.168.*|127.*) warn "ADMIN_ALLOWED_IPS entry $cidr is a private address; only correct for a VPN on this host" ;;
    esac
    case "$ip" in *:*) min=32 ;; *) min=16 ;; esac
    if [ "$bits" -lt "$min" ] 2>/dev/null; then bad "ADMIN_ALLOWED_IPS entry $cidr is too broad (prefix shorter than /$min)"; fi
  done
fi

if [ -n "$OTHER" ] && [ -f "$OTHER" ]; then
  # Staging must never share secrets or a database with production.
  for v in POSTGRES_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET JWT_ADMIN_SECRET OTP_PEPPER SMS_CALLBACK_SECRET POSTGRES_DB; do
    a="$(grep -E "^$v=" "$ENV_FILE" | cut -d= -f2-)"; b="$(grep -E "^$v=" "$OTHER" | cut -d= -f2-)"
    [ -n "$a" ] && [ "$a" = "$b" ] && bad "$v is identical in $ENV_FILE and $OTHER"
  done
  [ $fail -eq 0 ] && ok "no secrets shared with $OTHER"
fi

[ $fail -eq 0 ] && echo "CONFIG OK ($ENV_FILE)" || echo "CONFIG HAS PROBLEMS ($ENV_FILE)"
exit $fail
