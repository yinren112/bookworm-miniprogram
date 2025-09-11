-- migration.sql

-- Step 1: Temporarily alter the column to TEXT to allow mixed values.
-- This is the safest way to prevent errors during the update.
ALTER TABLE "inventoryitem" ALTER COLUMN "condition" TYPE TEXT;

-- Step 2: Update the old enum values to the new string representations.
UPDATE "inventoryitem" SET "condition" = 'NEW' WHERE "condition" = 'A';
UPDATE "inventoryitem" SET "condition" = 'GOOD' WHERE "condition" = 'B';
UPDATE "inventoryitem" SET "condition" = 'ACCEPTABLE' WHERE "condition" = 'C';

-- Step 3: Re-create the enum type with the correct values.
-- We must drop the old type first if it exists with the wrong values.
-- NOTE: This assumes no other table is using the `book_condition` enum. If so, this is more complex.
-- For this project, only `inventoryitem` uses it, so this is safe.
DROP TYPE IF EXISTS "book_condition";
CREATE TYPE "book_condition" AS ENUM ('NEW', 'GOOD', 'ACCEPTABLE');

-- Step 4: Alter the column back to the correct enum type.
-- The `USING` clause tells PostgreSQL how to cast the TEXT values back to the new enum type.
ALTER TABLE "inventoryitem" ALTER COLUMN "condition" TYPE "book_condition" USING ("condition"::"book_condition");