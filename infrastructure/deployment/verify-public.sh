#!/bin/sh
# Post-deployment verification of the PUBLIC endpoints, run from an operator machine (not the
# server). It sends no SMS and no push, and it changes nothing.
#
# Usage: ./verify-public.sh <api-domain> <admin-domain> <expected-environment> <admin: allowed|denied>
#   allowed = this machine's IP is in ADMIN_ALLOWED_IPS (expect 200 on the admin host)
#   denied  = run from a network that is NOT allowed (expect 403) — do both before go-live
#
# Optional (shell environment):
#   EXPECTED_IP=1.2.3.4          both hostnames must resolve to this address
#   VERIFY_UNINVITED_PHONE=+998… a number YOU own that is NOT on the pilot allowlist. Expect
#                                403 PILOT_ACCESS_ONLY and no SMS. If an SMS arrives, pilot access
#                                is open: switch on maintenance mode and investigate.
#   VERIFY_PORT=8443, VERIFY_CA_FILE=root.crt   sandbox drills only (never for a real deployment)
set -u
API="${1:?usage: verify-public.sh <api-domain> <admin-domain> <production|staging> <allowed|denied>}"
ADMIN="${2:?admin domain}"
ENVNAME="${3:?expected environment: production or staging}"
ADMIN_EXPECT="${4:?allowed or denied}"
PORT="${VERIFY_PORT:-443}"
hp() { if [ "$PORT" = 443 ]; then echo "$1"; else echo "$1:$PORT"; fi; }
fail=0
ok() { echo "ok:   $1"; }
bad() { echo "FAIL: $1"; fail=1; }
c() { curl -sS -m 20 --noproxy '*' ${VERIFY_CA_FILE:+--cacert "$VERIFY_CA_FILE"} "$@"; }
code() { c -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo "000"; }

# 1. DNS
for h in "$API" "$ADMIN"; do
  ips="$(getent ahosts "$h" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [ -z "$ips" ]; then bad "$h does not resolve"; continue; fi
  if [ -n "${EXPECTED_IP:-}" ] && ! printf '%s' "$ips" | grep -qw "$EXPECTED_IP"; then bad "$h resolves to $ips, expected $EXPECTED_IP"; else ok "$h resolves to $ips"; fi
done

# 2. TLS with full verification (curl fails on self-signed, expired or wrong-host certificates)
for h in "$API" "$ADMIN"; do
  if c -o /dev/null "https://$(hp "$h")/" 2>/tmp/verify-tls.$$; then ok "valid TLS certificate for $h"
  else bad "TLS verification failed for $h: $(tr '\n' ' ' < /tmp/verify-tls.$$)"; fi
done
rm -f /tmp/verify-tls.$$
if [ "$PORT" = 443 ]; then
  r="$(curl -sS -m 20 --noproxy '*' -o /dev/null -w '%{http_code} %{redirect_url}' "http://$API/v1/health/live" 2>/dev/null || true)"
  case "$r" in 30[178]\ https://*) ok "http redirects to https" ;; *) bad "http://$API did not redirect to https ($r)" ;; esac
fi
hdrs="$(c -D - -o /dev/null "https://$(hp "$API")/v1/health/live" 2>/dev/null | tr -d '\r')"
printf '%s' "$hdrs" | grep -qi '^strict-transport-security: max-age=' && ok "HSTS header present" || bad "HSTS header missing"

# 3. API surface on the public hostname
[ "$(code "https://$(hp "$API")/v1/health/ready")" = 200 ] && ok "API ready" || bad "API /v1/health/ready is not 200"
cfg="$(c "https://$(hp "$API")/v1/app-config" 2>/dev/null || true)"
printf '%s' "$cfg" | grep -q "\"deploymentEnvironment\":\"$ENVNAME\"" && ok "deploymentEnvironment=$ENVNAME" || bad "app-config does not report deploymentEnvironment=$ENVNAME"
printf '%s' "$cfg" | grep -q '"maintenanceMode":false' && ok "maintenance mode off" || bad "maintenance mode is on or unknown"
for p in /docs /docs/ /v1/admin/auth/me /v1/admin/settings /; do
  [ "$(code "https://$(hp "$API")$p")" = 404 ] && ok "$p hidden on $API (404)" || bad "$p is reachable on $API"
done
[ "$(code "https://$(hp "$API")/v1/vehicles")" = 401 ] && ok "unauthenticated API call refused (401)" || bad "/v1/vehicles without a token is not 401"

# 4. Admin host IP restriction
a="$(code "https://$(hp "$ADMIN")/")"
case "$ADMIN_EXPECT:$a" in
  allowed:200) ok "admin host reachable from this allowed IP" ;;
  denied:403) ok "admin host refused from this non-allowed IP (403)" ;;
  *) bad "admin host answered $a, expected $( [ "$ADMIN_EXPECT" = allowed ] && echo 200 || echo 403 )" ;;
esac

# 5. Pilot access (optional, see header)
if [ -n "${VERIFY_UNINVITED_PHONE:-}" ]; then
  body="$(c -X POST -H 'Content-Type: application/json' -d "{\"phone\":\"$VERIFY_UNINVITED_PHONE\"}" "https://$(hp "$API")/v1/auth/otp/request" 2>/dev/null || true)"
  printf '%s' "$body" | grep -q '"PILOT_ACCESS_ONLY"' && ok "uninvited number refused before any SMS (PILOT_ACCESS_ONLY)" || bad "uninvited number was NOT refused: $body"
fi

[ $fail -eq 0 ] && echo "PUBLIC CHECKS PASSED ($API, $ADMIN)" || echo "PUBLIC CHECKS FAILED"
exit $fail
