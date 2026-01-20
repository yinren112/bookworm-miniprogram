-- CreateEnum
CREATE TYPE "public"."StaffRole" AS ENUM ('STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."StaffStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "public"."Acquisition" ADD COLUMN     "web_staff_id" INTEGER,
ALTER COLUMN "staff_user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "web_staff_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."staff" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "role" "public"."StaffRole" NOT NULL DEFAULT 'STAFF',
    "status" "public"."StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_username_key" ON "public"."staff"("username");

-- CreateIndex
CREATE INDEX "staff_username_idx" ON "public"."staff"("username");

-- CreateIndex
CREATE INDEX "staff_status_idx" ON "public"."staff"("status");

-- CreateIndex
CREATE INDEX "Acquisition_web_staff_id_idx" ON "public"."Acquisition"("web_staff_id");

-- CreateIndex
CREATE INDEX "idx_order_web_staff_id" ON "public"."Order"("web_staff_id");

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_web_staff_id_fkey" FOREIGN KEY ("web_staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Acquisition" ADD CONSTRAINT "Acquisition_web_staff_id_fkey" FOREIGN KEY ("web_staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
