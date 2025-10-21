-- Deprecate Order table SELL legacy fields
-- Purpose: Enforce that SELL orders use order_sell_details table exclusively
-- Phase 3 of 3: Replace old CHECK constraint with new one

-- Step 1: Drop old chk_order_type_consistency constraint
-- This constraint required SELL orders to have NOT NULL legacy fields
-- We're replacing it to allow NULL legacy fields (data moved to order_sell_details)
ALTER TABLE "Order"
DROP CONSTRAINT IF EXISTS "chk_order_type_consistency";

-- Step 2: Add new CHECK constraint for type consistency
-- PURCHASE orders: legacy SELL fields must be NULL
-- SELL orders: legacy fields must also be NULL (now using order_sell_details table)
ALTER TABLE "Order"
ADD CONSTRAINT "chk_order_type_consistency"
CHECK (
  (type = 'PURCHASE' AND total_weight_kg IS NULL AND unit_price IS NULL AND settlement_type IS NULL AND voucher_face_value IS NULL)
  OR
  (type = 'SELL' AND total_weight_kg IS NULL AND unit_price IS NULL AND settlement_type IS NULL AND voucher_face_value IS NULL)
);

-- Step 3: Verification query (commented out, for manual verification)
-- Verify all SELL orders have NULL legacy fields:
-- SELECT id, type, total_weight_kg, unit_price, settlement_type, voucher_face_value
-- FROM "Order"
-- WHERE type = 'SELL'
--   AND (total_weight_kg IS NOT NULL
--        OR unit_price IS NOT NULL
--        OR settlement_type IS NOT NULL
--        OR voucher_face_value IS NOT NULL);
-- Expected: 0 rows

-- Verify all SELL orders have corresponding sellDetails:
-- SELECT o.id
-- FROM "Order" o
-- LEFT JOIN order_sell_details d ON d.order_id = o.id
-- WHERE o.type = 'SELL' AND d.order_id IS NULL;
-- Expected: 0 rows

-- Note: This migration requires that Phase 1 (create order_sell_details)
-- and Phase 2 (migrate read paths) have been completed successfully
