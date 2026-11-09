# API

Versioned REST API under `/v1`. Interactive documentation: `/docs` (Swagger UI, enable with
`SWAGGER_ENABLED=true`); machine-readable spec: [`openapi.json`](openapi.json) (regenerate with
`pnpm --filter @moshina/backend run openapi`).

## Conventions

- **Auth (mobile):** `Authorization: Bearer <accessToken>` from `POST /v1/auth/otp/verify`. Access
  tokens live 15 min; rotate with `POST /v1/auth/refresh` (each refresh token is single-use; reusing
  one revokes the whole session).
- **Auth (admin):** `Authorization: Bearer <accessToken>` from `POST /v1/admin/auth/login`; the refresh
  token is an httpOnly cookie (`mb_admin_rt`, path `/v1/admin/auth`), refreshed with
  `POST /v1/admin/auth/refresh` + header `X-Requested-With: moshina-admin`.
- **Errors:** `{ "statusCode": 400, "code": "VALIDATION_FAILED", "message": "...", "details": [...], "requestId": "..." }`.
  Codes: `VALIDATION_FAILED, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, OTP_INVALID,
OTP_EXPIRED, OTP_ATTEMPTS_EXCEEDED, OTP_RESEND_COOLDOWN, OTP_LIMIT_EXCEEDED, SMS_SEND_FAILED,
SMS_NOT_CONFIGURED, PHONE_INVALID, REFRESH_TOKEN_INVALID, REFRESH_TOKEN_REUSED, ACCOUNT_RESTRICTED,
MILEAGE_DECREASE, FILE_INVALID, LIMIT_REACHED, ADMIN_LOCKED, INVALID_CREDENTIALS, INTERNAL_ERROR`.
  Rate-limit errors include `details.retryAfterSeconds`.
- **Ownership:** resources of other users answer `404` (existence is not revealed).
- **Pagination:** `?page=1&pageSize=20` (max 100) → `{ items, total, page, pageSize }`.
- **Sorting (admin lists):** `?sort=field:asc|desc` (allow-listed fields).
- **Money:** decimal strings in UZS (`"350000.00"`). **Dates:** `YYYY-MM-DD` (Asia/Tashkent calendar);
  instants: ISO 8601.
- **Idempotency:** authenticated `POST` requests accept `Idempotency-Key: <8–64 chars>`; a retry
  with the same key returns the original response (`Idempotent-Replay: true`) for 24 h.
- **Uploads:** `multipart/form-data` field `file`; JPEG/PNG/WebP/HEIC up to 8 MB; re-encoded to JPEG,
  metadata stripped. Files are served only to their owner via `GET /v1/files/{id}`.
- **Rate limits:** 120 req/min/IP globally; OTP request 5/min, verify 10/min, refresh 30/min, admin
  login `RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE` (10); plus OTP per-phone/per-IP hourly/daily limits.

## Main flows

```http
POST /v1/auth/otp/request   {"phone":"90 123 45 67","language":"uz"}
→ 200 {"requestId":"…","phone":"+998901234567","expiresInSeconds":300,"resendAfterSeconds":60}

POST /v1/auth/otp/verify    {"phone":"+998901234567","code":"123456"}
→ 200 {"tokens":{"accessToken":"…","refreshToken":"…",…},"user":{…},"isNewUser":true}

POST /v1/schedules/{id}/complete  {"date":"2026-06-01","mileage":50200,"cost":420000,"serviceProvider":"Oil Express"}
→ 200 {"schedule":{… next cycle …},"record":{…}}   # record + expense + odometer + schedule in one transaction
```

## Endpoints

### Files

| Method | Path             | Description                                                | Auth   |
| ------ | ---------------- | ---------------------------------------------------------- | ------ |
| `GET`  | `/v1/files/{id}` | Download a file you own (avatar, vehicle image or receipt) | Bearer |

### Notifications

| Method   | Path                          | Description                                       | Auth   |
| -------- | ----------------------------- | ------------------------------------------------- | ------ |
| `GET`    | `/v1/notifications`           | Notification history (with unread count)          | Bearer |
| `POST`   | `/v1/notifications/read-all`  | Mark all notifications as read                    | Bearer |
| `POST`   | `/v1/notifications/{id}/read` | Mark a notification as read                       | Bearer |
| `DELETE` | `/v1/notifications/{id}`      | Delete a notification                             | Bearer |
| `POST`   | `/v1/push-devices`            | Register or refresh this device’s Expo push token | Bearer |
| `POST`   | `/v1/push-devices/unregister` | Stop push notifications on this device            | Bearer |

