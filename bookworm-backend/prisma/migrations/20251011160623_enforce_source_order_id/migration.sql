-- Enforce source order references for bulk acquisition inventory entries
ALTER TABLE "public"."inventoryitem"
DROP CONSTRAINT IF EXISTS "chk_source_order_id_for_bulk_acquisition";

ALTER TABLE "public"."inventoryitem"
ADD CONSTRAINT "chk_source_order_id_for_bulk_acquisition"
CHECK (
  status <> 'BULK_ACQUISITION'
  OR source_order_id IS NOT NULL
);
