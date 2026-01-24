-- Ensure inventoryitem.source_order_id references SELL orders only via trigger
DROP TRIGGER IF EXISTS trg_validate_source_order_type ON "public"."inventoryitem";
DROP FUNCTION IF EXISTS "public".validate_source_order_type();

CREATE OR REPLACE FUNCTION "public".validate_source_order_type()
RETURNS TRIGGER AS $$
DECLARE
    order_type "public"."OrderType";
BEGIN
    IF NEW.source_order_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT type INTO order_type FROM "public"."Order" WHERE id = NEW.source_order_id;

    IF order_type IS NULL OR order_type <> 'SELL' THEN
        RAISE EXCEPTION 'source_order_id must reference an Order with type = ''SELL''. Found type: %', order_type
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_source_order_type
BEFORE INSERT OR UPDATE OF source_order_id ON "public"."inventoryitem"
FOR EACH ROW
EXECUTE FUNCTION "public".validate_source_order_type();
