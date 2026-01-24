-- Unify timestamp columns on PaymentRecord to TIMESTAMPTZ(6)
ALTER TABLE "public"."PaymentRecord"
ALTER COLUMN "notified_at" TYPE TIMESTAMPTZ(6),
ALTER COLUMN "refunded_at" TYPE TIMESTAMPTZ(6);
