-- Step 1: Backfill phone numbers from UserProfile to User
-- This ensures no data loss before dropping the redundant column
-- Only updates User records where:
--   1. UserProfile has a non-null phone_number
--   2. User.phone_number is currently NULL (avoids overwriting newer data)
UPDATE "User"
SET phone_number = "UserProfile".phone_number
FROM "UserProfile"
WHERE "User".id = "UserProfile".user_id
  AND "UserProfile".phone_number IS NOT NULL
  AND "User".phone_number IS NULL;

-- Step 2: Drop the redundant phone_number column from UserProfile
-- User.phone_number is now the single source of truth
ALTER TABLE "UserProfile" DROP COLUMN IF EXISTS "phone_number";
