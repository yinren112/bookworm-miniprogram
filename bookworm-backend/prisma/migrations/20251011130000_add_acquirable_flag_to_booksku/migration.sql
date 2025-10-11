ALTER TABLE "booksku" ADD COLUMN "is_acquirable" BOOLEAN NOT NULL DEFAULT false;

-- Add a partial index to accelerate lookups for acquirable books
CREATE INDEX "idx_booksku_acquirable_true" ON "booksku"("is_acquirable") WHERE "is_acquirable" = true;

CREATE INDEX "booksku_is_acquirable_idx" ON "booksku"("is_acquirable");
