// src/services/orderService.ts (fully replaced)
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import WechatPay from 'wechatpay-node-v3';
import config from '../config';
import prisma from '../db';

// ... (ItemNotAvailableError class remains the same)
export class ItemNotAvailableError extends Error {
  constructor(message: string) { super(message); this.name = 'ItemNotAvailableError'; }
}

// NEW: Custom error for fulfillment logic
export class FulfillmentError extends Error {
  constructor(message: string) { super(message); this.name = 'FulfillmentError'; }
}

export async function createOrder(input: { userId: number; inventoryItemIds: number[] }) {
  return prisma.$transaction(async (tx) => {
    // ... (user upsert logic is the same)
    const user = await tx.user.upsert({
      where: { id: input.userId },
      update: {},
      create: { id: input.userId, openid: `fake_openid_${input.userId}_${Date.now()}` }
    });

    // ... (item fetching and validation is the same)
    const items = await tx.inventoryitem.findMany({ where: { id: { in: input.inventoryItemIds } } });
    if (items.length !== input.inventoryItemIds.length) { throw new ItemNotAvailableError('One or more items do not exist.'); }
    for (const item of items) { if (item.status !== 'in_stock') { throw new ItemNotAvailableError(`Item ${item.id} is not available.`); } }

    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.selling_price.toString()), 0);

    const order = await tx.order.create({
      data: {
        user_id: user.id,
        status: 'PENDING_PAYMENT',
        total_amount: totalAmount,
        pickup_code: randomBytes(3).toString('hex').toUpperCase(),
        paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
      },
    });

    await tx.orderitem.createMany({
      data: items.map(item => ({
        order_id: order.id,
        inventory_item_id: item.id,
        price: item.selling_price,
      })),
    });

    await tx.inventoryitem.updateMany({
      where: { id: { in: input.inventoryItemIds } },
      data: { status: 'reserved' },
    });

    return order;
  });
}

