-- Enforce data consistency between order type and related columns.
ALTER TABLE "public"."Order"
DROP CONSTRAINT IF EXISTS "chk_order_type_consistency";

ALTER TABLE "public"."Order"
ADD CONSTRAINT "chk_order_type_consistency"
CHECK (
  (
    type = 'PURCHASE'
    AND total_weight_kg IS NULL
    AND unit_price IS NULL
    AND settlement_type IS NULL
    AND voucher_face_value IS NULL
  ) OR (
    type = 'SELL'
    AND total_weight_kg IS NOT NULL
    AND unit_price IS NOT NULL
    AND settlement_type IS NOT NULL
    AND (
      (settlement_type = 'CASH' AND voucher_face_value IS NULL)
      OR (settlement_type = 'VOUCHER' AND voucher_face_value IS NOT NULL)
    )
  )
);
