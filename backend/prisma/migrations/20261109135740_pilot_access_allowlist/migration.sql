-- CreateTable
CREATE TABLE "access_allowlist" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "note" VARCHAR(200),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_allowlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_allowlist_phone_key" ON "access_allowlist"("phone");
