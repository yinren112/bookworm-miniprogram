// src/tests/inventoryService.integration.test.ts - Integration Tests
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ApiError } from "../errors";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from "./globalSetup";
import { addBookToInventoryTest, createOrderTest, fulfillOrderTest } from "./test-helpers/testServices";
import { getAvailableBooks } from "../services/inventoryService";

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
        cost: 1500, // 15 yuan = 1500 cents
        selling_price: 2500, // 25 yuan = 2500 cents
      };

      // Execute: Add book to inventory
      const inventoryItem = await addBookToInventoryTest(prisma, input);

      // Assert: Check inventory item was created correctly
      expect(inventoryItem).toBeDefined();
      expect(inventoryItem.condition).toBe("NEW");
      expect(Number(inventoryItem.cost)).toBe(1500); // 15 yuan = 1500 cents
      expect(Number(inventoryItem.selling_price)).toBe(2500); // 25 yuan = 2500 cents
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
        cost: 2000, // 20 yuan = 2000 cents
        selling_price: 3500, // 35 yuan = 3500 cents
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
        cost: 1500, // 15 yuan = 1500 cents
        selling_price: 2800, // 28 yuan = 2800 cents
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
      expect(Number(secondInventoryItem.cost)).toBe(1500); // 15 yuan = 1500 cents
      expect(Number(secondInventoryItem.selling_price)).toBe(2800); // 28 yuan = 2800 cents
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

  describe("getAvailableBooks - Search with special LIKE characters", () => {
    beforeEach(async () => {
      await addBookToInventoryTest(prisma, {
        isbn13: "9780000000001",
        title: "Book with 100% guarantee",
        author: "Test Author",
        condition: "NEW",
        cost: 1000,
        selling_price: 2000,
      });
      await addBookToInventoryTest(prisma, {
        isbn13: "9780000000002",
        title: "Another C__ book",
        author: "Test Author",
        condition: "NEW",
        cost: 1000,
        selling_price: 2000,
      });
      await addBookToInventoryTest(prisma, {
        isbn13: "9780000000003",
        title: "A regular CSS book",
        author: "Another Author",
        condition: "NEW",
        cost: 1000,
        selling_price: 2000,
      });
      await addBookToInventoryTest(prisma, {
        isbn13: "9780000000004",
        title: "C++ Programming Guide",
        author: "Different Author",
        condition: "NEW",
        cost: 1500,
        selling_price: 2500,
      });
    });

    it('should find a book with a literal "%" in the title', async () => {
      const result = await getAvailableBooks(prisma, { searchTerm: "100%" });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].booksku.bookmaster.title).toBe("Book with 100% guarantee");
    });

    it('should find a book with literal "__" in the title and not treat it as a wildcard', async () => {
      const result = await getAvailableBooks(prisma, { searchTerm: "C__" });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].booksku.bookmaster.title).toBe("Another C__ book");
      // It should NOT find the 'CSS' book (which would match if __ were treated as wildcards)
      expect(result.data.some((b: any) => b.booksku.bookmaster.title === "A regular CSS book")).toBe(false);
    });

    it('should find a book with "C++" without treating "+" as a special character', async () => {
      const result = await getAvailableBooks(prisma, { searchTerm: "C++" });
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      const foundCppBook = result.data.some((b: any) => b.booksku.bookmaster.title === "C++ Programming Guide");
      expect(foundCppBook).toBe(true);
    });

    it('should handle search terms with multiple special characters', async () => {
      // Create a book with multiple special chars
      await addBookToInventoryTest(prisma, {
        isbn13: "9780000000005",
        title: "100% Complete C__ Guide",
        author: "Special Author",
        condition: "NEW",
        cost: 3000, // 30 yuan = 3000 cents
        selling_price: 4000, // 40 yuan = 4000 cents
      });

      const result = await getAvailableBooks(prisma, { searchTerm: "100% Complete C__" });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].booksku.bookmaster.title).toBe("100% Complete C__ Guide");
    });
  });
});
