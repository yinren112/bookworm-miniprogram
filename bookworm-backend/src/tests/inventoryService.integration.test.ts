// src/tests/inventoryService.integration.test.ts - Integration Tests
import { describe, it, expect, beforeAll } from "vitest";
import { ApiError } from "../errors";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from "./globalSetup";
import { addBookToInventoryTest, createOrderTest, fulfillOrderTest } from "./test-helpers/testServices";

describe("Inventory Service Integration Tests", () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  describe("addBookToInventory", () => {
    it("should create a new bookMaster, sku, and inventory item for a new ISBN", async () => {
      const input = {
        isbn13: "9991234567890",
        title: "Advanced Mathematics",
        author: "John Smith",
        condition: "NEW" as const,
        cost: 15.0,
        selling_price: 25.0,
      };

      // Execute: Add book to inventory
      const inventoryItem = await addBookToInventoryTest(prisma, input);

      // Assert: Check inventory item was created correctly
      expect(inventoryItem).toBeDefined();
      expect(inventoryItem.condition).toBe("NEW");
      expect(Number(inventoryItem.cost)).toBe(15.0);
      expect(Number(inventoryItem.selling_price)).toBe(25.0);
      expect(inventoryItem.status).toBe("in_stock");

      // Assert: Check bookMaster was created
      const bookMaster = await prisma.bookMaster.findUnique({
        where: { isbn13: input.isbn13 },
      });
      expect(bookMaster).toBeDefined();
      expect(bookMaster!.title).toBe(input.title);
      expect(bookMaster!.author).toBe(input.author);

      // Assert: Check bookSku was created
      const bookSku = await prisma.bookSku.findFirst({
        where: { master_id: bookMaster!.id },
      });
      expect(bookSku).toBeDefined();
      expect(bookSku!.edition).toBe("未知版本");

      // Assert: Check inventoryItem was created with correct associations
      const inventoryFromDb = await prisma.inventoryItem.findUnique({
        where: { id: inventoryItem.id },
        include: {
          bookSku: {
            include: {
              bookMaster: true,
            },
          },
        },
      });
      expect(inventoryFromDb!.sku_id).toBe(bookSku!.id);
    });

    it("should create only a new inventory item for an existing book SKU", async () => {
      const bookData = {
        isbn13: "9991234567891",
        title: "Physics Fundamentals",
        author: "Jane Doe",
        edition: "Second Edition",
        condition: "NEW" as const,
        cost: 20.0,
        selling_price: 35.0,
      };

      // Setup: Create first book
      await addBookToInventoryTest(prisma, bookData);

      // Get initial counts
      const initialMasterCount = await prisma.bookMaster.count({
        where: { isbn13: bookData.isbn13 },
      });
      const initialSkuCount = await prisma.bookSku.count({
        where: {
          bookMaster: { isbn13: bookData.isbn13 },
          edition: bookData.edition,
        },
      });
      const initialInventoryCount = await prisma.inventoryItem.count({
        where: {
          bookSku: {
            bookMaster: { isbn13: bookData.isbn13 },
          },
        },
      });

      // Execute: Add another copy of the same book with different condition/price
      const secondBookData = {
        ...bookData,
        condition: "GOOD" as const,
        cost: 15.0,
        selling_price: 28.0,
      };

      const secondInventoryItem = await addBookToInventoryTest(prisma, secondBookData);

      // Assert: BookMaster count should remain the same
      const finalMasterCount = await prisma.bookMaster.count({
        where: { isbn13: bookData.isbn13 },
      });
      expect(finalMasterCount).toBe(initialMasterCount); // No new bookMaster

      // Assert: BookSku count should remain the same
      const finalSkuCount = await prisma.bookSku.count({
        where: {
          bookMaster: { isbn13: bookData.isbn13 },
          edition: bookData.edition,
        },
      });
      expect(finalSkuCount).toBe(initialSkuCount); // No new sku

      // Assert: InventoryItem count should increase by 1
      const finalInventoryCount = await prisma.inventoryItem.count({
        where: {
          bookSku: {
            bookMaster: { isbn13: bookData.isbn13 },
          },
        },
      });
      expect(finalInventoryCount).toBe(initialInventoryCount + 1); // One new inventory item

      // Assert: Second inventory item has correct different properties
      expect(secondInventoryItem.condition).toBe("GOOD");
      expect(Number(secondInventoryItem.cost)).toBe(15.0);
      expect(Number(secondInventoryItem.selling_price)).toBe(28.0);
    });
  });

  describe("fulfillOrder", () => {
    it("should complete the order and mark inventory as sold with a valid pickup code", async () => {
      // Setup: Create test data
      const { userId: testUserId } = await createTestUser("STAFF");
      const inventoryItemIds = await createTestInventoryItems(1);

      // Create an order with the inventory item
      const testOrder = await createOrderTest(prisma, testUserId, inventoryItemIds);

      // Manually update order and payment status to simulate "paid and ready for pickup"
      await prisma.Order.update({
        where: { id: testOrder.id },
        data: { status: "PENDING_PICKUP" },
      });

      // Create PaymentRecord to simulate successful payment
      await prisma.PaymentRecord.create({
        data: {
          order_id: testOrder.id,
          out_trade_no: `TEST_TRADE_${testOrder.id}`,
          status: "SUCCESS",
          amount_total: Math.round(Number(testOrder.total_amount) * 100), // Convert to cents
          transaction_id: "TEST_TRANSACTION_123",
        },
      });

      // Execute: Fulfill the order using pickup code
      const fulfilledOrder = await fulfillOrderTest(prisma, testOrder.pickup_code);

      // Assert: Order status should be COMPLETED
      expect(fulfilledOrder.status).toBe("COMPLETED");

      // Assert: Verify order status in database
      const orderFromDb = await prisma.Order.findUnique({
        where: { id: testOrder.id },
      });
      expect(orderFromDb!.status).toBe("COMPLETED");

      // Assert: Inventory item should be marked as sold
      const inventoryFromDb = await prisma.inventoryItem.findUnique({
        where: { id: inventoryItemIds[0] },
      });
      expect(inventoryFromDb!.status).toBe("sold");
    });

    it("should throw an error for an invalid pickup code", async () => {
      const invalidPickupCode = "INVALID123";

      // Execute & Assert: Should throw Error for invalid pickup code
      await expect(fulfillOrderTest(prisma, invalidPickupCode)).rejects.toThrow("订单不存在或状态错误");
    });
  });
});