### Auth

| Method | Path                   | Description                                                                                 | Auth   |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------- | ------ |
| `POST` | `/v1/auth/otp/request` | Send an SMS verification code                                                               | Public |
| `POST` | `/v1/auth/otp/verify`  | Verify the SMS code and obtain access/refresh tokens (creates the account on first sign-in) | Public |
| `POST` | `/v1/auth/refresh`     | Rotate the refresh token. Reusing an old refresh token revokes the whole session.           | Public |
| `POST` | `/v1/auth/logout`      | Revoke the current session and unregister the push token                                    | Bearer |
| `POST` | `/v1/auth/logout-all`  | Revoke all sessions of the current user                                                     | Bearer |

### Profile

| Method   | Path                      | Description                                                                   | Auth   |
| -------- | ------------------------- | ----------------------------------------------------------------------------- | ------ |
| `GET`    | `/v1/me`                  | Current user profile and settings                                             | Bearer |
| `PATCH`  | `/v1/me`                  | Update profile (full name)                                                    | Bearer |
| `PUT`    | `/v1/me/settings`         | Update language and notification preferences                                  | Bearer |
| `POST`   | `/v1/me/avatar`           | Upload profile photo (JPEG/PNG/WebP/HEIC, max 8 MB)                           | Bearer |
| `DELETE` | `/v1/me/avatar`           | Remove profile photo                                                          | Bearer |
| `POST`   | `/v1/me/deletion-request` | Request account deletion (data is permanently deleted after the grace period) | Bearer |
| `DELETE` | `/v1/me/deletion-request` | Cancel a pending account deletion request                                     | Bearer |

### Vehicles

| Method   | Path                                       | Description                                                       | Auth   |
| -------- | ------------------------------------------ | ----------------------------------------------------------------- | ------ |
| `GET`    | `/v1/vehicles`                             | List my vehicles (primary first)                                  | Bearer |
| `POST`   | `/v1/vehicles`                             | Add a vehicle                                                     | Bearer |
| `GET`    | `/v1/vehicles/{id}`                        | Vehicle details                                                   | Bearer |
| `PATCH`  | `/v1/vehicles/{id}`                        | Edit a vehicle                                                    | Bearer |
| `DELETE` | `/v1/vehicles/{id}`                        | Delete a vehicle with its schedules, history, expenses and images | Bearer |
| `POST`   | `/v1/vehicles/{id}/primary`                | Set as primary vehicle                                            | Bearer |
| `POST`   | `/v1/vehicles/{id}/mileage`                | Record a new odometer reading                                     | Bearer |
| `GET`    | `/v1/vehicles/{id}/mileage-logs`           | Odometer reading history (latest 100)                             | Bearer |
| `POST`   | `/v1/vehicles/{id}/images`                 | Upload a vehicle image (max 10 per vehicle)                       | Bearer |
| `POST`   | `/v1/vehicles/{id}/images/{imageId}/cover` | Use an image as the vehicle cover                                 | Bearer |
| `DELETE` | `/v1/vehicles/{id}/images/{imageId}`       | Delete a vehicle image                                            | Bearer |

### Maintenance

| Method   | Path                          | Description                                                                                       | Auth   |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| `GET`    | `/v1/service-types`           | Maintenance categories (built-in + my custom). Intervals are suggestions, not manufacturer specs. | Bearer |
| `POST`   | `/v1/service-types`           | Create a custom service category                                                                  | Bearer |
| `PUT`    | `/v1/service-types/{id}`      | Edit my custom service category                                                                   | Bearer |
| `DELETE` | `/v1/service-types/{id}`      | Delete an unused custom service category                                                          | Bearer |
| `GET`    | `/v1/schedules`               | Maintenance schedules with computed status (most urgent first)                                    | Bearer |
| `POST`   | `/v1/schedules`               | Create a maintenance schedule                                                                     | Bearer |
| `GET`    | `/v1/schedules/{id}`          | Schedule details                                                                                  | Bearer |
| `PATCH`  | `/v1/schedules/{id}`          | Edit a schedule (intervals, baseline, estimate, notes, active)                                    | Bearer |
| `DELETE` | `/v1/schedules/{id}`          | Delete a schedule (service history is kept)                                                       | Bearer |
| `POST`   | `/v1/schedules/{id}/complete` | Mark maintenance as completed (creates history record + expense, advances schedule)               | Bearer |

