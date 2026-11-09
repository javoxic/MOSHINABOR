# SMS provider setup — Eskiz.uz

**Audience:** the SMS provider contact (account owner at Eskiz) and the server operator.
**Result:** staging sends real verification codes to invited pilot testers' Uzbek numbers, and delivery reports come back.

> **Status:** **Blocked by external credentials.** No Eskiz account is configured anywhere. The integration is implemented: `backend/src/sms/providers/eskiz.provider.ts`, delivery webhook `backend/src/sms/sms-webhook.controller.ts`. It is tested only against simulated Eskiz responses, plus sandbox checks of the webhook and failure paths (see [Validation](#validation)). No real SMS has been sent. Until credentials exist, sign-in answers `503 SMS_NOT_CONFIGURED` and never pretends a code was sent.

## 1. How the integration works (what Eskiz must allow)

| Step            | Call                                                                                                                                  | Detail                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticate    | `POST https://notify.eskiz.uz/api/auth/login` (form: `email`, `password`)                                                             | The returned token is cached in Redis (`sms:eskiz:token`, 25 days). On HTTP 401 the API logs in again automatically.                                                                                                                         |
| Send            | `POST /message/sms/send` (form: `mobile_phone` = `998XXXXXXXXX`, `message`, `from` = `ESKIZ_FROM`, `callback_url`)                    | Text = the OTP template with `{code}` replaced; one SMS per request; 10 s timeout                                                                                                                                                            |
| Delivery report | Eskiz → `POST https://staging.moshinabor.uz/v1/webhooks/sms/eskiz?secret=<SMS_CALLBACK_SECRET>` (body `message_id` or `id`, `status`) | The secret is compared in constant time; wrong or missing → 403. `DELIVRD`/`DELIVERED` → DELIVERED; `UNDELIV`, `EXPIRED`, `REJECTD`, `REJECTED`, `FAILED` → FAILED. The secret is redacted in API logs and not written to nginx access logs. |
| Numbers         | +998 mobile numbers only                                                                                                              | Other countries are refused unless the optional Twilio provider is configured (not part of this pilot)                                                                                                                                       |

Outgoing HTTPS from the server to `notify.eskiz.uz:443` must be allowed. The default `ufw` policy allows all outgoing traffic.

## 2. Required account details (SMS provider contact)

Obtain these from Eskiz. Their cabinet is at `my.eskiz.uz`; menu names can change, so ask Eskiz support if a section is not where described.

| Item                     | Notes                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract / legal entity  | Eskiz requires a contract with a legal entity or individual entrepreneur before production traffic. Have the company details ready.                                                     |
| Cabinet login e-mail     | → `ESKIZ_EMAIL`                                                                                                                                                                         |
| Cabinet / API password   | → `ESKIZ_PASSWORD`. Use a dedicated API user if Eskiz offers one, and a separate account or sub-account for staging if possible.                                                        |
| Sender name ("nickname") | `4546` is the Eskiz default and works without registration. A branded alpha sender (e.g. `MOSHINABOR`) needs Eskiz approval and operator registration, which takes days. → `ESKIZ_FROM` |
| Balance                  | Top up a small amount for staging (pilot: tens of testers × a few codes)                                                                                                                |
| **Approved templates**   | See §3. Eskiz only delivers texts that match an approved template; others are rejected. New accounts may be limited to Eskiz's own test text until moderation is complete.              |

**Secure storage:** the e-mail and password go to the team password manager entry "Eskiz — MOSHINA BOR staging" and to `.env.staging` on the server. Never to chat, tickets or git.

## 3. OTP template approval

Submit these three texts in the Eskiz cabinet's template section, exactly as written (the app's defaults, `backend/src/config/env.ts`). `{code}` is a 6-digit number. Describe it to Eskiz as "one-time verification code for sign-in".

| Language        | Template                                                          | Env override          |
| --------------- | ----------------------------------------------------------------- | --------------------- |
| Uzbek (default) | `MOSHINA BOR: tasdiqlash kodi {code}. Kodni hech kimga bermang.`  | `SMS_OTP_TEMPLATE_UZ` |
| Russian         | `MOSHINA BOR: код подтверждения {code}. Никому не сообщайте код.` | `SMS_OTP_TEMPLATE_RU` |
| English         | `MOSHINA BOR: your verification code is {code}. Do not share it.` | `SMS_OTP_TEMPLATE_EN` |

If Eskiz approves different wording, put the **approved text verbatim** into the matching env variable, keeping `{code}` where the number goes. The API refuses to start if a template lacks `{code}`. Cyrillic texts are longer per SMS segment; keep them to one segment (≤ 70 characters) to control cost.

## 4. Environment variable mapping (`infrastructure/deployment/.env.staging`)

| Variable                                                                                        | Value                                                                                                                                          | Required                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `SMS_PROVIDER`                                                                                  | `eskiz`                                                                                                                                        | yes (template default)  |
| `ESKIZ_EMAIL`                                                                                   | `<ESKIZ_LOGIN_EMAIL>`                                                                                                                          | yes                     |
| `ESKIZ_PASSWORD`                                                                                | `<ESKIZ_PASSWORD>`                                                                                                                             | yes                     |
| `ESKIZ_FROM`                                                                                    | `4546` or `<APPROVED_SENDER_NAME>`                                                                                                             | yes                     |
| `SMS_CALLBACK_SECRET`                                                                           | generated by the runbook (`openssl rand -hex 32`); **do not** give it to Eskiz manually. The API includes it in each message's `callback_url`. | yes (`check-config.sh`) |
| `API_PUBLIC_URL`                                                                                | `https://staging.moshinabor.uz` (base of the callback URL)                                                                                     | yes                     |
| `SMS_OTP_TEMPLATE_UZ/RU/EN`                                                                     | only if the approved wording differs                                                                                                           | no                      |
| `SMS_INTERNATIONAL_PROVIDER`                                                                    | `none`                                                                                                                                         | —                       |
| `ESKIZ_BASE_URL`                                                                                | leave unset (`https://notify.eskiz.uz/api`)                                                                                                    | no                      |
| `OTP_TTL_SECONDS`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_MAX_PER_IP_PER_HOUR` | leave the defaults (300 s, 60 s, 5, 60)                                                                                                        | no                      |

Enter the values on the server only:

```sh
$ cd /srv/moshinabor/infrastructure/deployment
$ nano .env.staging                       # fill ESKIZ_EMAIL / ESKIZ_PASSWORD / ESKIZ_FROM
$ ./check-config.sh .env.staging          # the "Eskiz credentials empty" warning must be gone
$ ./deploy.sh .env.staging "$(git rev-parse --short HEAD)"   # restarts api/worker with the new values (backup first)
```

## 5. Safe test procedure

Rules:

- Test only with phone numbers whose owners agreed to receive test SMS, normally the operator's and the pilot testers' own.
- Each number must be **invited** in Admin → Settings → Pilot access. Uninvited numbers are refused before any SMS is sent.
- Never script loops. Per phone, the limits are 5 codes per hour, 10 per day, and a 60 s cooldown. Each code costs money.

| #   | Step                                                                         | Expected                                                                                                      |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Admin → Settings → System health                                             | SMS provider `eskiz`, **configured: yes**                                                                     |
| 2   | Admin → Settings → Pilot access → invite `<TEST_PHONE>` (a number you own)   | audited `access.invite`                                                                                       |
| 3   | In the pilot app (or with the curl below), request a code for `<TEST_PHONE>` | the app shows the code screen; the phone receives **one** SMS in Uzbek within ~30 s, text exactly as approved |
| 4   | Enter the code                                                               | signed in                                                                                                     |
| 5   | System health                                                                | "last success" updated                                                                                        |
| 6   | Delivery status (§6)                                                         | `SENT`, then `DELIVERED` once Eskiz reports                                                                   |

Without the app, for step 3, run from any machine:

```sh
curl -sS -X POST https://staging.moshinabor.uz/v1/auth/otp/request \
  -H 'Content-Type: application/json' -d '{"phone":"<TEST_PHONE_E164>","language":"uz"}'
# expected: {"requestId":"…","phone":"+998…","expiresInSeconds":300,"resendAfterSeconds":60}
```

The response never contains the code. The code arrives only by SMS.

## 6. Delivery and failure verification

**Delivery status** (on the server; shows no codes, because only hashes are stored):

```sh
$ cd /srv/moshinabor/infrastructure/deployment && . ./.env.staging
$ docker compose --env-file .env.staging -p moshina-bor-staging exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT created_at, provider, sms_status, provider_message_id, left(sms_error, 80) AS sms_error FROM sms_verifications ORDER BY created_at DESC LIMIT 5;"
```

| `sms_status`                     | Meaning                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SENT` + a `provider_message_id` | Eskiz accepted the message                                                                           |
| `DELIVERED`                      | Eskiz's delivery report reached the webhook. This proves the callback path end to end.               |
| `FAILED` + `sms_error`           | Eskiz refused, the operator rejected, or delivery expired. The user saw an error; nothing was faked. |
| `SENT` for more than 10 min      | No delivery report arrived. Check the callback (below) and the Eskiz cabinet's message log.          |

**Callback path check without sending an SMS.** Run on the server. The secret is passed through stdin, so it never appears in the process list. No database row matches the fake id, so nothing changes.

```sh
$ ( . ./.env.staging
    printf 'url = "https://%s/v1/webhooks/sms/eskiz?secret=%s"\n' "$API_DOMAIN" "$SMS_CALLBACK_SECRET" \
    | curl -sS -K - -H 'Content-Type: application/json' -d '{"message_id":"callback-test-0","status":"DELIVRD"}' -w ' HTTP %{http_code}\n' )
# expected: {"ok":true} HTTP 200
$ curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://staging.moshinabor.uz/v1/webhooks/sms/eskiz?secret=wrong"   # expected 403
```

**Failure behaviour.** What users and operators see; nothing is faked:

| Situation                             | API answer               | Where it shows                                                                                    |
| ------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| Credentials missing                   | `503 SMS_NOT_CONFIGURED` | System health "configured: no"; `check-config.sh` warning                                         |
| Wrong password / Eskiz login fails    | `502 SMS_SEND_FAILED`    | System health "last error: Eskiz authentication failed (HTTP 401)"; `sms_verifications.sms_error` |
| Template not approved / text rejected | `502 SMS_SEND_FAILED`    | `sms_error` contains Eskiz's message, e.g. HTTP 400                                               |
| Eskiz down / timeout                  | `502 SMS_SEND_FAILED`    | `sms_error` "Eskiz request failed"                                                                |
| Uninvited number (pilot)              | `403 PILOT_ACCESS_ONLY`  | no SMS, no row                                                                                    |

Optional controlled failure test, one SMS attempt that cannot be delivered:

1. Set a wrong `ESKIZ_PASSWORD` and redeploy.
2. Clear the cached token. Otherwise the old token keeps working:

   ```sh
   $ docker compose --env-file .env.staging -p moshina-bor-staging exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli DEL sms:eskiz:token'
   ```

3. Request a code for an invited test number. Expect 502 and the authentication error in System health.
4. Restore the password, redeploy, and run step 2 again.

**After rotating the Eskiz password,** always run the token-cache command above.

## Validation

Sandbox, 2026-11-09:

| Item                                                                                                       | Result                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Request/response handling, token reuse and re-login, timeouts, error mapping                               | unit tests with simulated Eskiz responses (`providers.spec.ts`, `auth.e2e-spec.ts`) pass |
| No credentials → 503, nothing claimed as sent                                                              | verified on the sandbox staging stack                                                    |
| Uninvited number → 403 before any SMS                                                                      | verified through the public edge                                                         |
| Callback through the edge: correct secret 200, wrong or missing 403; secret absent from all container logs | verified (`curl -K -` command above)                                                     |
| Token-cache reset command; delivery-status SQL                                                             | executed against the sandbox stack                                                       |
| Real Eskiz login, sending, template moderation, delivery reports                                           | **not verified**: blocked by external credentials                                        |
