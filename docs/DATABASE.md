# Database

PostgreSQL 16 managed with Prisma 6. Schema: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).
Migrations: [`backend/prisma/migrations`](../backend/prisma/migrations) (the initial migration also adds
CHECK constraints and a partial unique index that Prisma cannot express).

## Conventions

- UUID primary keys (`gen_random_uuid` via Prisma `uuid()`), snake_case table/column names.
- Money: `NUMERIC(14,2)` (UZS). Volumes `NUMERIC(8,2)`, engine size `NUMERIC(4,1)`.
- Calendar dates (service/expense/due dates): `DATE` in the Asia/Tashkent calendar.
- Instants: `TIMESTAMPTZ(3)`.
- Ownership: every user-owned row carries `user_id` (FK → users, `ON DELETE CASCADE`) and is indexed.

## Tables

| Table | Purpose | Notable constraints / indexes |
|---|---|---|
| `users` | App users (phone E.164) | unique `phone`; idx `status`, `created_at`, `last_active_at` |
| `user_settings` | Language, notification prefs, primary vehicle | PK `user_id`; unique `primary_vehicle_id` |
| `stored_files` | Uploaded images (avatar, vehicle, receipt) | unique `storage_key`; idx `owner_user_id` |
| `vehicles` | Vehicles | CHECK year 1950–2100, mileage ≥ 0; idx `user_id` |
| `vehicle_images` | Vehicle photos | unique `file_id`; idx `vehicle_id` |
| `mileage_logs` | Odometer readings with source | idx `(vehicle_id, recorded_at)` |
| `service_types` | System (owner NULL) and custom categories | unique `(owner_user_id, code)`; partial unique `code WHERE owner_user_id IS NULL` |
| `maintenance_schedules` | Schedules and computed next due | unique `(vehicle_id, service_type_id)`; CHECK at least one interval > 0; idx `(is_active, next_due_date)` |
| `maintenance_records` | Service history | idx `(user_id, service_date)`, `(vehicle_id, service_date)` |
| `maintenance_attachments` | Receipts/photos of records | unique `file_id` |
| `expenses` | Expenses | CHECK amount > 0; unique `service_record_id` (expense created from a record); idx `(user_id, expense_date)` |
| `notifications` | In-app notifications | **unique `(user_id, dedupe_key)`** (reminder dedup); idx `(user_id, created_at)` |
| `notification_deliveries` | Push ticket per device | idx `(status, receipt_checked_at)` |
| `push_devices` | Expo push tokens | unique `token` |
| `notification_templates` | Localized reminder templates | unique `code` |
| `announcements` | Admin broadcasts | idx `(status, scheduled_at)` |
| `sms_verifications` | OTP requests (HMAC hash only) | CHECK `attempts ≤ max_attempts`; idx `(phone, created_at)`, `(request_ip, created_at)` |
| `sms_provider_events` | Provider success/failure log (no message text) | idx `(provider, created_at)` |
| `refresh_tokens` | Mobile sessions (SHA-256 hash), rotation chain | unique `token_hash`; idx `family_id` |
| `admin_users` | Administrators (argon2id hash) | unique `email` |
| `admin_roles`, `admin_permissions`, `admin_role_permissions` | RBAC | unique role `code`/`name` |
| `admin_sessions` | Admin refresh sessions (hash) | unique `token_hash` |
| `admin_audit_logs` | Privileged action log | idx `(admin_user_id, created_at)`, `(action, created_at)` |
| `system_settings` | Runtime-tunable settings (JSON values) | PK `key` |

## Setup

```bash
cd backend
npx prisma migrate deploy        # apply migrations (safe for production)
node dist/scripts/seed.js        # idempotent reference data (roles, permissions, categories, templates)
ADMIN_EMAIL=... ADMIN_PASSWORD=... node dist/scripts/create-admin.js
```

The seed never creates users or administrators. In Docker the API container runs
`migrate deploy` + seed on start when `RUN_MIGRATIONS=true`.

Creating new migrations during development: edit `schema.prisma`, then `npx prisma migrate dev --name <change>`.

## Retention jobs (worker, Asia/Tashkent)

| Job | Schedule | Action |
|---|---|---|
| account purge | 03:30 daily | delete accounts past `deletion_scheduled_at` (cascade) and their files |
| cleanup | 04:00 daily | delete OTP rows > 30 days, expired refresh/admin sessions > 7 days, SMS events > 90 days |

## Backups

The `backup` Compose service runs `pg_dump --format=custom` (verified with `pg_restore --list`) plus a
tarball of uploaded files every `BACKUP_INTERVAL_SECONDS` (default daily), keeping
`BACKUP_RETENTION_DAYS` (default 14). Restore: `infrastructure/deployment/restore.sh`. Copy backups
off-host (e.g. object storage with versioning) — see DEPLOYMENT.md.