### Service history

| Method   | Path                                          | Description                                                      | Auth   |
| -------- | --------------------------------------------- | ---------------------------------------------------------------- | ------ |
| `GET`    | `/v1/records`                                 | Service history with filters, search and pagination              | Bearer |
| `POST`   | `/v1/records`                                 | Add a service record (updates the related schedule when newer)   | Bearer |
| `GET`    | `/v1/records/{id}`                            | Service record details                                           | Bearer |
| `PATCH`  | `/v1/records/{id}`                            | Edit a service record                                            | Bearer |
| `DELETE` | `/v1/records/{id}`                            | Delete a service record (and its linked expense and attachments) | Bearer |
| `POST`   | `/v1/records/{id}/attachments`                | Attach a receipt/photo (image, max 8 MB)                         | Bearer |
| `DELETE` | `/v1/records/{id}/attachments/{attachmentId}` | Delete an attachment                                             | Bearer |

### Expenses

| Method   | Path                 | Description                                                            | Auth   |
| -------- | -------------------- | ---------------------------------------------------------------------- | ------ |
| `GET`    | `/v1/expenses`       | List expenses with filters (includes total amount of the filtered set) | Bearer |
| `POST`   | `/v1/expenses`       | Add an expense                                                         | Bearer |
| `GET`    | `/v1/expenses/stats` | Expense statistics by category, month and vehicle                      | Bearer |
| `GET`    | `/v1/expenses/{id}`  | Expense details                                                        | Bearer |
| `PATCH`  | `/v1/expenses/{id}`  | Edit an expense (not for expenses created from service records)        | Bearer |
| `DELETE` | `/v1/expenses/{id}`  | Delete an expense                                                      | Bearer |

### Dashboard

| Method | Path            | Description                                            | Auth   |
| ------ | --------------- | ------------------------------------------------------ | ------ |
| `GET`  | `/v1/dashboard` | Home screen data for the selected (or primary) vehicle | Bearer |

### Health

| Method | Path               | Description                        | Auth   |
| ------ | ------------------ | ---------------------------------- | ------ |
| `GET`  | `/v1/health/live`  | Liveness probe                     | Public |
| `GET`  | `/v1/health/ready` | Readiness probe (database + Redis) | Public |

### App

| Method | Path             | Description                                                      | Auth   |
| ------ | ---------------- | ---------------------------------------------------------------- | ------ |
| `GET`  | `/v1/app-config` | Public client configuration (support contacts, default language) | Public |

### Admin · Auth

| Method | Path                      | Description                                        | Auth   |
| ------ | ------------------------- | -------------------------------------------------- | ------ |
| `POST` | `/v1/admin/auth/login`    | Administrator login (sets httpOnly refresh cookie) | Public |
| `POST` | `/v1/admin/auth/refresh`  | Rotate the admin session using the refresh cookie  | Bearer |
| `POST` | `/v1/admin/auth/logout`   | End the admin session                              | Public |
| `GET`  | `/v1/admin/auth/me`       | Current administrator profile and permissions      | Bearer |
| `POST` | `/v1/admin/auth/password` | Change own password (signs out all sessions)       | Bearer |

### Admin · Dashboard

| Method | Path                        | Description                                 | Auth   |
| ------ | --------------------------- | ------------------------------------------- | ------ |
| `GET`  | `/v1/admin/dashboard/stats` | Platform statistics computed from live data | Bearer |

### Admin · Users

| Method | Path                                   | Description                                           | Auth   |
| ------ | -------------------------------------- | ----------------------------------------------------- | ------ |
| `GET`  | `/v1/admin/users`                      | List app users (phones masked without users.view_pii) | Bearer |
| `GET`  | `/v1/admin/users/{id}`                 | User details and activity                             | Bearer |
| `POST` | `/v1/admin/users/{id}/restrict`        | Restrict an account (signs the user out everywhere)   | Bearer |
| `POST` | `/v1/admin/users/{id}/unrestrict`      | Lift an account restriction                           | Bearer |
| `POST` | `/v1/admin/users/{id}/revoke-sessions` | Sign the user out of all devices                      | Bearer |

