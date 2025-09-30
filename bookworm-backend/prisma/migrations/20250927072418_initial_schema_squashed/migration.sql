-- CreateEnum
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA public;

-- CreateEnum
CREATE TYPE "public"."book_condition" AS ENUM ('NEW', 'GOOD', 'ACCEPTABLE');

-- CreateEnum
CREATE TYPE "public"."inventory_status" AS ENUM ('in_stock', 'reserved', 'sold', 'returned', 'damaged');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('USER', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_PICKUP', 'COMPLETED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'REFUND_REQUIRED', 'REFUNDED', 'FAILED', 'REFUND_PROCESSING');

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
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
CREATE TABLE "public"."pending_payment_order" (
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_payment_order_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "openid" VARCHAR(255) NOT NULL,
    "unionid" VARCHAR(255),
    "nickname" VARCHAR(255),
    "avatar_url" VARCHAR(255),
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bookmaster" (
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
CREATE TABLE "public"."booksku" (
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
CREATE TABLE "public"."inventoryitem" (
    "id" SERIAL NOT NULL,
    "sku_id" INTEGER NOT NULL,
    "condition" "public"."book_condition" NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "selling_price" DECIMAL(10,2) NOT NULL,
    "status" "public"."inventory_status" NOT NULL DEFAULT 'in_stock',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventoryitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inventory_reservation" (
    "inventory_item_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_reservation_pkey" PRIMARY KEY ("inventory_item_id")
);

-- CreateTable
CREATE TABLE "public"."orderitem" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "inventory_item_id" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "orderitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Content" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentRecord" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "out_trade_no" VARCHAR(100) NOT NULL,
    "transaction_id" VARCHAR(100),
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_total" INTEGER NOT NULL,
    "payer_openid" VARCHAR(255),
    "appid" VARCHAR(100),
    "mchid" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "notified_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_id" VARCHAR(100),
    "refund_attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_pickup_code_key" ON "public"."Order"("pickup_code");

-- CreateIndex
CREATE INDEX "idx_order_user_id_status" ON "public"."Order"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_order_created_at" ON "public"."Order"("createdAt");

-- CreateIndex
CREATE INDEX "idx_order_user_created_at_id" ON "public"."Order"("user_id", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_order_pending_per_user" ON "public"."pending_payment_order"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "public"."User"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "User_unionid_key" ON "public"."User"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "bookmaster_isbn13_key" ON "public"."bookmaster"("isbn13");

-- CreateIndex
CREATE INDEX "idx_book_master_isbn13" ON "public"."bookmaster"("isbn13");

-- CreateIndex
CREATE INDEX "idx_bookmaster_author_gin_trgm" ON "public"."bookmaster" USING GIN ("author" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_bookmaster_title_gin_trgm" ON "public"."bookmaster" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "booksku_master_id_edition_key" ON "public"."booksku"("master_id", "edition");

-- CreateIndex
CREATE INDEX "idx_inventory_item_sku_id_status" ON "public"."inventoryitem"("sku_id", "status");

-- CreateIndex
CREATE INDEX "idx_inventory_reservation_order_id" ON "public"."inventory_reservation"("order_id");

-- CreateIndex
CREATE INDEX "idx_orderitem_inventory_item_id" ON "public"."orderitem"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_orderitem_order_inventory" ON "public"."orderitem"("order_id", "inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "Content_slug_key" ON "public"."Content"("slug");

-- CreateIndex
CREATE INDEX "idx_content_slug" ON "public"."Content"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_out_trade_no_key" ON "public"."PaymentRecord"("out_trade_no");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_transaction_id_key" ON "public"."PaymentRecord"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_refund_id_key" ON "public"."PaymentRecord"("refund_id");

-- CreateIndex
CREATE INDEX "PaymentRecord_order_id_idx" ON "public"."PaymentRecord"("order_id");

-- CreateIndex
CREATE INDEX "PaymentRecord_status_createdAt_idx" ON "public"."PaymentRecord"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."pending_payment_order" ADD CONSTRAINT "fk_pending_order" FOREIGN KEY ("order_id") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."pending_payment_order" ADD CONSTRAINT "fk_pending_user" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."booksku" ADD CONSTRAINT "fk_master" FOREIGN KEY ("master_id") REFERENCES "public"."bookmaster"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."inventoryitem" ADD CONSTRAINT "fk_sku" FOREIGN KEY ("sku_id") REFERENCES "public"."booksku"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."inventory_reservation" ADD CONSTRAINT "fk_reservation_item" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventoryitem"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."inventory_reservation" ADD CONSTRAINT "fk_reservation_order" FOREIGN KEY ("order_id") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."orderitem" ADD CONSTRAINT "fk_inventory_item" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventoryitem"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."orderitem" ADD CONSTRAINT "fk_order" FOREIGN KEY ("order_id") REFERENCES "public"."Order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."PaymentRecord" ADD CONSTRAINT "PaymentRecord_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
