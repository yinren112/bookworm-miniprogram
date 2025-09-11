// src/services/orderService.ts (fully replaced)
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as crypto from 'crypto';
const WechatPay = require('wechatpay-node-v3');
import config from '../config';
import prisma from '../db';
import { ApiError } from '../errors';

// 通用的事务重试辅助函数
async function withTxRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e: any) {
      // 检查是否为 Prisma 的序列化失败
      if (e.code === 'P2034' || e.message?.includes('could not serialize')) {
        // 指数退避+抖动等待
        await new Promise(r => setTimeout(r, 20 * Math.pow(2, i) + Math.random() * 40));
        continue;
      }
      // 非可重试错误，立即抛出
      throw e;
    }
  }
  // 重试3次后仍失败
  throw new ApiError(409, '系统繁忙，请稍后重试', 'TX_RETRY_EXCEEDED');
}

export async function createOrder(input: { userId: number; inventoryItemIds: number[] }) {
    return withTxRetry(() => prisma.$transaction(async (tx) => {
        const itemIds = Array.from(new Set(input.inventoryItemIds));
        if (itemIds.length === 0) {
            throw new ApiError(400, '没有选择任何书籍', 'EMPTY_ITEMS');
        }

        // 1. 原子抢占：尝试将 'in_stock' 状态更新为 'reserved'
        const updateResult = await tx.inventoryitem.updateMany({
            where: {
                id: { in: itemIds },
                status: 'in_stock'
            },
            data: { status: 'reserved' }
        });

        // 2. 检查结果：如果更新的行数不等于请求的物品数量，说明有物品被别人抢先了
        if (updateResult.count !== itemIds.length) {
            // 事务会自动回滚所有更改，所以我们只需要抛出错误
            throw new ApiError(409, '部分书籍已被抢购，请重新下单', 'INSUFFICIENT_INVENTORY');
        }

        // 3. 读取已成功抢占的物品信息，用于计算总价
        const reservedItems = await tx.inventoryitem.findMany({
            where: { id: { in: itemIds } }
        });

        const totalAmount = reservedItems.reduce(
            (sum, item) => sum.add(new Prisma.Decimal(item.selling_price)),
            new Prisma.Decimal(0)
        );

        // 4. 创建订单（包含 pickup_code 重试逻辑）
        let order;
        for (let attempt = 0; attempt < 5; attempt++) {
            const pickup_code = crypto.randomBytes(5).toString('hex').toUpperCase().substring(0, 8);
            try {
                order = await tx.order.create({
                    data: {
                        user_id: input.userId,
                        status: 'PENDING_PAYMENT',
                        total_amount: totalAmount,
                        pickup_code,
                        paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15分钟后过期
                    },
                });
                break; // 成功创建订单，跳出循环
            } catch (e: any) {
                // 检查是否为 pickup_code 唯一约束冲突
                if (e.code === 'P2002' && e.meta?.target?.includes('pickup_code')) {
                    continue; // 重试生成新的 pickup_code
                }
                // 其他错误直接抛出
                throw e;
            }
        }
        
        // 如果5次重试后仍无法生成唯一的 pickup_code
        if (!order) {
            throw new ApiError(500, '无法生成唯一订单取货码', 'PICKUP_CODE_GEN_FAILED');
        }

        // 5. 创建订单项
        await tx.orderitem.createMany({
            data: reservedItems.map(item => ({
                order_id: order.id,
                inventory_item_id: item.id,
                price: item.selling_price,
            })),
        });

        return order;
    }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // 使用最高隔离级别保证一致性
    }));
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
      throw new ApiError(404, `取货码 "${pickupCode}" 无效`, 'INVALID_PICKUP_CODE');
    }
    if (order.status !== 'PENDING_PICKUP') {
      throw new ApiError(409, `此订单状态为 "${order.status}"，无法核销。订单必须已支付才能核销。`, 'ORDER_STATE_INVALID');
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

export async function generatePaymentParams(pay: any, orderId: number, userId: number) {
    return prisma.$transaction(async (tx) => {
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        if (order.user_id !== userId) throw new ApiError(403, '无权支付此订单', 'FORBIDDEN');
        if (order.status !== 'PENDING_PAYMENT') throw new ApiError(409, '订单状态不正确', 'ORDER_STATE_INVALID');

        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { openid: true } });
        
        // 创建或查找 PaymentRecord，使用精确的金额计算
        const amount_total = new Prisma.Decimal(order.total_amount).mul(100).toDecimalPlaces(0).toNumber();
        const out_trade_no = `BOOKWORM_${order.id}`;
        
        const paymentRecord = await tx.paymentRecord.upsert({
            where: { out_trade_no },
            create: {
                out_trade_no,
                order_id: order.id,
                status: 'PENDING',
                amount_total,
                appid: config.wxAppId,
                mchid: config.wxPayMchId
            },
            update: {}
        });
        
        const orderItems = await tx.orderitem.findMany({ 
            where: { order_id: orderId },
            include: { inventoryitem: { include: { booksku: { include: { bookmaster: true } } } } }
        });
        const titles = orderItems.map(i => i.inventoryitem.booksku.bookmaster.title);
        const description = titles.slice(0, 3).join('、') + (titles.length > 3 ? `等${titles.length}本书籍` : '');

        const unifiedOrderResult = await pay.transactions_jsapi({
            appid: config.wxAppId!,
            mchid: config.wxPayMchId!,
            description,
            out_trade_no,
            notify_url: config.wxPayNotifyUrl!,
            time_expire: new Date(order.paymentExpiresAt).toISOString(),
            amount: { total: amount_total, currency: 'CNY' },
            payer: { openid: user.openid }
        });

        const { prepay_id } = unifiedOrderResult as any;
        if (!prepay_id) throw new ApiError(500, '微信下单失败，未返回prepay_id', 'WECHAT_PAY_ERROR');
        
        const timeStamp = Math.floor(Date.now() / 1000).toString();
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const pkg = `prepay_id=${prepay_id}`;
        const toSign = `${config.wxAppId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;

        const paySign = pay.sign(toSign);

        return { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign };
    });
}

// NEW: Process WeChat Pay payment notification with strict idempotency
export async function processPaymentNotification(notificationData: any) {
  return prisma.$transaction(async (tx) => {
    const { 
      out_trade_no, 
      transaction_id, 
      trade_state, 
      amount, 
      payer, 
      mchid, 
      appid 
    } = notificationData;
    
    // 1. 幂等性检查 (第一道防线)
    const paymentRecord = await tx.paymentRecord.findUnique({
      where: { out_trade_no },
      include: { Order: true }
    });
    
    if (!paymentRecord || paymentRecord.status === 'SUCCESS') {
      console.log(`Payment notification for ${out_trade_no} already processed or unknown. Skipping.`);
      return paymentRecord;
    }
    
    // 2. 数据校验 (第二道防线)
    if (mchid && mchid !== config.wxPayMchId) {
      throw new ApiError(400, `商户号不匹配。期望：${config.wxPayMchId}，实际：${mchid}`, 'MCHID_MISMATCH');
    }
    
    if (appid && appid !== config.wxAppId) {
      throw new ApiError(400, `应用ID不匹配。期望：${config.wxAppId}，实际：${appid}`, 'APPID_MISMATCH');
    }
    
    if (amount.total !== paymentRecord.amount_total) {
      throw new ApiError(400, `金额不匹配。期望：${paymentRecord.amount_total}，实际：${amount.total}`, 'AMOUNT_MISMATCH');
    }
    
    // 3. 验证支付状态
    if (trade_state !== 'SUCCESS') {
      console.log(`Payment for ${out_trade_no} failed with state: ${trade_state}`);
      // 可以选择更新 PaymentRecord 状态为 FAILED
      return null;
    }
    
    // 4. 核心状态更新
    const updatedPaymentRecord = await tx.paymentRecord.update({
      where: { out_trade_no },
      data: {
        status: 'SUCCESS',
        transaction_id,
        payer_openid: payer?.openid,
        notified_at: new Date()
      }
    });
    
    // 5. 关联订单状态处理
    const order = paymentRecord.Order;
    
    // 处理"迟到支付"
    if (order.status === 'CANCELLED') {
      await tx.paymentRecord.update({
        where: { out_trade_no },
        data: { status: 'REFUND_REQUIRED' }
      });
      console.error(`CRITICAL: Payment succeeded for cancelled order ${order.id}. Marked for refund.`);
      return updatedPaymentRecord;
    }
    
    // 处理正常支付
    if (order.status === 'PENDING_PAYMENT') {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PENDING_PICKUP',
          paid_at: new Date()
        }
      });
      console.log(`Order ${order.id} successfully marked as paid`);
      return updatedPaymentRecord;
    }
    
    // 其他状态的警告处理
    console.warn(`Payment notification for order ${order.id} with unexpected status: ${order.status}`);
    return updatedPaymentRecord;
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

export async function getOrderById(orderId: number) {
  return prisma.order.findUniqueOrThrow({
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
}