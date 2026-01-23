ALTER TABLE "public"."user_course_enrollment"
  ADD COLUMN IF NOT EXISTS "exam_date" DATE;
