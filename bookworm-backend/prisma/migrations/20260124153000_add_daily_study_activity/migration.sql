CREATE TABLE "public"."daily_study_activity" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "card_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "quiz_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "cheatsheet_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_study_activity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_study_activity_non_negative_durations" CHECK ("card_duration_seconds" >= 0 AND "quiz_duration_seconds" >= 0 AND "cheatsheet_duration_seconds" >= 0)
);

CREATE UNIQUE INDEX "daily_study_activity_user_id_date_key" ON "public"."daily_study_activity"("user_id", "date");

ALTER TABLE "public"."daily_study_activity"
ADD CONSTRAINT "daily_study_activity_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
