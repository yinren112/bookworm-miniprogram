-- Recreate the trigger function to read the limit from a custom PostgreSQL setting.
CREATE OR REPLACE FUNCTION check_user_reservation_limit()
RETURNS TRIGGER AS $$
DECLARE
    reserved_count INTEGER;
    user_id_to_check INTEGER;
    -- Read the max_limit from the custom setting 'bookworm.max_reserved_items_per_user'.
    -- The second argument to current_setting is 'missing_ok', preventing an error if not set.
    -- We use COALESCE to provide a safe default of 20, though it should always be set via config.
    max_limit INTEGER := COALESCE(current_setting('bookworm.max_reserved_items_per_user', true)::integer, 20);
BEGIN
    -- Get the user_id from the Order via the new reservation record
    SELECT o.user_id INTO user_id_to_check
    FROM "Order" o
    WHERE o.id = NEW.order_id;

    IF user_id_to_check IS NOT NULL THEN
        -- Count current reservations for this user
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