### Admin · Vehicles

| Method | Path                      | Description                                              | Auth   |
| ------ | ------------------------- | -------------------------------------------------------- | ------ |
| `GET`  | `/v1/admin/vehicles`      | List vehicles with owner information                     | Bearer |
| `GET`  | `/v1/admin/vehicles/{id}` | Vehicle details (schedules, record count, expense total) | Bearer |

### Admin · Maintenance

| Method   | Path                                       | Description                                                              | Auth   |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------ | ------ |
| `GET`    | `/v1/admin/maintenance/service-types`      | System maintenance categories with usage counts                          | Bearer |
| `POST`   | `/v1/admin/maintenance/service-types`      | Create a system maintenance category                                     | Bearer |
| `PUT`    | `/v1/admin/maintenance/service-types/{id}` | Update a system category (names, suggested intervals, active)            | Bearer |
| `DELETE` | `/v1/admin/maintenance/service-types/{id}` | Delete an unused system category (deactivate it instead if it is in use) | Bearer |
| `GET`    | `/v1/admin/maintenance/stats`              | Maintenance statistics                                                   | Bearer |

### Admin · Notifications

| Method | Path                                                | Description                                                         | Auth   |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| `GET`  | `/v1/admin/notifications`                           | Notification history with delivery status                           | Bearer |
| `GET`  | `/v1/admin/notifications/templates`                 | Notification templates                                              | Bearer |
| `PUT`  | `/v1/admin/notifications/templates/{code}`          | Update a notification template                                      | Bearer |
| `GET`  | `/v1/admin/notifications/announcements`             | System announcements (scheduled and sent)                           | Bearer |
| `POST` | `/v1/admin/notifications/announcements`             | Create a system announcement (send now or schedule)                 | Bearer |
| `POST` | `/v1/admin/notifications/announcements/{id}/cancel` | Cancel a scheduled announcement                                     | Bearer |
| `GET`  | `/v1/admin/notifications/scheduled`                 | Upcoming scheduled work: announcements and reminder engine schedule | Bearer |
| `POST` | `/v1/admin/notifications/reminders/run`             | Run the reminder engine now (deduplicated; never sends duplicates)  | Bearer |

### Admin · Administrators

| Method   | Path                             | Description                                                      | Auth   |
| -------- | -------------------------------- | ---------------------------------------------------------------- | ------ |
| `GET`    | `/v1/admin/admins`               | List administrators                                              | Bearer |
| `POST`   | `/v1/admin/admins`               | Create an administrator                                          | Bearer |
| `PATCH`  | `/v1/admin/admins/{id}`          | Update an administrator (name, role, enable/disable)             | Bearer |
| `POST`   | `/v1/admin/admins/{id}/password` | Set a new password for an administrator (revokes their sessions) | Bearer |
| `GET`    | `/v1/admin/roles`                | Roles and their permissions                                      | Bearer |
| `POST`   | `/v1/admin/roles`                | Create a custom role                                             | Bearer |
| `GET`    | `/v1/admin/permissions`          | All available permissions                                        | Bearer |
| `PUT`    | `/v1/admin/roles/{id}`           | Update a role’s permissions (the Super Admin role is locked)     | Bearer |
| `DELETE` | `/v1/admin/roles/{id}`           | Delete an unused custom role                                     | Bearer |
| `GET`    | `/v1/admin/audit-logs`           | Administrator audit log                                          | Bearer |

### Admin · Settings

| Method | Path                        | Description                                                         | Auth   |
| ------ | --------------------------- | ------------------------------------------------------------------- | ------ |
| `GET`  | `/v1/admin/settings`        | System settings (reminder thresholds, defaults, support contacts)   | Bearer |
| `PUT`  | `/v1/admin/settings/{key}`  | Change a system setting                                             | Bearer |
| `GET`  | `/v1/admin/settings/health` | System health: database, Redis, SMS provider, push, queues, storage | Bearer |

Admin endpoints additionally require the permission shown in their Swagger description
(`@RequirePermissions`), e.g. `users.view`, `users.manage`, `admins.manage`, `settings.manage`.
