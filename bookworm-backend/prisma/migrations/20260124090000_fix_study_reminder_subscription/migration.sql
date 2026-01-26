DO $$
DECLARE
  has_accept boolean;
  has_new_type boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public' AND t.typname = 'StudyReminderStatus' AND e.enumlabel = 'ACCEPT'
  ) INTO has_accept;

  IF has_accept THEN
    SELECT EXISTS(
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'StudyReminderStatus_new'
    ) INTO has_new_type;

    IF NOT has_new_type THEN
      EXECUTE 'CREATE TYPE "public"."StudyReminderStatus_new" AS ENUM (''ACTIVE'', ''REJECT'', ''BAN'', ''SENT'', ''FAILED'')';
    END IF;
    EXECUTE 'ALTER TABLE "public"."study_reminder_subscription" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE 'ALTER TABLE "public"."study_reminder_subscription" ALTER COLUMN "status" TYPE "public"."StudyReminderStatus_new" USING ((CASE WHEN "status"::text = ''ACCEPT'' THEN ''ACTIVE'' ELSE "status"::text END)::"public"."StudyReminderStatus_new")';
    EXECUTE 'ALTER TYPE "public"."StudyReminderStatus" RENAME TO "StudyReminderStatus_old"';
    EXECUTE 'ALTER TYPE "public"."StudyReminderStatus_new" RENAME TO "StudyReminderStatus"';
    EXECUTE 'DROP TYPE "public"."StudyReminderStatus_old"';
    EXECUTE 'ALTER TABLE "public"."study_reminder_subscription" ALTER COLUMN "status" SET DEFAULT ''REJECT''';
  END IF;

  EXECUTE 'ALTER TABLE "public"."study_reminder_subscription" ADD COLUMN IF NOT EXISTS "last_error" TEXT';
  EXECUTE 'ALTER TABLE "public"."study_reminder_subscription" ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMPTZ(6)';
END $$;
