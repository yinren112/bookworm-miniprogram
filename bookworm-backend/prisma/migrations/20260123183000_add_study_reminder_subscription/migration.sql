-- CreateEnum
CREATE TYPE "public"."StudyReminderStatus" AS ENUM ('ACCEPT', 'REJECT', 'BAN');

-- CreateTable
CREATE TABLE "public"."study_reminder_subscription" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "template_id" VARCHAR(100) NOT NULL,
    "status" "public"."StudyReminderStatus" NOT NULL DEFAULT 'REJECT',
    "consent_at" TIMESTAMPTZ(6),
    "next_send_at" TIMESTAMPTZ(6),
    "last_sent_at" TIMESTAMPTZ(6),
    "last_payload_hash" VARCHAR(64),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "study_reminder_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."study_reminder_send_log" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result_code" VARCHAR(50),
    "result_msg" VARCHAR(255),
    "payload_hash" VARCHAR(64),

    CONSTRAINT "study_reminder_send_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_reminder_subscription_user_id_template_id_key" ON "public"."study_reminder_subscription"("user_id", "template_id");

-- CreateIndex
CREATE INDEX "study_reminder_subscription_status_next_send_at_idx" ON "public"."study_reminder_subscription"("status", "next_send_at");

-- CreateIndex
CREATE INDEX "study_reminder_send_log_subscription_id_sent_at_idx" ON "public"."study_reminder_send_log"("subscription_id", "sent_at");

-- AddForeignKey
ALTER TABLE "public"."study_reminder_subscription" ADD CONSTRAINT "study_reminder_subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_reminder_send_log" ADD CONSTRAINT "study_reminder_send_log_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."study_reminder_subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
