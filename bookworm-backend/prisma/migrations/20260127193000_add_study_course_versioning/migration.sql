-- Add active flag to enrollments
ALTER TABLE "user_course_enrollment" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Add stable key for cheatsheet deduplication
ALTER TABLE "study_cheat_sheet" ADD COLUMN "stable_key" VARCHAR(64);

UPDATE "study_cheat_sheet"
SET "stable_key" = md5(
  "course_id"::text || ':' ||
  COALESCE("unit_id", 0)::text || ':' ||
  "assetType" || ':' ||
  "title" || ':' ||
  "version"::text
)
WHERE "stable_key" IS NULL;

WITH ranked AS (
  SELECT "id", "stable_key",
         ROW_NUMBER() OVER (PARTITION BY "stable_key" ORDER BY "id") AS rn
  FROM "study_cheat_sheet"
)
DELETE FROM "study_cheat_sheet"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

ALTER TABLE "study_cheat_sheet" ALTER COLUMN "stable_key" SET NOT NULL;

CREATE UNIQUE INDEX "uniq_study_cheatsheet_stable_key" ON "study_cheat_sheet"("stable_key");
