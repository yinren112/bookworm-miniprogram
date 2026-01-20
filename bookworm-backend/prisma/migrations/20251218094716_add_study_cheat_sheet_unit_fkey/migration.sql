-- AddForeignKey
ALTER TABLE "public"."study_cheat_sheet" ADD CONSTRAINT "study_cheat_sheet_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."study_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
