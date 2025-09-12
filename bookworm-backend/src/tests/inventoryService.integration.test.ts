// src/tests/inventoryService.test.ts - Integration Tests
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { addBookToInventory } from '../services/inventoryService';
import { createOrder, fulfillOrder } from '../services/orderService';
import { ApiError } from '../errors';
import prisma from '../db';

describe('Inventory Service Integration Tests', () => {
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user for context
    const testUser = await prisma.user.upsert({
      where: { openid: 'test-inventory-user' },
      update: {},
      create: {
        openid: 'test-inventory-user',
        nickname: 'Test User',
        role: 'USER',
      },
    });
    testUserId = testUser.id;
  });

  afterAll(async () => {
    // Clean up test data in correct order to respect foreign key constraints:
    // PaymentRecord -> OrderItem -> Order -> User
    
    // 1. Clean up PaymentRecords for test user's orders
    await prisma.paymentRecord.deleteMany({
      where: {
        Order: {
          user_id: testUserId,
        },
      },
    });

    // 2. Clean up OrderItems for test user's orders
    await prisma.orderitem.deleteMany({
      where: {
        Order: {
          user_id: testUserId,
        },
      },
    });

    // 3. Clean up Orders for test user
    await prisma.order.deleteMany({
      where: { user_id: testUserId },
    });

    // 4. Finally, clean up test user
    await prisma.user.deleteMany({
      where: { openid: 'test-inventory-user' },
    });
  });

  beforeEach(async () => {
    // Clean up test data before each test in correct order
    // PaymentRecord -> OrderItem -> Order
    
    await prisma.paymentRecord.deleteMany({
      where: {
        Order: {
          user_id: testUserId,
        },
      },
    });
    
    await prisma.orderitem.deleteMany({
      where: {
        Order: {
          user_id: testUserId,
        },
      },
    });
    
    await prisma.order.deleteMany({
      where: { user_id: testUserId },
    });
    await prisma.inventoryitem.deleteMany({
      where: {
        booksku: {
          bookmaster: {
            isbn13: { startsWith: '999' },
          },
        },
      },
    });
    await prisma.booksku.deleteMany({
      where: {
        bookmaster: {
          isbn13: { startsWith: 'TEST-' },
        },
      },
    });
    await prisma.bookmaster.deleteMany({
      where: { isbn13: { startsWith: 'TEST-' } },
    });
  });

  describe('addBookToInventory', () => {
    it('should create a new bookmaster, sku, and inventory item for a new ISBN', async () => {
      const input = {
        isbn13: '9991234567890',
        title: 'Advanced Mathematics',
        author: 'John Smith',
        condition: 'NEW' as const,
        cost: 15.00,
        selling_price: 25.00,
      };

      // Execute: Add book to inventory
      const inventoryItem = await addBookToInventory(input);

      // Assert: Check inventory item was created correctly
      expect(inventoryItem).toBeDefined();
      expect(inventoryItem.condition).toBe('NEW');
      expect(Number(inventoryItem.cost)).toBe(15.00);
      expect(Number(inventoryItem.selling_price)).toBe(25.00);
      expect(inventoryItem.status).toBe('in_stock');

      // Assert: Check bookmaster was created
      const bookMaster = await prisma.bookmaster.findUnique({
        where: { isbn13: input.isbn13 },
      });
      expect(bookMaster).toBeDefined();
      expect(bookMaster!.title).toBe(input.title);
      expect(bookMaster!.author).toBe(input.author);

      // Assert: Check booksku was created
      const bookSku = await prisma.booksku.findFirst({
        where: { master_id: bookMaster!.id },
      });
      expect(bookSku).toBeDefined();
      expect(bookSku!.edition).toBe('default');

      // Assert: Check inventoryitem was created with correct associations
      const inventoryFromDb = await prisma.inventoryitem.findUnique({
        where: { id: inventoryItem.id },
        include: {
          booksku: {
            include: {
              bookmaster: true,
            },
          },
        },
      });
      expect(inventoryFromDb!.sku_id).toBe(bookSku!.id);
    });

    it('should create only a new inventory item for an existing book SKU', async () => {
      const bookData = {
        isbn13: '9991234567891',
        title: 'Physics Fundamentals',
        author: 'Jane Doe',
        edition: 'Second Edition',
        condition: 'NEW' as const,
        cost: 20.00,
        selling_price: 35.00,
      };

      // Setup: Create first book
      await addBookToInventory(bookData);

      // Get initial counts
      const initialMasterCount = await prisma.bookmaster.count({
        where: { isbn13: bookData.isbn13 },
      });
      const initialSkuCount = await prisma.booksku.count({
        where: {
          bookmaster: { isbn13: bookData.isbn13 },
          edition: bookData.edition,
        },
      });
      const initialInventoryCount = await prisma.inventoryitem.count({
        where: {
          booksku: {
            bookmaster: { isbn13: bookData.isbn13 },
          },
        },
      });

      // Execute: Add another copy of the same book with different condition/price
      const secondBookData = {
        ...bookData,
        condition: 'GOOD' as const,
        cost: 15.00,
        selling_price: 28.00,
      };
      
      const secondInventoryItem = await addBookToInventory(secondBookData);

      // Assert: BookMaster count should remain the same
      const finalMasterCount = await prisma.bookmaster.count({
        where: { isbn13: bookData.isbn13 },
      });
      expect(finalMasterCount).toBe(initialMasterCount); // No new bookmaster

      // Assert: BookSku count should remain the same
      const finalSkuCount = await prisma.booksku.count({
        where: {
          bookmaster: { isbn13: bookData.isbn13 },
          edition: bookData.edition,
        },
      });
      expect(finalSkuCount).toBe(initialSkuCount); // No new sku

      // Assert: InventoryItem count should increase by 1
      const finalInventoryCount = await prisma.inventoryitem.count({
        where: {
          booksku: {
            bookmaster: { isbn13: bookData.isbn13 },
          },
        },
      });
      expect(finalInventoryCount).toBe(initialInventoryCount + 1); // One new inventory item

      // Assert: Second inventory item has correct different properties
      expect(secondInventoryItem.condition).toBe('GOOD');
      expect(Number(secondInventoryItem.cost)).toBe(15.00);
      expect(Number(secondInventoryItem.selling_price)).toBe(28.00);
    });
  });

  describe('fulfillOrder', () => {
    let testOrder: any;
    let testInventoryItem: any;
    let pickupCode: string;

    beforeEach(async () => {
      // Setup: Create a book and add it to inventory
      testInventoryItem = await addBookToInventory({
        isbn13: '9991234567892',
        title: 'Test Book for Orders',
        author: 'Test Author',
        condition: 'NEW',
        cost: 10.00,
        selling_price: 20.00,
      });

      // Create an order with the inventory item
      testOrder = await createOrder({
        userId: testUserId,
        inventoryItemIds: [testInventoryItem.id],
      });

      pickupCode = testOrder.pickup_code;

      // Manually update order and payment status to simulate "paid and ready for pickup"
      await prisma.order.update({
        where: { id: testOrder.id },
        data: { status: 'PENDING_PICKUP' },
      });

      // Create PaymentRecord to simulate successful payment
      await prisma.paymentRecord.create({
        data: {
          order_id: testOrder.id,
          out_trade_no: `TEST_TRADE_${testOrder.id}`,
          status: 'SUCCESS',
          amount_total: Math.round(Number(testOrder.total_amount) * 100), // Convert to cents
          transaction_id: 'TEST_TRANSACTION_123',
        },
      });
    });

    it('should complete the order and mark inventory as sold with a valid pickup code', async () => {
      // Execute: Fulfill the order using pickup code
      const fulfilledOrder = await fulfillOrder(pickupCode);

      // Assert: Order status should be COMPLETED
      expect(fulfilledOrder.status).toBe('COMPLETED');

      // Assert: Verify order status in database
      const orderFromDb = await prisma.order.findUnique({
        where: { id: testOrder.id },
      });
      expect(orderFromDb!.status).toBe('COMPLETED');

      // Assert: Inventory item should be marked as sold
      const inventoryFromDb = await prisma.inventoryitem.findUnique({
        where: { id: testInventoryItem.id },
      });
      expect(inventoryFromDb!.status).toBe('sold');
    });

    it('should throw an error for an invalid pickup code', async () => {
      const invalidPickupCode = 'INVALID123';

      // Execute & Assert: Should throw ApiError with correct error code
      await expect(fulfillOrder(invalidPickupCode)).rejects.toThrow(ApiError);
      
      try {
        await fulfillOrder(invalidPickupCode);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).errorCode).toBe('INVALID_PICKUP_CODE');
        expect((error as ApiError).statusCode).toBe(404);
      }

      // Assert: Original order and inventory should remain unchanged
      const orderFromDb = await prisma.order.findUnique({
        where: { id: testOrder.id },
      });
      expect(orderFromDb!.status).toBe('PENDING_PICKUP'); // Still pending

      const inventoryFromDb = await prisma.inventoryitem.findUnique({
        where: { id: testInventoryItem.id },
      });
      expect(inventoryFromDb!.status).toBe('reserved'); // Still reserved, not sold
    });
  });
});