-- CreateEnum
CREATE TYPE "public"."QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'FILL_BLANK');

-- CreateEnum
CREATE TYPE "public"."FeedbackRating" AS ENUM ('FORGOT', 'FUZZY', 'KNEW', 'PERFECT');

-- CreateEnum
CREATE TYPE "public"."FeedbackReasonType" AS ENUM ('ANSWER_ERROR', 'STEM_AMBIGUOUS', 'EXPLANATION_UNCLEAR', 'FORMAT_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."StudyFeedbackStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "public"."study_course" (
    "id" SERIAL NOT NULL,
    "courseKey" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "content_version" INTEGER NOT NULL DEFAULT 1,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
    "status" "public"."CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "total_cards" INTEGER NOT NULL DEFAULT 0,
    "total_questions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "study_course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."study_unit" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "unitKey" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."study_card" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "contentId" VARCHAR(100) NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "tags" VARCHAR(255),
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."study_question" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "contentId" VARCHAR(100) NOT NULL,
    "question_type" "public"."QuestionType" NOT NULL,
    "stem" TEXT NOT NULL,
    "options_json" JSONB,
    "answer_json" VARCHAR(500) NOT NULL,
    "explanation_short" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."study_cheat_sheet" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "unit_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "assetType" VARCHAR(20) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_cheat_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."study_campaign_map" (
    "id" SERIAL NOT NULL,
    "sceneCode" VARCHAR(32) NOT NULL,
    "course_id" INTEGER NOT NULL,
    "unitKey" VARCHAR(100),
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_campaign_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_course_enrollment" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_scene" VARCHAR(32),
    "last_studied_at" TIMESTAMPTZ(6),
    "completed_cards" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_course_enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_card_state" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "card_id" INTEGER NOT NULL,
    "box_level" INTEGER NOT NULL DEFAULT 1,
    "next_due_at" TIMESTAMPTZ(6) NOT NULL,
    "last_answered_at" TIMESTAMPTZ(6),
    "today_shown_count" INTEGER NOT NULL DEFAULT 0,
    "total_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_card_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_question_attempt" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "session_id" VARCHAR(36) NOT NULL,
    "chosen_answer_json" VARCHAR(500) NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "duration_ms" INTEGER,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_question_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_wrong_item" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "wrong_count" INTEGER NOT NULL DEFAULT 1,
    "last_wrong_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_wrong_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_study_streak" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "last_study_date" DATE,
    "weekly_points" INTEGER NOT NULL DEFAULT 0,
    "week_start_date" DATE,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_study_streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."study_feedback" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "card_id" INTEGER,
    "question_id" INTEGER,
    "reason" "public"."FeedbackReasonType" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "public"."StudyFeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "study_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_course_status_courseKey_idx" ON "public"."study_course"("status", "courseKey");

-- CreateIndex
CREATE UNIQUE INDEX "study_course_courseKey_content_version_key" ON "public"."study_course"("courseKey", "content_version");

-- CreateIndex
CREATE INDEX "study_unit_course_id_order_index_idx" ON "public"."study_unit"("course_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "study_unit_course_id_unitKey_key" ON "public"."study_unit"("course_id", "unitKey");

-- CreateIndex
CREATE INDEX "study_card_unit_id_sort_order_idx" ON "public"."study_card"("unit_id", "sort_order");

-- CreateIndex
CREATE INDEX "study_card_course_id_idx" ON "public"."study_card"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_card_unit_id_contentId_key" ON "public"."study_card"("unit_id", "contentId");

-- CreateIndex
CREATE INDEX "study_question_unit_id_sort_order_idx" ON "public"."study_question"("unit_id", "sort_order");

-- CreateIndex
CREATE INDEX "study_question_course_id_idx" ON "public"."study_question"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_question_unit_id_contentId_key" ON "public"."study_question"("unit_id", "contentId");

-- CreateIndex
CREATE INDEX "study_cheat_sheet_course_id_sort_order_idx" ON "public"."study_cheat_sheet"("course_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "study_campaign_map_sceneCode_key" ON "public"."study_campaign_map"("sceneCode");

-- CreateIndex
CREATE INDEX "study_campaign_map_sceneCode_idx" ON "public"."study_campaign_map"("sceneCode");

-- CreateIndex
CREATE INDEX "user_course_enrollment_user_id_last_studied_at_idx" ON "public"."user_course_enrollment"("user_id", "last_studied_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_course_enrollment_user_id_course_id_key" ON "public"."user_course_enrollment"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "user_card_state_user_id_next_due_at_idx" ON "public"."user_card_state"("user_id", "next_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_card_state_user_id_card_id_key" ON "public"."user_card_state"("user_id", "card_id");

-- CreateIndex
CREATE INDEX "user_question_attempt_user_id_session_id_idx" ON "public"."user_question_attempt"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "user_question_attempt_question_id_is_correct_idx" ON "public"."user_question_attempt"("question_id", "is_correct");

-- CreateIndex
CREATE INDEX "user_wrong_item_user_id_cleared_at_idx" ON "public"."user_wrong_item"("user_id", "cleared_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_wrong_item_user_id_question_id_key" ON "public"."user_wrong_item"("user_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_study_streak_user_id_key" ON "public"."user_study_streak"("user_id");

-- CreateIndex
CREATE INDEX "user_study_streak_weekly_points_idx" ON "public"."user_study_streak"("weekly_points");

-- CreateIndex
CREATE INDEX "study_feedback_status_created_at_idx" ON "public"."study_feedback"("status", "created_at");

-- CreateIndex
CREATE INDEX "study_feedback_course_id_idx" ON "public"."study_feedback"("course_id");

-- AddForeignKey
ALTER TABLE "public"."study_unit" ADD CONSTRAINT "study_unit_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."study_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_card" ADD CONSTRAINT "study_card_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."study_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_question" ADD CONSTRAINT "study_question_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."study_unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_cheat_sheet" ADD CONSTRAINT "study_cheat_sheet_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."study_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_campaign_map" ADD CONSTRAINT "study_campaign_map_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."study_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_course_enrollment" ADD CONSTRAINT "user_course_enrollment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_course_enrollment" ADD CONSTRAINT "user_course_enrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."study_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_card_state" ADD CONSTRAINT "user_card_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_card_state" ADD CONSTRAINT "user_card_state_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."study_card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_question_attempt" ADD CONSTRAINT "user_question_attempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_question_attempt" ADD CONSTRAINT "user_question_attempt_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."study_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_wrong_item" ADD CONSTRAINT "user_wrong_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_wrong_item" ADD CONSTRAINT "user_wrong_item_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."study_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_study_streak" ADD CONSTRAINT "user_study_streak_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_feedback" ADD CONSTRAINT "study_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_feedback" ADD CONSTRAINT "study_feedback_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."study_course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_feedback" ADD CONSTRAINT "study_feedback_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."study_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."study_feedback" ADD CONSTRAINT "study_feedback_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."study_question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
