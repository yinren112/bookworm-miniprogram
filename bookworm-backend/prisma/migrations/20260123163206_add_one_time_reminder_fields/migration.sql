/*
  Warnings:

  - The values [ACCEPT] on the enum `StudyReminderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."StudyReminderStatus_new" AS ENUM ('ACTIVE', 'REJECT', 'BAN', 'SENT', 'FAILED');
ALTER TABLE "public"."study_reminder_subscription" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."study_reminder_subscription" ALTER COLUMN "status" TYPE "public"."StudyReminderStatus_new" USING ("status"::text::"public"."StudyReminderStatus_new");
ALTER TYPE "public"."StudyReminderStatus" RENAME TO "StudyReminderStatus_old";
ALTER TYPE "public"."StudyReminderStatus_new" RENAME TO "StudyReminderStatus";
DROP TYPE "public"."StudyReminderStatus_old";
ALTER TABLE "public"."study_reminder_subscription" ALTER COLUMN "status" SET DEFAULT 'REJECT';
COMMIT;

-- AlterTable
ALTER TABLE "public"."study_reminder_subscription" ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "sent_at" TIMESTAMPTZ(6);
