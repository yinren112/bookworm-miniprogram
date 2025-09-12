-- CreateEnum
CREATE TYPE "book_condition" AS ENUM ('NEW', 'GOOD', 'ACCEPTABLE');

-- CreateEnum
CREATE TYPE "inventory_status" AS ENUM ('in_stock', 'reserved', 'sold', 'returned', 'damaged');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'STAFF');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_PICKUP', 'COMPLETED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'REFUND_REQUIRED', 'REFUNDED', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "total_amount" DECIMAL(10,2) NOT NULL,
    "pickup_code" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "pickupExpiresAt" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "openid" VARCHAR(255) NOT NULL,
    "unionid" VARCHAR(255),
    "nickname" VARCHAR(255),
    "avatar_url" VARCHAR(255),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmaster" (
    "id" SERIAL NOT NULL,
    "isbn13" VARCHAR(13) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "author" VARCHAR(255),
    "publisher" VARCHAR(255),
    "original_price" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookmaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booksku" (
    "id" SERIAL NOT NULL,
    "master_id" INTEGER NOT NULL,
    "edition" VARCHAR(50),
    "description" TEXT,
    "cover_image_url" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booksku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventoryitem" (
    "id" SERIAL NOT NULL,
    "sku_id" INTEGER NOT NULL,
    "condition" "book_condition" NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "selling_price" DECIMAL(10,2) NOT NULL,
    "status" "inventory_status" NOT NULL DEFAULT 'in_stock',
    "reserved_by_order_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventoryitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orderitem" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "inventory_item_id" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "orderitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "out_trade_no" VARCHAR(100) NOT NULL,
    "transaction_id" VARCHAR(100),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_total" INTEGER NOT NULL,
    "payer_openid" VARCHAR(255),
    "appid" VARCHAR(100),
    "mchid" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "notified_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_pickup_code_key" ON "Order"("pickup_code");

-- CreateIndex
CREATE INDEX "idx_order_user_id_status" ON "Order"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "User"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "User_unionid_key" ON "User"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "bookmaster_isbn13_key" ON "bookmaster"("isbn13");

-- CreateIndex
CREATE INDEX "idx_book_master_isbn13" ON "bookmaster"("isbn13");

-- CreateIndex
CREATE UNIQUE INDEX "booksku_master_id_edition_key" ON "booksku"("master_id", "edition");

-- CreateIndex
CREATE INDEX "idx_inventory_item_sku_id_status" ON "inventoryitem"("sku_id", "status");

-- CreateIndex
CREATE INDEX "inventoryitem_reserved_by_order_id_idx" ON "inventoryitem"("reserved_by_order_id");

-- CreateIndex
CREATE INDEX "idx_orderitem_inventory_item_id" ON "orderitem"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "Content_slug_key" ON "Content"("slug");

-- CreateIndex
CREATE INDEX "idx_content_slug" ON "Content"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_out_trade_no_key" ON "PaymentRecord"("out_trade_no");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_transaction_id_key" ON "PaymentRecord"("transaction_id");

-- CreateIndex
CREATE INDEX "PaymentRecord_order_id_idx" ON "PaymentRecord"("order_id");

-- CreateIndex
CREATE INDEX "PaymentRecord_status_createdAt_idx" ON "PaymentRecord"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "booksku" ADD CONSTRAINT "fk_master" FOREIGN KEY ("master_id") REFERENCES "bookmaster"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventoryitem" ADD CONSTRAINT "inventoryitem_reserved_by_order_id_fkey" FOREIGN KEY ("reserved_by_order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventoryitem" ADD CONSTRAINT "fk_sku" FOREIGN KEY ("sku_id") REFERENCES "booksku"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orderitem" ADD CONSTRAINT "fk_inventory_item" FOREIGN KEY ("inventory_item_id") REFERENCES "inventoryitem"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orderitem" ADD CONSTRAINT "fk_order" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

