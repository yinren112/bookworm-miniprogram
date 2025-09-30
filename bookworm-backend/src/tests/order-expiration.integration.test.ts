// src/tests/order-expiration.integration.test.ts
// Integration test proving that expired order inventory can be reclaimed
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cancelExpiredOrders, createOrder } from "../services/orderService";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from './globalSetup';

describe("Order Expiration Integration Tests", () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  afterAll(async () => {});

  it("should cancel expired orders and release inventory", async () => {
    // Create test data
    const { userId } = await createTestUser("USER");
    const inventoryItemIds = await createTestInventoryItems(2);

    console.log("Created test user ID:", userId);
    console.log("Created inventory item IDs:", inventoryItemIds);

    // Verify the inventory items exist and are available
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { id: { in: inventoryItemIds } },
    });
    console.log("Found inventory items:", inventoryItems.map(item => ({ id: item.id, status: item.status })));

    // Create an order
    const order = await createOrder(prisma, {
      userId,
      inventoryItemIds,
    });

    // Manually set the order's paymentExpiresAt to be in the past to simulate expiration
    // Using a time that's definitely expired (more than default timeout)
    const expiredTime = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentExpiresAt: expiredTime,
        status: 'PENDING_PAYMENT'
      },
    });

    // Execute the function
    const result = await cancelExpiredOrders(prisma);

    // Verify the result - should have cancelled at least our expired order
    expect(result.cancelledCount).toBeGreaterThanOrEqual(1);

    // Verify the order was cancelled
    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe('CANCELLED');

    // Verify inventory items were released back to stock
    const updatedInventoryItems = await prisma.inventoryItem.findMany({
      where: { id: { in: inventoryItemIds } },
    });

    updatedInventoryItems.forEach((item) => {
      expect(item.status).toBe('in_stock');
      expect(item.reserved_by_order_id).toBeNull();
    });
  });
});