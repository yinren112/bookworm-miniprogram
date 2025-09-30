// src/tests/test-helpers/orderService.helper.ts
import { mockDeep } from "vitest-mock-extended";
import { PrismaClient, Prisma } from "@prisma/client";
import { vi } from "vitest";

/**
 * Sets up default mocks for successful createOrder operations
 * This eliminates repetitive mock setup across test cases
 */
export function setupDefaultCreateOrderMocks(
  prismaMock: ReturnType<typeof mockDeep<PrismaClient>>,
) {
  // Mock前置检查通过
  prismaMock.order.count.mockResolvedValue(0);

  // Add $connect method to make it recognizable as PrismaClient
  (prismaMock as any).$connect = vi.fn().mockResolvedValue(undefined);

  // Mock事务成功路径的默认行为
  prismaMock.$transaction.mockImplementation(async (callback) => {
    // Mock现有预留商品检查的两次查询
    // 第一次：检查重复项目（返回空，无冲突）
    prismaMock.order.findMany.mockResolvedValueOnce([]);
    // 第二次：检查总数限制（返回空，无已预留商品）
    prismaMock.order.findMany.mockResolvedValueOnce([]);

    // Mock库存更新成功
    prismaMock.inventoryItem.updateMany.mockResolvedValue({ count: 1 });

    // Mock订单项创建成功
    prismaMock.orderItem.createMany.mockResolvedValue({ count: 1 });

    return callback(prismaMock);
  });
}

/**
 * Creates mock inventory items with consistent structure
 */
export function createMockInventoryItems(
  items: Array<{ id: number; price: string; status?: string }>,
) {
  return items.map((item) => ({
    id: item.id,
    selling_price: new Prisma.Decimal(item.price),
    status: item.status || "in_stock",
  })) as any;
}

/**
 * Creates a mock order with consistent structure
 */
export function createMockOrder(overrides: {
  id?: number;
  user_id: number;
  total_amount: string;
  pickup_code?: string;
  status?: string;
}) {
  return {
    id: overrides.id || 1,
    user_id: overrides.user_id,
    total_amount: new Prisma.Decimal(overrides.total_amount),
    pickup_code: overrides.pickup_code || "ABCD1234",
    status: overrides.status || "PENDING_PAYMENT",
  } as any;
}
