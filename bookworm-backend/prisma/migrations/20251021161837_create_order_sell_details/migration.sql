-- CreateTable: OrderSellDetails
-- Purpose: Separate SELL-specific fields from Order table
-- Phase 1 of 3: Create table + backfill historical data

-- Step 1: Create the new table
CREATE TABLE "order_sell_details" (
    "order_id" INTEGER NOT NULL PRIMARY KEY,
    "total_weight_kg" DOUBLE PRECISION NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "settlement_type" "SettlementType" NOT NULL,
    "voucher_face_value" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_order_sell_details_order" FOREIGN KEY ("order_id")
        REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 2: Create index for foreign key
CREATE INDEX "order_sell_details_order_id_idx" ON "order_sell_details"("order_id");

-- Step 3: Backfill historical SELL orders
INSERT INTO "order_sell_details" (
    order_id,
    total_weight_kg,
    unit_price,
    settlement_type,
    voucher_face_value,
    created_at
)
SELECT
    id,
    total_weight_kg,
    unit_price,
    settlement_type,
    voucher_face_value,
    "createdAt"
FROM "Order"
WHERE type = 'SELL'
  AND total_weight_kg IS NOT NULL
  AND unit_price IS NOT NULL
  AND settlement_type IS NOT NULL;

-- Step 4: Verification check
DO $$
DECLARE
    sell_orders_count INTEGER;
    details_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO sell_orders_count
    FROM "Order"
    WHERE type = 'SELL';

    SELECT COUNT(*) INTO details_count
    FROM "order_sell_details";

    IF sell_orders_count != details_count THEN
        RAISE EXCEPTION 'Backfill verification failed: % SELL orders but % detail records',
            sell_orders_count, details_count;
    END IF;

    RAISE NOTICE 'Backfill successful: % SELL orders migrated', details_count;
END $$;
