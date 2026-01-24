import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getOrdersByUserId } from "../services/orderService";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";

describe("Order Cursor Pagination Integration", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  const cleanupTables = async () => {
    await prisma.recommendedBookItem.deleteMany();
    await prisma.recommendedBookList.deleteMany();
    await prisma.paymentRecord.deleteMany();
    await prisma.inventoryReservation.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.acquisition.deleteMany(); // Delete Acquisition before User
    await prisma.order.deleteMany();
    await prisma.bookSku.deleteMany();
    await prisma.bookMaster.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.user.deleteMany();
  };

  afterEach(async () => {
    await cleanupTables();
  });

  it("should return first page with next cursor for subsequent fetch", async () => {
    const { userId } = await createTestUser("USER");

    const now = Date.now();

    for (let i = 0; i < 15; i++) {
      const createdAt = new Date(now - Math.floor(i / 5) * 1000);
      await prisma.order.create({
        data: {
          user_id: userId,
          status: "COMPLETED",
          total_amount: (100 + i) * 100,
          pickup_code: `PK${i.toString().padStart(6, "0")}`,
          paymentExpiresAt: new Date(now + 15 * 60 * 1000),
          completed_at: new Date(createdAt.getTime() + 500),
          createdAt,
        },
      });
    }

    const firstPage = await getOrdersByUserId(prisma, userId, { limit: 10 });

    expect(firstPage.data.length).toBe(10);
    expect(firstPage.nextCursor).toBeTruthy();

    const lastOrderFirstPage = firstPage.data[firstPage.data.length - 1];
    expect(lastOrderFirstPage).toBeDefined();
    expect(firstPage.nextCursor).toBe(
      `${lastOrderFirstPage.createdAt.toISOString()}_${lastOrderFirstPage.id}`,
    );

    const secondPage = await getOrdersByUserId(prisma, userId, {
      limit: 10,
      cursor: firstPage.nextCursor!,
    });

    expect(secondPage.data.length).toBe(5);
    expect(secondPage.nextCursor).toBeNull();

    const pageOneIds = new Set(firstPage.data.map((order) => order.id));
    secondPage.data.forEach((order) => {
      expect(pageOneIds.has(order.id)).toBe(false);
    });
  });
});
