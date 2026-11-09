-- CreateEnum
CREATE TYPE "Language" AS ENUM ('uz', 'ru', 'en');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'DELETION_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'GAS_METHANE', 'GAS_PROPANE', 'HYBRID', 'ELECTRIC', 'PETROL_GAS');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FUEL', 'MAINTENANCE', 'REPAIR', 'PARTS', 'OTHER');

-- CreateEnum
CREATE TYPE "MileageSource" AS ENUM ('MANUAL', 'SERVICE', 'EXPENSE', 'VEHICLE_CREATE', 'VEHICLE_EDIT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MAINTENANCE_UPCOMING', 'MAINTENANCE_DUE', 'MAINTENANCE_OVERDUE', 'MILEAGE_UPDATE_REQUIRED', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('AVATAR', 'VEHICLE_IMAGE', 'RECORD_ATTACHMENT');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(120),
    "avatar_file_id" UUID,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "restriction_reason" VARCHAR(500),
    "deletion_requested_at" TIMESTAMPTZ(3),
    "deletion_scheduled_at" TIMESTAMPTZ(3),
    "last_active_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'uz',
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "maintenance_reminders" BOOLEAN NOT NULL DEFAULT true,
    "mileage_reminders" BOOLEAN NOT NULL DEFAULT true,
    "announcements" BOOLEAN NOT NULL DEFAULT true,
    "primary_vehicle_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "brand" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "year" SMALLINT NOT NULL,
    "registration_number" VARCHAR(20) NOT NULL,
    "vin" VARCHAR(17),
    "fuel_type" "FuelType" NOT NULL,
    "engine_size" DECIMAL(4,1),
    "current_mileage" INTEGER NOT NULL,
    "mileage_updated_at" TIMESTAMPTZ(3),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_images" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mileage_logs" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "mileage" INTEGER NOT NULL,
    "source" "MileageSource" NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mileage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "owner_user_id" UUID,
    "name_uz" VARCHAR(80) NOT NULL,
    "name_ru" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "suggested_interval_days" INTEGER,
    "suggested_interval_km" INTEGER,
    "icon" VARCHAR(40) NOT NULL DEFAULT 'wrench',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_schedules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "last_service_date" DATE NOT NULL,
    "last_service_mileage" INTEGER NOT NULL,
    "interval_days" INTEGER,
    "interval_km" INTEGER,
    "next_due_date" DATE,
    "next_due_mileage" INTEGER,
    "estimated_cost" DECIMAL(14,2),
    "notes" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "schedule_id" UUID,
    "service_date" DATE NOT NULL,
    "mileage" INTEGER NOT NULL,
    "parts_used" VARCHAR(1000),
    "service_provider" VARCHAR(160),
    "cost" DECIMAL(14,2),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_attachments" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expense_date" DATE NOT NULL,
    "mileage" INTEGER,
    "liters" DECIMAL(8,2),
    "description" VARCHAR(500),
    "service_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1200) NOT NULL,
    "data" JSONB,
    "dedupe_key" VARCHAR(200),
    "announcement_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "push_status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "push_device_id" UUID,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "ticket_id" VARCHAR(100),
    "error" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(3),
    "receipt_checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "device_name" VARCHAR(120),
    "app_version" VARCHAR(40),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "code" "NotificationType" NOT NULL,
    "title_uz" VARCHAR(120) NOT NULL,
    "title_ru" VARCHAR(120) NOT NULL,
    "title_en" VARCHAR(120) NOT NULL,
    "body_uz" VARCHAR(500) NOT NULL,
    "body_ru" VARCHAR(500) NOT NULL,
    "body_en" VARCHAR(500) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title_uz" VARCHAR(120) NOT NULL,
    "title_ru" VARCHAR(120) NOT NULL,
    "title_en" VARCHAR(120) NOT NULL,
    "body_uz" VARCHAR(1000) NOT NULL,
    "body_ru" VARCHAR(1000) NOT NULL,
    "body_en" VARCHAR(1000) NOT NULL,
    "target_language" "Language",
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_verifications" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "request_ip" VARCHAR(64),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "provider" VARCHAR(32) NOT NULL,
    "provider_message_id" VARCHAR(100),
    "sms_status" "SmsStatus" NOT NULL DEFAULT 'PENDING',
    "sms_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(40),
    "replaced_by_id" UUID,
    "user_agent" VARCHAR(255),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permissions" (
    "code" VARCHAR(60) NOT NULL,
    "description" VARCHAR(240) NOT NULL,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40),
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(240),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_code" VARCHAR(60) NOT NULL,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("role_id","permission_code")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" VARCHAR(255),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(64),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sms_provider_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_avatar_file_id_key" ON "users"("avatar_file_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_primary_vehicle_id_key" ON "user_settings"("primary_vehicle_id");

-- CreateIndex
CREATE INDEX "user_settings_language_idx" ON "user_settings"("language");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");

-- CreateIndex
CREATE INDEX "stored_files_owner_user_id_idx" ON "stored_files"("owner_user_id");

-- CreateIndex
CREATE INDEX "vehicles_user_id_idx" ON "vehicles"("user_id");

-- CreateIndex
CREATE INDEX "vehicles_created_at_idx" ON "vehicles"("created_at");

