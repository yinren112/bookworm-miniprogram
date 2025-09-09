// src/tests/orderService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createOrder, fulfillOrder, ItemNotAvailableError, FulfillmentError, processPaymentNotification } from '../services/orderService';
import { prismaMock } from './setup';
import { inventory_status, order_status } from '@prisma/client';

describe('Order Service', () => {

  describe('createOrder', () => {
    it('should create an order and reserve inventory items', async () => {
      const availableItem = { id: 1, status: 'in_stock' as inventory_status, selling_price: 100 };
      const userInput = { userId: 1, inventoryItemIds: [1] };

      // Mock the transaction
      const mockTransaction = {
        user: {
          upsert: vi.fn().mockResolvedValue({ id: 1, openid: 'test-openid' }),
        },
        inventoryitem: {
          findMany: vi.fn().mockResolvedValue([availableItem]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        order: {
          create: vi.fn().mockResolvedValue({ id: 1, status: 'pending_payment' as order_status, total_amount: 100 }),
        },
        orderitem: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      prismaMock.$transaction.mockImplementation((fn) => fn(mockTransaction as any));

      await createOrder(userInput);

      // Assert that the final, critical step was called
      expect(mockTransaction.inventoryitem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1] } },
        data: { status: 'reserved' },
      });
      expect(mockTransaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending_payment'
        })
      }));
    });

    it('should throw ItemNotAvailableError if an item is not in stock', async () => {
      const reservedItem = { id: 1, status: 'reserved' as inventory_status, selling_price: 100 };
      const userInput = { userId: 1, inventoryItemIds: [1] };

      // Mock the transaction
      const mockTransaction = {
        user: {
          upsert: vi.fn().mockResolvedValue({ id: 1, openid: 'test-openid' }),
        },
        inventoryitem: {
          findMany: vi.fn().mockResolvedValue([reservedItem]),
        },
      };

      prismaMock.$transaction.mockImplementation((fn) => fn(mockTransaction as any));

      // Assert that the function throws the specific error
      await expect(createOrder(userInput)).rejects.toThrow(ItemNotAvailableError);
    });
  });

  describe('fulfillOrder', () => {
    it('should complete an order and mark items as sold', async () => {
      const orderToFulfill = { 
        id: 1, 
        status: 'pending_pickup' as order_status, 
        orderitem: [{ inventory_item_id: 101 }] 
      };
      
      // Mock the transaction
      const mockTransaction = {
        order: {
          findUnique: vi.fn().mockResolvedValue(orderToFulfill),
          update: vi.fn().mockResolvedValue({ id: 1, status: 'completed' as order_status }),
        },
        inventoryitem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      prismaMock.$transaction.mockImplementation((fn) => fn(mockTransaction as any));

      await fulfillOrder('VALID_CODE');

      expect(mockTransaction.order.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed'
        })
      }));
      expect(mockTransaction.inventoryitem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [101] } },
        data: { status: 'sold' },
      });
    });

    it('should throw FulfillmentError if order is not in a fulfillable state', async () => {
      const completedOrder = { id: 1, status: 'completed' as order_status, orderitem: [] };
      
      // Mock the transaction
      const mockTransaction = {
        order: {
          findUnique: vi.fn().mockResolvedValue(completedOrder),
        },
      };

      prismaMock.$transaction.mockImplementation((fn) => fn(mockTransaction as any));
      
      await expect(fulfillOrder('ANY_CODE')).rejects.toThrow(FulfillmentError);
    });
  });

  describe('processPaymentNotification', () => {
    it('should update order status to paid on successful notification', async () => {
      const notification = { out_trade_no: 'ORDER_1_123456', amount: { total: 10000 }, trade_state: 'SUCCESS' };
      const pendingOrder = { id: 1, status: 'pending_payment' as order_status, total_amount: 100.00 };

      // Mock the transaction
      const mockTransaction = {
        order: {
          findUnique: vi.fn().mockResolvedValue(pendingOrder),
          update: vi.fn().mockResolvedValue({ ...pendingOrder, status: 'pending_pickup', paid_at: new Date() }),
        },
      };

      prismaMock.$transaction.mockImplementation((fn) => fn(mockTransaction as any));

      await processPaymentNotification(notification);

      expect(mockTransaction.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'pending_pickup', paid_at: expect.any(Date) },
      });
    });

    it('should not update order if status is not pending_payment (idempotency)', async () => {
      const notification = { out_trade_no: 'ORDER_1_123456', amount: { total: 10000 }, trade_state: 'SUCCESS' };
      const paidOrder = { id: 1, status: 'pending_pickup' as order_status, total_amount: 100.00 };

      // Mock the transaction
      const mockTransaction = {
        order: {
          findUnique: vi.fn().mockResolvedValue(paidOrder),
          update: vi.fn(),
        },
      };

      prismaMock.$transaction.mockImplementation((fn) => fn(mockTransaction as any));

      await processPaymentNotification(notification);

      // Assert that update was NOT called
      expect(mockTransaction.order.update).not.toHaveBeenCalled();
    });
  });
});