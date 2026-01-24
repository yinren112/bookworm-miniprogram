ALTER TABLE "study_cheat_sheet" ALTER COLUMN "url" DROP NOT NULL;

ALTER TABLE "study_cheat_sheet" ADD COLUMN "content" TEXT;
ALTER TABLE "study_cheat_sheet" ADD COLUMN "content_format" VARCHAR(20);
