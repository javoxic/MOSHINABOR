#!/bin/sh
# Release configuration check for a deployment env file. Exit 1 on any problem.
# Usage: ./check-config.sh <env-file> [other-env-file-to-compare-secrets-with]
set -u
cd "$(dirname "$0")"
ENV_FILE="${1:?usage: check-config.sh <env-file> [compare-env-file]}"
OTHER="${2:-}"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
. "./$ENV_FILE"
fail=0
bad() { echo "FAIL: $1"; fail=1; }
ok() { echo "ok:   $1"; }

case "${DEPLOYMENT_ENVIRONMENT:-}" in production|staging) ok "DEPLOYMENT_ENVIRONMENT=$DEPLOYMENT_ENVIRONMENT" ;; *) bad "DEPLOYMENT_ENVIRONMENT must be production or staging" ;; esac
[ -n "${APP_VERSION:-}" ] && ok "APP_VERSION set" || bad "APP_VERSION is empty"

for v in POSTGRES_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET JWT_ADMIN_SECRET OTP_PEPPER SMS_CALLBACK_SECRET; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then bad "$v is empty"; continue; fi
  if [ "${#val}" -lt 32 ]; then bad "$v is shorter than 32 characters"; continue; fi
  if printf '%s' "$val" | grep -qiE 'change_?me|replace|example|^(test|e2e|dev)[-_]|password'; then bad "$v looks like a placeholder/test value"; continue; fi
  ok "$v strong"
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
