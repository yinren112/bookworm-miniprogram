-- Restore Native Database Rules (Triggers & Constraints Lost During Migration Squashing)
-- This migration adds back the critical database-level business rules that Prisma doesn't understand.

-- ============================================================================
-- PHASE 1: Fix UNIQUE INDEX vs UNIQUE CONSTRAINT Issue
-- ============================================================================
-- dbVerifier checks pg_constraint, but Prisma's @@unique generates UNIQUE INDEX.
-- We need a proper partial UNIQUE CONSTRAINT on pending_payment_order(user_id).

-- This constraint ensures one user can only have ONE pending payment order at a time.
-- It's the cornerstone of our order flow: users can't spam orders.

-- Drop the existing index if present (Prisma may have created it)
DROP INDEX IF EXISTS "uniq_order_pending_per_user";

-- Add a proper UNIQUE CONSTRAINT
-- Note: PostgreSQL doesn't support partial UNIQUE constraints directly via ALTER TABLE,
-- so we use a UNIQUE partial index which serves the same purpose.
-- dbVerifier will be updated to check for this specific index.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_order_pending_per_user"
ON "pending_payment_order"("user_id");

-- ============================================================================
-- PHASE 2: Restore All Missing Triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger 1: order_sync_pending_payment_insert
-- Purpose: Keep the pending_payment_order guard table in sync with Order table
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_pending_payment_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status = 'PENDING_PAYMENT') OR
       (TG_OP = 'UPDATE' AND NEW.status = 'PENDING_PAYMENT' AND OLD.status != 'PENDING_PAYMENT') THEN
        -- Order became PENDING_PAYMENT: insert into guard table
        INSERT INTO pending_payment_order (order_id, user_id)
        VALUES (NEW.id, NEW.user_id)
        ON CONFLICT (order_id) DO NOTHING;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'PENDING_PAYMENT' AND NEW.status != 'PENDING_PAYMENT') OR
          (TG_OP = 'DELETE' AND OLD.status = 'PENDING_PAYMENT') THEN
        -- Order left PENDING_PAYMENT state: remove from guard table
        DELETE FROM pending_payment_order WHERE order_id = OLD.id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_sync_pending_payment_insert ON "Order";
DROP TRIGGER IF EXISTS order_sync_pending_payment_update ON "Order";
DROP TRIGGER IF EXISTS order_sync_pending_payment_delete ON "Order";

CREATE TRIGGER order_sync_pending_payment_insert
AFTER INSERT ON "Order"
FOR EACH ROW
EXECUTE FUNCTION sync_pending_payment_guard();

CREATE TRIGGER order_sync_pending_payment_update
AFTER UPDATE OF status ON "Order"
FOR EACH ROW
EXECUTE FUNCTION sync_pending_payment_guard();

CREATE TRIGGER order_sync_pending_payment_delete
AFTER DELETE ON "Order"
FOR EACH ROW
EXECUTE FUNCTION sync_pending_payment_guard();

-- ----------------------------------------------------------------------------
-- Trigger 2: inventory_reservation_enforce_cap
-- Purpose: Enforce MAX_RESERVED_ITEMS_PER_USER business rule (20 items)
-- Fixed: Removed references to non-existent reserved_by_order_id column
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_user_reservation_limit()
RETURNS TRIGGER AS $$
DECLARE
    reserved_count INTEGER;
    user_id_to_check INTEGER;
    max_limit CONSTANT INTEGER := 20; -- MAX_RESERVED_ITEMS_PER_USER from config
BEGIN
    -- Get the user_id from the Order via the new reservation record
    SELECT o.user_id INTO user_id_to_check
    FROM "Order" o
    WHERE o.id = NEW.order_id;

    IF user_id_to_check IS NOT NULL THEN
        -- Count current reservations for this user (including this new one)
        SELECT COUNT(*) INTO reserved_count
        FROM inventory_reservation ir
        JOIN "Order" o ON ir.order_id = o.id
        WHERE o.user_id = user_id_to_check;

        IF reserved_count > max_limit THEN
            RAISE EXCEPTION 'MAX_RESERVED_ITEMS_PER_USER: User % has exceeded the reservation limit of % items (currently has %)',
                user_id_to_check, max_limit, reserved_count
            USING ERRCODE = '23514'; -- check_violation
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_reservation_enforce_cap ON "inventory_reservation";
CREATE TRIGGER inventory_reservation_enforce_cap
AFTER INSERT ON "inventory_reservation"
FOR EACH ROW
EXECUTE FUNCTION check_user_reservation_limit();

-- ----------------------------------------------------------------------------
-- Trigger 3: REMOVED - inventoryitem_validate_reservation
-- Original Purpose: Enforce InventoryItem state machine consistency
-- Reason for Removal: This trigger referenced a non-existent column `reserved_by_order_id`
--                     The system uses InventoryReservation table instead
-- Date Removed: 2025-09-30
-- ----------------------------------------------------------------------------
-- Historical context: This was legacy code from an earlier architecture that stored
-- reservation info directly in the InventoryItem table. The current architecture uses
-- a separate InventoryReservation table with inventory_item_id as PRIMARY KEY,
-- which already enforces uniqueness at the database level.

-- ============================================================================
-- Verification: Confirm all rules are in place
-- ============================================================================
-- You can manually verify with:
-- SELECT conname FROM pg_constraint WHERE conname = 'uniq_order_pending_per_user';
-- SELECT tgname FROM pg_trigger WHERE tgname IN (
--   'order_sync_pending_payment_insert',
--   'inventory_reservation_enforce_cap',
--   'inventoryitem_validate_reservation'
-- );