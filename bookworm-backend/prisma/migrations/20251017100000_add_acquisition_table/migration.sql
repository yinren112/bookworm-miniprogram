-- CreateTable
CREATE TABLE "Acquisition" (
    "id" SERIAL NOT NULL,
    "staff_user_id" INTEGER NOT NULL,
    "customer_user_id" INTEGER,
    "total_value" INTEGER NOT NULL,
    "item_count" INTEGER NOT NULL,
    "settlement_type" "SettlementType" NOT NULL,
    "voucher_code" VARCHAR(255),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acquisition_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Acquisition" ADD CONSTRAINT "Acquisition_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acquisition" ADD CONSTRAINT "Acquisition_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add acquisition_id to InventoryItem
ALTER TABLE "inventoryitem" ADD COLUMN "acquisition_id" INTEGER;

-- AddForeignKey
ALTER TABLE "inventoryitem" ADD CONSTRAINT "inventoryitem_acquisition_id_fkey" FOREIGN KEY ("acquisition_id") REFERENCES "Acquisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Acquisition_staff_user_id_idx" ON "Acquisition"("staff_user_id");

-- CreateIndex
CREATE INDEX "Acquisition_created_at_idx" ON "Acquisition"("created_at");

-- CreateIndex
CREATE INDEX "inventoryitem_acquisition_id_idx" ON "inventoryitem"("acquisition_id");

-- AddCheckConstraint: Ensure an InventoryItem has at most one source
ALTER TABLE "inventoryitem" ADD CONSTRAINT "chk_unique_source"
CHECK (
  ("source_order_id" IS NULL) OR ("acquisition_id" IS NULL)
);
