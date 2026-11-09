#!/bin/sh
# Regression test for check-config.sh: a valid configuration passes, and every unsafe change is
# refused. Uses throw-away values generated at run time; nothing is written outside a temp dir.
# Usage: sh infrastructure/deployment/tests/check-config.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/../check-config.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
umask 077
rnd() { od -An -N36 -tx1 /dev/urandom | tr -d ' \n'; }
head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$TMP/pass"
chmod 600 "$TMP/pass"

write_base() {
  cat > "$1" <<EOF
DEPLOYMENT_ENVIRONMENT=staging
APP_VERSION=abc1234
API_DOMAIN=staging.moshinabor.uz
ADMIN_DOMAIN=admin-staging.moshinabor.uz
ADMIN_ALLOWED_IPS="198.18.10.20/32 2a02:4780:1::5/128"
ACME_EMAIL=ops@moshinabor.uz
API_PUBLIC_URL=https://staging.moshinabor.uz
CORS_ORIGINS=https://admin-staging.moshinabor.uz
HTTP_BIND=127.0.0.1:8081
POSTGRES_DB=moshina_bor_staging
POSTGRES_PASSWORD=$(rnd)
REDIS_PASSWORD=$(rnd)
JWT_ACCESS_SECRET=$(rnd)
JWT_ADMIN_SECRET=$(rnd)
OTP_PEPPER=$(rnd)
SMS_CALLBACK_SECRET=$(rnd)
SMS_PROVIDER=eskiz
ESKIZ_EMAIL=ops@moshinabor.uz
ESKIZ_PASSWORD=$(rnd)
BACKUP_PASSPHRASE_PATH=$TMP/pass
BACKUP_REQUIRE_ENCRYPTION=true
ALERT_WEBHOOK_URL=https://hooks.example-alerts.net/T000/B000
EOF
}

passed=0; failed=0
expect() { # expect <0|1> <description> <sed-expression-or-empty> [compare-file]
  want="$1"; desc="$2"; expr="$3"; other="${4:-}"
  write_base "$TMP/env"
  [ -n "$expr" ] && sed -i.bak "$expr" "$TMP/env"
  out="$(env -u SANDBOX_DRILL sh "$CHECK" "$TMP/env" $other 2>&1)"; got=$?
  if [ "$got" = "$want" ]; then passed=$((passed + 1)); echo "ok   $desc"
  else failed=$((failed + 1)); echo "FAIL $desc (exit $got, wanted $want)"; printf '%s\n' "$out" | grep -E 'FAIL|WARN' | sed 's/^/       /'; fi
}

expect 0 "valid staging configuration passes" ""
expect 1 "short secret" 's/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=short/'
expect 1 "placeholder secret" 's/^OTP_PEPPER=.*/OTP_PEPPER=change_me_change_me_change_me_change_me/'
expect 1 "test-prefixed secret" 's/^JWT_ADMIN_SECRET=.*/JWT_ADMIN_SECRET=test-0123456789abcdef0123456789abcdef/'
expect 1 "empty secret" 's/^REDIS_PASSWORD=.*/REDIS_PASSWORD=/'
expect 1 "two identical secrets" 's/^JWT_ADMIN_SECRET=.*/JWT_ADMIN_SECRET=SAME0123456789abcdef0123456789abcdef/; s/^OTP_PEPPER=.*/OTP_PEPPER=SAME0123456789abcdef0123456789abcdef/'
expect 1 "database password not URL-safe" 's#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=ab/cd+ef0123456789abcdef0123456789abcdef=#'
expect 1 "redis password not URL-safe" 's#^REDIS_PASSWORD=.*#REDIS_PASSWORD=ab@cd:ef0123456789abcdef0123456789abcdef#'
expect 1 "invalid environment name" 's/^DEPLOYMENT_ENVIRONMENT=.*/DEPLOYMENT_ENVIRONMENT=dev/'
expect 1 "http API URL" 's#^API_PUBLIC_URL=.*#API_PUBLIC_URL=http://staging.moshinabor.uz#'
expect 1 "wildcard CORS" 's#^CORS_ORIGINS=.*#CORS_ORIGINS=*#'
expect 1 "Swagger enabled" '$a SWAGGER_ENABLED=true'
expect 1 "internal port published publicly" 's/^HTTP_BIND=.*/HTTP_BIND=0.0.0.0:8081/'
expect 1 "backup encryption disabled" 's/^BACKUP_REQUIRE_ENCRYPTION=.*/BACKUP_REQUIRE_ENCRYPTION=false/'
expect 1 "missing backup passphrase" "s#^BACKUP_PASSPHRASE_PATH=.*#BACKUP_PASSPHRASE_PATH=$TMP/none#"
expect 1 "development SMS logger" 's/^SMS_PROVIDER=.*/SMS_PROVIDER=log/'
expect 1 "no alert webhook" 's/^ALERT_WEBHOOK_URL=.*/ALERT_WEBHOOK_URL=/'
expect 1 "admin open to everyone" 's#^ADMIN_ALLOWED_IPS=.*#ADMIN_ALLOWED_IPS="0.0.0.0/0"#'
expect 1 "admin allow-list empty" 's#^ADMIN_ALLOWED_IPS=.*#ADMIN_ALLOWED_IPS=#'
expect 1 "admin allow-list too broad" 's#^ADMIN_ALLOWED_IPS=.*#ADMIN_ALLOWED_IPS="198.18.0.0/8"#'
expect 1 "admin allow-list covers Docker range" 's#^ADMIN_ALLOWED_IPS=.*#ADMIN_ALLOWED_IPS="172.16.0.0/12"#'
expect 1 "template example IP left in place" 's#^ADMIN_ALLOWED_IPS=.*#ADMIN_ALLOWED_IPS="203.0.113.10/32"#'
expect 1 "sandbox local certificates" '$a CADDY_EXTRA_GLOBAL_OPTIONS=local_certs'
expect 1 "Let's Encrypt staging CA" '$a CADDY_EXTRA_GLOBAL_OPTIONS="acme_ca https://acme-staging-v02.api.letsencrypt.org/directory"'
expect 1 "non-standard edge port" '$a EDGE_HTTPS_PORT=8443'
expect 1 "localhost hostname" 's/^API_DOMAIN=.*/API_DOMAIN=staging.localhost/'
expect 1 "API URL does not match the domain" 's#^API_PUBLIC_URL=.*#API_PUBLIC_URL=https://api.moshinabor.uz#'
expect 1 "missing ACME e-mail" 's/^ACME_EMAIL=.*/ACME_EMAIL=/'

# Staging must not share secrets with production.
write_base "$TMP/prod"
sed -i.bak 's/^DEPLOYMENT_ENVIRONMENT=.*/DEPLOYMENT_ENVIRONMENT=production/; s/^POSTGRES_DB=.*/POSTGRES_DB=moshina_bor/' "$TMP/prod"
shared="$(grep '^JWT_ACCESS_SECRET=' "$TMP/prod" | cut -d= -f2-)"
expect 0 "distinct from the production file" "" "$TMP/prod"
expect 1 "secret shared with the production file" "s/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$shared/" "$TMP/prod"

# The env file cannot switch on drill mode by itself.
expect 1 "SANDBOX_DRILL inside the env file is ignored" '$a SANDBOX_DRILL=1\nCADDY_EXTRA_GLOBAL_OPTIONS=local_certs'

echo "check-config tests: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
