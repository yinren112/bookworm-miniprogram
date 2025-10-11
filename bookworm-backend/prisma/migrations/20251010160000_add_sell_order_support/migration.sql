-- Alter enum to add new inventory status for bulk acquisitions
ALTER TYPE "public"."inventory_status" ADD VALUE IF NOT EXISTS 'BULK_ACQUISITION';

-- Create enums to distinguish order categories and settlement methods
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderType') THEN
    CREATE TYPE "public"."OrderType" AS ENUM ('PURCHASE', 'SELL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SettlementType') THEN
    CREATE TYPE "public"."SettlementType" AS ENUM ('CASH', 'VOUCHER');
  END IF;
END $$;

-- Add sell-order specific columns to Order table
ALTER TABLE "public"."Order"
  ADD COLUMN IF NOT EXISTS "type" "public"."OrderType" NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN IF NOT EXISTS "total_weight_kg" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "unit_price" INTEGER,
  ADD COLUMN IF NOT EXISTS "settlement_type" "public"."SettlementType",
  ADD COLUMN IF NOT EXISTS "voucher_face_value" INTEGER,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Track which inventory rows originate from sell orders
ALTER TABLE "public"."inventoryitem"
  ADD COLUMN IF NOT EXISTS "source_order_id" INTEGER;

CREATE INDEX IF NOT EXISTS "inventoryitem_source_order_id_idx"
  ON "public"."inventoryitem"("source_order_id");

ALTER TABLE "public"."inventoryitem"
  ADD CONSTRAINT "inventoryitem_source_order_id_fkey"
  FOREIGN KEY ("source_order_id") REFERENCES "public"."Order"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