export async function getOrdersByUserId(userId: number) {
  // ... (this function is unchanged)
  return prisma.order.findMany({
    where: { user_id: userId },
    include: { orderitem: { include: { inventoryitem: { include: { booksku: { include: { bookmaster: true } } } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

// NEW: Function to fulfill an order
export async function fulfillOrder(pickupCode: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Find the order by its unique pickup code.
    const order = await tx.order.findUnique({
      where: { pickup_code: pickupCode },
      include: { orderitem: true }, // Include items to update their status
    });

    // 2. Validate
    if (!order) {
      throw new FulfillmentError(`取货码 "${pickupCode}" 无效。`);
    }
    if (order.status !== 'PENDING_PICKUP') {
      throw new FulfillmentError(`此订单状态为 "${order.status}"，无法核销。订单必须已支付才能核销。`);
    }

    // 3. Update the Order status
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        completed_at: new Date(),
      },
    });

    // 4. Update the InventoryItem statuses
    const inventoryItemIds = order.orderitem.map(item => item.inventory_item_id);
    await tx.inventoryitem.updateMany({
      where: { id: { in: inventoryItemIds } },
      data: { status: 'sold' },
    });

    return updatedOrder;
  });
}

// NEW: Generate WeChat Pay payment parameters
export async function generatePaymentParams(pay: WechatPay, orderId: number, openid: string) {
  // 1. Fetch the order details
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderitem: {
        include: {
          inventoryitem: {
            include: {
              booksku: {
                include: {
                  bookmaster: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.status !== 'PENDING_PAYMENT') {
    throw new Error('Order is not in PENDING_PAYMENT status');
  }


  // 3. Generate description from order items
  const bookTitles = order.orderitem.map(item => 
    item.inventoryitem.booksku.bookmaster.title
  ).slice(0, 3); // Limit to first 3 books
  const description = bookTitles.length > 3 
    ? `${bookTitles.join('、')}等${order.orderitem.length}本书籍`
    : bookTitles.join('、');

  // 4. Call WeChat Pay unified order API
  const unifiedOrderParams = {
    appid: config.wxAppId,
    mchid: config.wxPayMchId,
    description: description,
    out_trade_no: `BOOKWORM_${order.id}`, // Simple and unique
    notify_url: config.wxPayNotifyUrl || '',
    amount: {
      total: Math.round(Number(order.total_amount) * 100), // Convert to cents
      currency: 'CNY'
    },
    payer: {
      openid: openid
    }
  };

  try {
    const result = await pay.transactions_jsapi(unifiedOrderParams);
    
    // 5. Return the result for mini-program payment
    return {
      result,
      outTradeNo: unifiedOrderParams.out_trade_no
    };
  } catch (error) {
    console.error('WeChat Pay API error:', error);
    throw new Error('Failed to generate payment parameters');
  }
}

// NEW: Process WeChat Pay payment notification
export async function processPaymentNotification(notificationData: any) {
  return prisma.$transaction(async (tx) => {
    const { out_trade_no, transaction_id, trade_state, amount } = notificationData;
    
    // 1. Validate payment success
    if (trade_state !== 'SUCCESS') {
      throw new Error(`Payment not successful. Trade state: ${trade_state}`);
    }

    // 2. Extract order ID from out_trade_no (format: BOOKWORM_{orderId})
    if (!out_trade_no.startsWith('BOOKWORM_')) {
      throw new Error(`Invalid out_trade_no format: ${out_trade_no}`);
    }
    const orderId = parseInt(out_trade_no.split('_')[1], 10);

    // 3. Find and validate the order
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { orderitem: true }
    });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // 4. Check if already processed (idempotency)
    if (order.status === 'PENDING_PICKUP') {
      console.log(`Order ${orderId} already marked as paid. Skipping.`);
      return order;
    }

    // 5. Validate order status
    if (order.status !== 'PENDING_PAYMENT') {
      throw new Error(`Invalid order status: ${order.status}. Expected: PENDING_PAYMENT`);
    }

    // 6. Validate amount (convert from cents to yuan)
    const expectedAmount = Math.round(Number(order.total_amount) * 100);
    if (amount.total !== expectedAmount) {
      throw new Error(`Amount mismatch. Expected: ${expectedAmount}, Received: ${amount.total}`);
    }

    // 7. Update order status to paid
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'PENDING_PICKUP',
        paid_at: new Date()
      }
    });

    console.log(`Order ${orderId} successfully marked as paid`);
    return updatedOrder;
  });
}

export async function getPendingPickupOrders() {
  return prisma.order.findMany({
    where: {
      status: 'PENDING_PICKUP',
    },
    include: {
      orderitem: {
        include: {
          inventoryitem: {
            include: {
              booksku: {
                include: {
                  bookmaster: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      paid_at: 'asc', // 按支付时间升序，先付钱的先备货
    },
  });
}

export async function cancelExpiredOrders() {
  return prisma.$transaction(async (tx) => {
    // 1. Find all orders that are pending payment and have expired.
    const expiredOrders = await tx.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        paymentExpiresAt: {
          lt: new Date(), // Less than the current time
        },
      },
      select: {
        id: true,
      },
    });

    if (expiredOrders.length === 0) {
      return { cancelledCount: 0 }; // Nothing to do
    }

    const expiredOrderIds = expiredOrders.map(o => o.id);
    console.log(`Found ${expiredOrderIds.length} expired orders to cancel:`, expiredOrderIds);

    // 2. Find all inventory items linked to these expired orders.
    const itemsToRelease = await tx.orderitem.findMany({
      where: {
        order_id: {
          in: expiredOrderIds,
        },
      },
      select: {
        inventory_item_id: true,
      },
    });

    const inventoryItemIdsToRelease = itemsToRelease.map(i => i.inventory_item_id);

    // 3. Update the orders' status to CANCELLED.
    await tx.order.updateMany({
      where: {
        id: {
          in: expiredOrderIds,
        },
      },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
      },
    });

    // 4. Update the inventory items' status back to in_stock.
    if (inventoryItemIdsToRelease.length > 0) {
      await tx.inventoryitem.updateMany({
        where: {
          id: {
            in: inventoryItemIdsToRelease,
          },
        },
        data: {
          status: 'in_stock',
        },
      });
    }
    
    console.log(`Cancelled ${expiredOrderIds.length} orders and released ${inventoryItemIdsToRelease.length} items back to stock.`);
    return { cancelledCount: expiredOrderIds.length };
  });
}