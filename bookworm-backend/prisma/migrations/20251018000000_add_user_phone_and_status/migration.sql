-- Add UserStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
    CREATE TYPE "public"."UserStatus" AS ENUM ('REGISTERED', 'PRE_REGISTERED');
  END IF;
END $$;

-- Add phone_number and status columns to User table
ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "phone_number" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "status" "public"."UserStatus" NOT NULL DEFAULT 'REGISTERED';

-- Create unique index on phone_number
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_number_key" ON "public"."User"("phone_number");

-- Create regular index on phone_number for lookups
CREATE INDEX IF NOT EXISTS "User_phone_number_idx" ON "public"."User"("phone_number");