-- CreateIndex
CREATE INDEX "vehicles_registration_number_idx" ON "vehicles"("registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_images_file_id_key" ON "vehicle_images"("file_id");

-- CreateIndex
CREATE INDEX "vehicle_images_vehicle_id_idx" ON "vehicle_images"("vehicle_id");

-- CreateIndex
CREATE INDEX "mileage_logs_vehicle_id_recorded_at_idx" ON "mileage_logs"("vehicle_id", "recorded_at");

-- CreateIndex
CREATE INDEX "service_types_is_active_idx" ON "service_types"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_owner_user_id_code_key" ON "service_types"("owner_user_id", "code");

-- CreateIndex
CREATE INDEX "maintenance_schedules_user_id_idx" ON "maintenance_schedules"("user_id");

-- CreateIndex
CREATE INDEX "maintenance_schedules_is_active_next_due_date_idx" ON "maintenance_schedules"("is_active", "next_due_date");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_schedules_vehicle_id_service_type_id_key" ON "maintenance_schedules"("vehicle_id", "service_type_id");

-- CreateIndex
CREATE INDEX "maintenance_records_user_id_service_date_idx" ON "maintenance_records"("user_id", "service_date");

-- CreateIndex
CREATE INDEX "maintenance_records_vehicle_id_service_date_idx" ON "maintenance_records"("vehicle_id", "service_date");

-- CreateIndex
CREATE INDEX "maintenance_records_service_type_id_idx" ON "maintenance_records"("service_type_id");

-- CreateIndex
CREATE INDEX "maintenance_records_created_at_idx" ON "maintenance_records"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_attachments_file_id_key" ON "maintenance_attachments"("file_id");

-- CreateIndex
CREATE INDEX "maintenance_attachments_record_id_idx" ON "maintenance_attachments"("record_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_service_record_id_key" ON "expenses"("service_record_id");

-- CreateIndex
CREATE INDEX "expenses_user_id_expense_date_idx" ON "expenses"("user_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_vehicle_id_expense_date_idx" ON "expenses"("vehicle_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_type_created_at_idx" ON "notifications"("type", "created_at");

-- CreateIndex
CREATE INDEX "notifications_push_status_idx" ON "notifications"("push_status");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_receipt_checked_at_idx" ON "notification_deliveries"("status", "receipt_checked_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_ticket_id_idx" ON "notification_deliveries"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_disabled_at_idx" ON "push_devices"("user_id", "disabled_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_code_key" ON "notification_templates"("code");

-- CreateIndex
CREATE INDEX "announcements_status_scheduled_at_idx" ON "announcements"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "sms_verifications_phone_created_at_idx" ON "sms_verifications"("phone", "created_at");

-- CreateIndex
CREATE INDEX "sms_verifications_request_ip_created_at_idx" ON "sms_verifications"("request_ip", "created_at");

-- CreateIndex
CREATE INDEX "sms_verifications_provider_message_id_idx" ON "sms_verifications"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_code_key" ON "admin_roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_id_idx" ON "admin_users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_revoked_at_idx" ON "admin_sessions"("admin_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "admin_sessions_family_id_idx" ON "admin_sessions"("family_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_user_id_created_at_idx" ON "admin_audit_logs"("admin_user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_entity_type_entity_id_idx" ON "admin_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "sms_provider_events_provider_created_at_idx" ON "sms_provider_events"("provider", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_primary_vehicle_id_fkey" FOREIGN KEY ("primary_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mileage_logs" ADD CONSTRAINT "mileage_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "maintenance_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "maintenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "maintenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_push_device_id_fkey" FOREIGN KEY ("push_device_id") REFERENCES "push_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "admin_permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints not expressible in Prisma schema
-- ---------------------------------------------------------------------------

-- System maintenance categories (owner NULL) must have unique codes.
CREATE UNIQUE INDEX "service_types_system_code_key" ON "service_types" ("code") WHERE "owner_user_id" IS NULL;

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_year_check" CHECK ("year" BETWEEN 1950 AND 2100),
  ADD CONSTRAINT "vehicles_mileage_check" CHECK ("current_mileage" >= 0),
  ADD CONSTRAINT "vehicles_engine_size_check" CHECK ("engine_size" IS NULL OR "engine_size" > 0);

ALTER TABLE "mileage_logs" ADD CONSTRAINT "mileage_logs_mileage_check" CHECK ("mileage" >= 0);

ALTER TABLE "maintenance_schedules"
  ADD CONSTRAINT "schedules_interval_check" CHECK ("interval_days" IS NOT NULL OR "interval_km" IS NOT NULL),
  ADD CONSTRAINT "schedules_interval_days_check" CHECK ("interval_days" IS NULL OR "interval_days" > 0),
  ADD CONSTRAINT "schedules_interval_km_check" CHECK ("interval_km" IS NULL OR "interval_km" > 0),
  ADD CONSTRAINT "schedules_mileage_check" CHECK ("last_service_mileage" >= 0),
  ADD CONSTRAINT "schedules_cost_check" CHECK ("estimated_cost" IS NULL OR "estimated_cost" >= 0);

ALTER TABLE "maintenance_records"
  ADD CONSTRAINT "records_mileage_check" CHECK ("mileage" >= 0),
  ADD CONSTRAINT "records_cost_check" CHECK ("cost" IS NULL OR "cost" >= 0);

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "expenses_mileage_check" CHECK ("mileage" IS NULL OR "mileage" >= 0),
  ADD CONSTRAINT "expenses_liters_check" CHECK ("liters" IS NULL OR "liters" > 0);

ALTER TABLE "sms_verifications" ADD CONSTRAINT "sms_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= "max_attempts");
