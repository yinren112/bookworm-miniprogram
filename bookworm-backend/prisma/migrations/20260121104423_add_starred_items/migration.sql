-- CreateEnum
CREATE TYPE "public"."StarredItemType" AS ENUM ('card', 'question');

-- CreateTable
CREATE TABLE "public"."user_starred_item" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "public"."StarredItemType" NOT NULL,
    "content_id" VARCHAR(100),
    "question_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_starred_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_starred_item_user_id_idx" ON "public"."user_starred_item"("user_id");

-- CreateIndex
CREATE INDEX "user_starred_item_type_idx" ON "public"."user_starred_item"("type");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_user_starred_content" ON "public"."user_starred_item"("user_id", "type", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_user_starred_question" ON "public"."user_starred_item"("user_id", "type", "question_id");

-- AddForeignKey
ALTER TABLE "public"."user_starred_item" ADD CONSTRAINT "user_starred_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_starred_item" ADD CONSTRAINT "user_starred_item_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."study_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
