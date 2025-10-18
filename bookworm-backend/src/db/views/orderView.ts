import { Prisma } from "@prisma/client";
import { inventorySelectPublic } from "./inventoryView";

const orderBaseSelect = {
  id: true,
  user_id: true,
  status: true,
  total_amount: true,
  pickup_code: true,
  paymentExpiresAt: true,
  paid_at: true,
  cancelled_at: true,
  createdAt: true,
} as const satisfies Prisma.OrderSelect;

const orderItemSelectWithInventory = Prisma.validator<Prisma.OrderItemSelect>()({
  id: true,
  order_id: true,
  inventory_item_id: true,
  inventoryItem: {
    select: inventorySelectPublic,
  },
});

export const orderSelectBasic = Prisma.validator<Prisma.OrderSelect>()({
  ...orderBaseSelect,
});

export const orderIncludeWithItems = Prisma.validator<Prisma.OrderInclude>()({
  orderItem: {
    select: orderItemSelectWithInventory,
  },
});

export const orderSelectPublic = Prisma.validator<Prisma.OrderSelect>()({
  ...orderBaseSelect,
  orderItem: {
    select: orderItemSelectWithInventory,
  },
});

export type OrderPublic = Prisma.OrderGetPayload<{
  select: typeof orderSelectPublic;
}>;
