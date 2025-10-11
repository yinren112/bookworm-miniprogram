-- Convert monetary columns from DECIMAL to INTEGER cents representation
ALTER TABLE "Order"
ALTER COLUMN "total_amount" TYPE INTEGER USING ROUND("total_amount" * 100);
