import { Prisma, PrismaClient, Order, InventoryItem } from "@prisma/client";

import { ApiError } from "../errors";
import {
  ORDER_STATUS,
  ORDER_TYPE,
  INVENTORY_STATUS,
  BUSINESS_LIMITS,
} from "../constants";
import { generateUniquePickupCode } from "./purchaseOrderService";
import { withTxRetry } from "../db/transaction";

export interface CreateAndCompleteSellOrderInput {
  customerPhoneNumber: string;
  totalWeightKg: number;
  unitPrice: number; // Price in cents per kg
  settlementType: "CASH" | "VOUCHER";
  notes?: string;
}

export interface CreateAndCompleteSellOrderResult {
  order: Order;
  inventoryItem: InventoryItem;
}

const BULK_ACQUISITION_ISBN = "0000000000000";

async function createAndCompleteSellOrderImpl(
  tx: Prisma.TransactionClient,
  input: CreateAndCompleteSellOrderInput,
): Promise<CreateAndCompleteSellOrderResult> {
  if (input.totalWeightKg <= 0 || input.unitPrice <= 0) {
    throw new ApiError(400, "重量和单价必须是正数", "INVALID_SELL_ORDER_INPUT");
  }

  const user = await tx.user.upsert({
    where: { phone_number: input.customerPhoneNumber },
    create: {
      phone_number: input.customerPhoneNumber,
      openid: `placeholder_${input.customerPhoneNumber}_${Date.now()}`,
      role: "USER",
      status: "PRE_REGISTERED",
    },
    update: {},
  });

  const userId = user.id;

  const baseAmount = Math.round(input.totalWeightKg * input.unitPrice);
  const voucherFaceValue =
    input.settlementType === "VOUCHER" ? baseAmount * 2 : null;

  const bulkMaster = await tx.bookMaster.upsert({
    where: { isbn13: BULK_ACQUISITION_ISBN },
    update: {},
    create: {
      isbn13: BULK_ACQUISITION_ISBN,
      title: "批量收购书籍",
      author: "N/A",
      publisher: "N/A",
    },
  });

  const bulkSku = await tx.bookSku.upsert({
    where: {
      master_id_edition: {
        master_id: bulkMaster.id,
        edition: "批量",
      },
    },
    update: {},
    create: {
      master_id: bulkMaster.id,
      edition: "批量",
    },
  });

  const now = new Date();

  const order = await tx.order.create({
    data: {
      user_id: userId,
      status: ORDER_STATUS.COMPLETED,
      type: ORDER_TYPE.SELL,
      total_amount: baseAmount,
      voucherFaceValue,
      pickup_code: await generateUniquePickupCode(),
      paymentExpiresAt: now,
      paid_at: now,
      completed_at: now,
      totalWeightKg: input.totalWeightKg,
      unitPrice: input.unitPrice,
      settlementType: input.settlementType,
      notes: input.notes,
    },
  });

  const inventoryItem = await tx.inventoryItem.create({
    data: {
      sku_id: bulkSku.id,
      condition: "ACCEPTABLE",
      cost: voucherFaceValue ?? baseAmount, // 直接使用分作为单位
      selling_price: 0, // 批量收购书籍不出售
      status: INVENTORY_STATUS.BULK_ACQUISITION,
      sourceOrderId: order.id,
    },
  });

  if (input.settlementType === "VOUCHER" && voucherFaceValue) {
    // 预留钩子：后续在此调用发券服务并写入审计日志
  }

  return { order, inventoryItem };
}

export function createAndCompleteSellOrder(
  dbCtx: PrismaClient,
  input: CreateAndCompleteSellOrderInput,
): Promise<CreateAndCompleteSellOrderResult> {
  return withTxRetry(
    dbCtx,
    (tx) => createAndCompleteSellOrderImpl(tx, input),
    {
      transactionOptions: {
        timeout: BUSINESS_LIMITS.TRANSACTION_TIMEOUT_MS,
      },
    },
  );
}
