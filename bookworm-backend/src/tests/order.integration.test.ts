// src/tests/orderService.integration.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../index';
import prisma from '../db';
import { User, bookmaster, booksku, inventoryitem } from '@prisma/client';
import { createSigner } from 'fast-jwt';
import config from '../config';
import { FastifyInstance } from 'fastify';

describe('POST /api/orders/create - Integration Test', () => {
  let app: FastifyInstance;
  let user: User;
  let bookItem: inventoryitem;
  let token: string;

  beforeAll(async () => {
    // Build the Fastify app
    app = await buildApp();

    // 1. Seed the database with necessary data - use upsert to handle existing users
    user = await prisma.user.upsert({
      where: { openid: 'integration-test-user' },
      create: { openid: 'integration-test-user' },
      update: {},
    });
    
    const master = await prisma.bookmaster.upsert({
      where: { isbn13: '999-INT-TEST' },
      create: { isbn13: '999-INT-TEST', title: 'Integration Test Book' },
      update: {},
    });
    const sku = await prisma.booksku.upsert({
      where: { 
        master_id_edition: {
          master_id: master.id,
          edition: '1st'
        }
      },
      create: { master_id: master.id, edition: '1st' },
      update: {},
    });
    
    // For inventory item, we want a fresh one for each test run
    // First clean up any existing items for this SKU
    await prisma.inventoryitem.deleteMany({
      where: { sku_id: sku.id }
    });
    
    bookItem = await prisma.inventoryitem.create({
      data: {
        sku_id: sku.id,
        condition: 'NEW',
        cost: 10,
        selling_price: 20,
        status: 'in_stock',
      },
    });

    // 2. Generate a valid token for the user
    const signer = createSigner({ key: config.JWT_SECRET! });
    token = await signer({ userId: user.id, openid: user.openid });
  });

  afterEach(async () => {
    // Clean up created records to keep tests isolated
    await prisma.orderitem.deleteMany({});
    await prisma.order.deleteMany({});
    // Reset inventory item status
    await prisma.inventoryitem.update({
      where: { id: bookItem.id },
      data: { status: 'in_stock', reserved_by_order_id: null },
    });
  });

  it('should successfully create an order and reserve the inventory item', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/orders/create',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        inventoryItemIds: [bookItem.id],
      },
    });

    expect(response.statusCode).toBe(201);
    const order = JSON.parse(response.payload);
    expect(order.user_id).toBe(user.id);
    expect(order.total_amount).toBe('20');

    // VERIFY THE DATABASE STATE
    const dbItem = await prisma.inventoryitem.findUnique({ where: { id: bookItem.id } });
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    
    expect(dbItem).toBeDefined();
    expect(dbItem?.status).toBe('reserved');
    expect(dbItem?.reserved_by_order_id).toBe(order.id);
    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe('PENDING_PAYMENT');
  });
});