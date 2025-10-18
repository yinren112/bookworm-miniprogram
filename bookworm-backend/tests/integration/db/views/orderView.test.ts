import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestInventoryItems,
  createTestUser,
  getPrismaClientForWorker,
} from "../../../../src/tests/globalSetup";
import {
  orderIncludeWithItems,
  orderSelectBasic,
  orderSelectPublic,
} from "../../../../src/db/views/orderView";

describe("db/views/orderView", () => {
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    await globalThis.__BOOKWORM_TRUNCATE__?.();
  });

beforeEach(async () => {
  await globalThis.__BOOKWORM_TRUNCATE__?.();
});

afterEach(async () => {
  await globalThis.__BOOKWORM_TRUNCATE__?.();
});

  it("returns the expected public shape for orders with inventory items", async () => {
    const { userId } = await createTestUser();
    const [inventoryItemId] = await createTestInventoryItems(1);

    const order = await prisma.order.create({
      data: {
        user_id: userId,
        status: "PENDING_PAYMENT",
        total_amount: 8000,
        pickup_code: "TESTCODE01",
        paymentExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        orderItem: {
          create: {
            inventory_item_id: inventoryItemId,
            price: 8000,
          },
        },
      },
    });

    const fetched = await prisma.order.findUnique({
      where: { id: order.id },
      select: orderSelectPublic,
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(order.id);
    expect(fetched!.orderItem).toHaveLength(1);
    const lineItem = fetched!.orderItem[0];
    expect(lineItem).toHaveProperty("order_id", order.id);
    expect(lineItem).not.toHaveProperty("price");
    expect(lineItem.inventoryItem).toBeDefined();
    expect(lineItem.inventoryItem).not.toHaveProperty("status");
    expect(
      lineItem.inventoryItem.bookSku.bookMaster.title,
    ).toMatch(/Test Book/);
  });

  it("supports includes with the same inventory shape", async () => {
    const { userId } = await createTestUser("STAFF");
    const [inventoryItemId] = await createTestInventoryItems(1);

    const order = await prisma.order.create({
      data: {
        user_id: userId,
        status: "PENDING_PICKUP",
        total_amount: 8000,
        pickup_code: "TESTCODE02",
        paymentExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        paid_at: new Date(),
        orderItem: {
          create: {
            inventory_item_id: inventoryItemId,
            price: 8000,
          },
        },
      },
    });

    const fetched = await prisma.order.findUnique({
      where: { id: order.id },
      include: orderIncludeWithItems,
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.orderItem).toHaveLength(1);
    expect(fetched!.orderItem[0]).not.toHaveProperty("price");
    expect(fetched!.orderItem[0].inventoryItem).toBeDefined();
    expect(
      fetched!.orderItem[0].inventoryItem.bookSku.bookMaster.isbn13,
    ).toHaveLength(13);
  });

  it("exposes only the base fields when using the basic selector", async () => {
    const { userId } = await createTestUser();
    const [inventoryItemId] = await createTestInventoryItems(1);

    const order = await prisma.order.create({
      data: {
        user_id: userId,
        status: "PENDING_PAYMENT",
        total_amount: 8000,
        pickup_code: "TESTCODE03",
        paymentExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        orderItem: {
          create: {
            inventory_item_id: inventoryItemId,
            price: 8000,
          },
        },
      },
    });

    const fetched = await prisma.order.findUnique({
      where: { id: order.id },
      select: orderSelectBasic,
    });

    expect(fetched).not.toBeNull();
    expect(fetched).not.toHaveProperty("orderItem");
    expect(fetched).toHaveProperty("pickup_code", "TESTCODE03");
  });
});
