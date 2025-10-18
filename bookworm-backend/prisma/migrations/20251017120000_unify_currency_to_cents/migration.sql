-- Migration: Unify all currency fields to Integer cents
-- This migration converts Decimal (yuan) fields to Integer (cents) for consistency
-- and to eliminate floating-point precision issues in financial calculations.

-- 1. InventoryItem: Convert cost and selling_price from Decimal(yuan) to Int(cents)
ALTER TABLE "inventoryitem"
  ALTER COLUMN "cost" TYPE integer USING ROUND("cost" * 100),
  ALTER COLUMN "selling_price" TYPE integer USING ROUND("selling_price" * 100);

-- 2. OrderItem: Convert price from Decimal(yuan) to Int(cents)
ALTER TABLE "orderitem"
  ALTER COLUMN "price" TYPE integer USING ROUND("price" * 100);

-- 3. BookMaster: Convert original_price from Decimal(yuan) to Int(cents)
-- This ensures all currency fields use the same unit throughout the system
ALTER TABLE "bookmaster"
  ALTER COLUMN "original_price" TYPE integer USING ROUND("original_price" * 100);
